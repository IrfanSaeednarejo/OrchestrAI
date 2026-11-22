/**
 * server/scripts/run-retrieval-eval.ts
 *
 * Deterministic retrieval evaluation runner for the 263-query golden dataset (v2).
 * Evaluates both Scoped (domain+topic) and Unscoped (global corpus) retrieval
 * across the 66-chunk active knowledge base.
 *
 * Enforces mandatory on-disk query embedding cache to protect Gemini API quota.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from '../src/persistence/db/client.js';
import {
  knowledgeDocVersions,
  type KnowledgeDomain,
} from '../src/persistence/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  searchDenseScoped,
  searchSparseScoped,
  type KnowledgeSearchRow,
} from '../src/persistence/repositories/knowledge.repository.js';
import { fuseRrf } from '../src/knowledge/rrf-reranker.js';
import { config } from '../src/shared/config.js';

// --- Configuration & Paths ---
const SCRIPT_DIR = import.meta.dirname;
const CACHE_DIR = path.resolve(SCRIPT_DIR, '.embed-cache');
const GOLDEN_PATH = path.resolve(SCRIPT_DIR, '../../eval/knowledge-golden-dataset.v2.json');
const RESULTS_DIR = path.resolve(SCRIPT_DIR, '../../benchmarks/results');

const EMBEDDING_MODEL = 'gemini-embedding-001';
const TASK_TYPE = 'RETRIEVAL_QUERY';
const EMBEDDING_DIMENSIONS = 768;
const MAX_PROJECTED_MISSES = 400;

// Ensure directories exist
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(RESULTS_DIR, { recursive: true });

// --- Types ---
interface GoldenQuery {
  id: string;
  query: string;
  doc: string | null;
  answerable: boolean;
  difficulty: 'keyword' | 'paraphrase' | 'hard' | 'negative';
  variant_type: 'paraphrase' | 'messy' | 'negative';
  variant_of: string | null;
  gold_chunk_ids: string[];
  status: 'active' | 'excluded' | 'pending_pilot_scale';
}

interface GoldenDatasetFile {
  dataset_version: string;
  built_at: string;
  corpus_chunk_count: number;
  seed_count: number;
  active_with_gold: number;
  queries: GoldenQuery[];
}

interface QueryEvalResult {
  queryId: string;
  query: string;
  doc: string | null;
  domain: string | null;
  topic: string | null;
  difficulty: string;
  variantType: string;
  answerable: boolean;
  goldChunkIds: string[];
  retrievedChunkIds: string[];
  retrievedSections: string[];
  hitAt1: boolean;
  hitAt3: boolean;
  recallAt3: number;
  mrr: number;
  topSimilarity: number;
  topRelevanceScore: number;
  searchMs: number;
}

interface ModeRunSummary {
  mode: 'scoped' | 'unscoped';
  date: string;
  wallTimeMs: number;
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  results: QueryEvalResult[];
  negativeResults: QueryEvalResult[];
}

// --- Gemini Client & Embedding Cache ---
const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

let globalApiCalls = 0;
let globalCacheHits = 0;
let globalCacheMisses = 0;

function computeCacheKey(model: string, taskType: string, text: string): string {
  return crypto.createHash('sha256').update(model + taskType + text).digest('hex');
}

function getCacheFilePath(text: string): string {
  const key = computeCacheKey(EMBEDDING_MODEL, TASK_TYPE, text);
  return path.resolve(CACHE_DIR, `${key}.json`);
}

function isCached(text: string): boolean {
  return fs.existsSync(getCacheFilePath(text));
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 1000): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      const errCode = (err as { status?: number; code?: string })?.status
        ?? (err as { code?: string })?.code
        ?? (err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60));
      console.warn(`[Gemini Retry] attempt=${attempt} delay=${delay}ms err=${errCode}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('RETRY_EXHAUSTED');
}

async function getOrFetchEmbedding(text: string): Promise<number[]> {
  const cachePath = getCacheFilePath(text);

  if (fs.existsSync(cachePath)) {
    globalCacheHits++;
    const content = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return content.embedding;
  }

  // Cache miss -> fetch from Gemini API
  globalCacheMisses++;
  globalApiCalls++;

  const response = await retryWithBackoff(async () => {
    return await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: TASK_TYPE,
      },
    });
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Invalid embedding returned for "${text}": expected ${EMBEDDING_DIMENSIONS} floats, got ${values?.length}`);
  }

  // Persist to cache
  const cachePayload = {
    model: EMBEDDING_MODEL,
    taskType: TASK_TYPE,
    text,
    embedding: values,
    cached_at: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(cachePayload) + '\n', 'utf8');

  // Gentle pacing for API rate limit protection
  await new Promise((resolve) => setTimeout(resolve, 200));

  return values;
}

// --- Database Unscoped Retrieval Helpers ---
async function searchDenseUnscoped(
  embedding: number[],
  topK: number
): Promise<KnowledgeSearchRow[]> {
  const limitCandidates = topK * 3;
  const embeddingJson = JSON.stringify(embedding);

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL hnsw.iterative_scan = relaxed_order;
      SET LOCAL hnsw.ef_search = 100;
      SET LOCAL hnsw.max_scan_tuples = 40000;
    `);

    const result = await tx.execute(sql`
      SELECT 
        c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
        v.version, v.effective_date AS "effectiveDate",
        (c.embedding <=> ${embeddingJson}::vector) AS distance
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT ${limitCandidates};
    `);

    return result.rows as unknown as KnowledgeSearchRow[];
  });
}

async function searchSparseUnscoped(
  queryText: string,
  topK: number
): Promise<KnowledgeSearchRow[]> {
  const limitCandidates = topK * 3;

  const result = await db.execute(sql`
    SELECT 
      c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
      v.version, v.effective_date AS "effectiveDate",
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${queryText})) AS rank
    FROM knowledge_chunks c
    JOIN knowledge_doc_versions v ON c.version_id = v.id
    WHERE c.status = 'active'
      AND c.search_vector @@ websearch_to_tsquery('english', ${queryText})
    ORDER BY rank DESC
    LIMIT ${limitCandidates};
  `);

  return result.rows as unknown as KnowledgeSearchRow[];
}

// --- Mathematical Helpers: Wilson 95% Confidence Interval ---
export interface WilsonCIResult {
  p: number;
  lower: number;
  upper: number;
  formatted: string;
  center: number;
  spread: number;
  numeratorStr: string;
  denominatorStr: string;
}

export function computeWilson95(x: number, n: number): WilsonCIResult {
  if (n === 0) {
    return {
      p: 0,
      lower: 0,
      upper: 0,
      formatted: '0.00% [0.00%, 0.00%]',
      center: 0,
      spread: 0,
      numeratorStr: '0.0000',
      denominatorStr: '1.0000',
    };
  }

  const z = 1.959964; // 95% confidence standard normal quantile
  const z2 = z * z;
  const p = x / n;

  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;

  const lower = Math.max(0, center - spread);
  const upper = Math.min(1, center + spread);

  const numPart1 = p + z2 / (2 * n);
  const numPart2 = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return {
    p,
    lower,
    upper,
    formatted: `${(p * 100).toFixed(1)}% [${(lower * 100).toFixed(1)}%, ${(upper * 100).toFixed(1)}%]`,
    center,
    spread,
    numeratorStr: `${numPart1.toFixed(4)} ± ${numPart2.toFixed(4)}`,
    denominatorStr: denom.toFixed(4),
  };
}

// --- Metrics Aggregation ---
interface AggregateBucket {
  name: string;
  n: number;
  hitAt1Count: number;
  hitAt1Rate: number;
  hitAt3Count: number;
  hitAt3Rate: number;
  recallAt3Mean: number;
  mrrMean: number;
  searchMsMean: number;
  searchMsP50: number;
  wilsonCI: string;
}

function computeBucketMetrics(name: string, items: QueryEvalResult[]): AggregateBucket {
  const n = items.length;
  if (n === 0) {
    return {
      name,
      n: 0,
      hitAt1Count: 0,
      hitAt1Rate: 0,
      hitAt3Count: 0,
      hitAt3Rate: 0,
      recallAt3Mean: 0,
      mrrMean: 0,
      searchMsMean: 0,
      searchMsP50: 0,
      wilsonCI: 'N/A',
    };
  }

  const hitAt1Count = items.filter((r) => r.hitAt1).length;
  const hitAt3Count = items.filter((r) => r.hitAt3).length;
  const recallSum = items.reduce((acc, r) => acc + r.recallAt3, 0);
  const mrrSum = items.reduce((acc, r) => acc + r.mrr, 0);
  const searchMsSum = items.reduce((acc, r) => acc + r.searchMs, 0);

  const sortedMs = [...items.map((r) => r.searchMs)].sort((a, b) => a - b);
  const searchMsP50 = sortedMs[Math.floor(n * 0.5)] ?? 0;

  let wilsonCI = 'n < 30';
  if (n >= 30) {
    const ci = computeWilson95(hitAt3Count, n);
    wilsonCI = ci.formatted;
  }

  return {
    name,
    n,
    hitAt1Count,
    hitAt1Rate: Number((hitAt1Count / n).toFixed(4)),
    hitAt3Count,
    hitAt3Rate: Number((hitAt3Count / n).toFixed(4)),
    recallAt3Mean: Number((recallSum / n).toFixed(4)),
    mrrMean: Number((mrrSum / n).toFixed(4)),
    searchMsMean: Number((searchMsSum / n).toFixed(2)),
    searchMsP50: Number(searchMsP50.toFixed(2)),
    wilsonCI,
  };
}

// --- Main Runner ---
async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  console.log('='.repeat(78));
  console.log(`  OrchestrAI: Deterministic Retrieval Evaluation Runner (Prompt 4)`);
  console.log(`  Date: ${runDate} | Target DB: PostgreSQL + pgvector (66 active chunks)`);
  console.log('='.repeat(78));

  // 1. Load active document versions from DB
  const dbDocVersions = await db
    .select({
      docId: knowledgeDocVersions.docId,
      domain: knowledgeDocVersions.domain,
      topic: knowledgeDocVersions.topic,
    })
    .from(knowledgeDocVersions)
    .where(eq(knowledgeDocVersions.status, 'active'));

  const docToScope = new Map<string, { domain: KnowledgeDomain; topic: string }>();
  for (const row of dbDocVersions) {
    docToScope.set(row.docId, { domain: row.domain as KnowledgeDomain, topic: row.topic });
  }
  console.log(`Loaded ${docToScope.size} active document versions from PostgreSQL.`);

  // 2. Load golden dataset
  if (!fs.existsSync(GOLDEN_PATH)) {
    throw new Error(`Golden dataset not found at ${GOLDEN_PATH}`);
  }
  const goldenData: GoldenDatasetFile = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  console.log(`Loaded golden dataset version: ${goldenData.dataset_version} (${goldenData.queries.length} total queries)`);

  const activeQueries = goldenData.queries.filter((q) => q.status === 'active');
  const answerableQueries = activeQueries.filter((q) => q.answerable);
  const negativeQueries = activeQueries.filter((q) => !q.answerable);

  console.log(`Active queries: ${activeQueries.length} (Answerable: ${answerableQueries.length}, Negatives: ${negativeQueries.length})`);

  // Check for any unflagged queries missing gold
  const missingGoldErrors: GoldenQuery[] = [];
  for (const q of answerableQueries) {
    if (!q.gold_chunk_ids || q.gold_chunk_ids.length === 0) {
      missingGoldErrors.push(q);
    }
  }

  if (missingGoldErrors.length > 0) {
    console.error(`LABELING ERROR: ${missingGoldErrors.length} answerable queries have empty gold_chunk_ids:`);
    for (const err of missingGoldErrors) {
      console.error(`  - ${err.id} (${err.doc}): "${err.query}"`);
    }
    throw new Error('Aborting: Found active answerable queries with missing gold labels.');
  }

  // 3. Mandatory Pre-Run Quota Projection
  console.log('\n--- Pre-Run Quota & Cache Inspection ---');
  let projectedMisses = 0;
  for (const q of activeQueries) {
    if (!isCached(q.query)) {
      projectedMisses++;
    }
  }

  console.log(`Total active queries to embed : ${activeQueries.length}`);
  console.log(`Already cached on disk        : ${activeQueries.length - projectedMisses}`);
  console.log(`Projected cache-miss count    : ${projectedMisses}`);
  console.log(`Projected misses exceed 400?  : ${projectedMisses > MAX_PROJECTED_MISSES ? 'YES (EXCEEDED)' : 'NO (SAFE)'}`);

  if (projectedMisses > MAX_PROJECTED_MISSES) {
    console.error(`\nSTOP: Projected cache misses (${projectedMisses}) exceed the safe daily threshold of ${MAX_PROJECTED_MISSES}.`);
    console.error(`Evaluation aborted to prevent Gemini API quota exhaustion.`);
    process.exit(1);
  }

  // Helper to execute single query in given mode
  async function evaluateQuery(
    q: GoldenQuery,
    mode: 'scoped' | 'unscoped'
  ): Promise<QueryEvalResult> {
    const embedding = await getOrFetchEmbedding(q.query);
    const scope = q.doc ? docToScope.get(q.doc) : null;

    const t0 = performance.now();
    let denseHits: KnowledgeSearchRow[];
    let sparseHits: KnowledgeSearchRow[];

    if (mode === 'scoped') {
      if (scope) {
        [denseHits, sparseHits] = await Promise.all([
          searchDenseScoped(embedding, scope.domain, scope.topic, 3),
          searchSparseScoped(q.query, scope.domain, scope.topic, 3),
        ]);
      } else {
        // Fallback for queries without doc: run unscoped
        [denseHits, sparseHits] = await Promise.all([
          searchDenseUnscoped(embedding, 3),
          searchSparseUnscoped(q.query, 3),
        ]);
      }
    } else {
      // Unscoped mode across full 66-chunk corpus
      [denseHits, sparseHits] = await Promise.all([
        searchDenseUnscoped(embedding, 3),
        searchSparseUnscoped(q.query, 3),
      ]);
    }

    const fused = fuseRrf(denseHits, sparseHits, 60, 3);
    const searchMs = performance.now() - t0;

    const denseDistanceMap = new Map<string, number>();
    for (const d of denseHits) {
      if (d.distance !== undefined) {
        denseDistanceMap.set(d.id, Number(d.distance));
      }
    }

    const topHits = fused.map((f) => {
      const dist = denseDistanceMap.get(f.id);
      const sim = dist !== undefined ? 1 - dist : f.rrfScore;
      return {
        id: f.id,
        domain: f.domain,
        topic: f.topic,
        sectionPath: f.sectionPath,
        similarity: sim,
        relevanceScore: f.rrfScore,
      };
    });

    const retrievedChunkIds = topHits.map((h) => h.id);
    const retrievedSections = topHits.map((h) => h.sectionPath || '');
    const top1 = topHits[0];
    const topSimilarity = top1 ? Number(top1.similarity.toFixed(4)) : 0;
    const topRelevanceScore = top1 ? Number(top1.relevanceScore.toFixed(6)) : 0;

    let hitAt1 = false;
    let hitAt3 = false;
    let recallAt3 = 0;
    let mrr = 0;

    if (q.answerable) {
      hitAt1 = top1 ? q.gold_chunk_ids.includes(top1.id) : false;
      hitAt3 = topHits.some((h) => q.gold_chunk_ids.includes(h.id));

      const matchedCount = q.gold_chunk_ids.filter((gid) => retrievedChunkIds.includes(gid)).length;
      recallAt3 = q.gold_chunk_ids.length > 0 ? matchedCount / q.gold_chunk_ids.length : 0;

      const firstRank = retrievedChunkIds.findIndex((id) => q.gold_chunk_ids.includes(id)) + 1;
      mrr = firstRank > 0 ? 1 / firstRank : 0;
    }

    return {
      queryId: q.id,
      query: q.query,
      doc: q.doc,
      domain: scope?.domain ?? null,
      topic: scope?.topic ?? null,
      difficulty: q.difficulty,
      variantType: q.variant_type,
      answerable: q.answerable,
      goldChunkIds: q.gold_chunk_ids,
      retrievedChunkIds,
      retrievedSections,
      hitAt1,
      hitAt3,
      recallAt3,
      mrr,
      topSimilarity,
      topRelevanceScore,
      searchMs: Number(searchMs.toFixed(2)),
    };
  }

  // --- Run Mode Function ---
  async function runMode(mode: 'scoped' | 'unscoped'): Promise<ModeRunSummary> {
    console.log(`\n>>> Starting Execution for Mode: ${mode.toUpperCase()} <<<`);
    const modeStart = performance.now();
    const modeStartHits = globalCacheHits;
    const modeStartMisses = globalCacheMisses;
    const modeStartCalls = globalApiCalls;

    const results: QueryEvalResult[] = [];
    const negativeResults: QueryEvalResult[] = [];

    // 1. Answerable queries
    let count = 0;
    for (const q of answerableQueries) {
      count++;
      const res = await evaluateQuery(q, mode);
      results.push(res);
      if (count % 50 === 0 || count === answerableQueries.length) {
        console.log(`  [${mode}] Answerable evaluated: ${count}/${answerableQueries.length}...`);
      }
    }

    // 2. Negative queries
    for (const q of negativeQueries) {
      const res = await evaluateQuery(q, mode);
      negativeResults.push(res);
    }

    const wallTimeMs = Math.round(performance.now() - modeStart);
    const modeHits = globalCacheHits - modeStartHits;
    const modeMisses = globalCacheMisses - modeStartMisses;
    const modeCalls = globalApiCalls - modeStartCalls;

    console.log(`Mode ${mode.toUpperCase()} finished in ${(wallTimeMs / 1000).toFixed(2)}s.`);
    console.log(`  API Calls: ${modeCalls} | Cache Hits: ${modeHits} | Cache Misses: ${modeMisses}`);

    return {
      mode,
      date: runDate,
      wallTimeMs,
      totalQueries: results.length + negativeResults.length,
      cacheHits: modeHits,
      cacheMisses: modeMisses,
      apiCalls: modeCalls,
      results,
      negativeResults,
    };
  }

  // Run both Scoped and Unscoped modes
  const scopedSummary = await runMode('scoped');
  const unscopedSummary = await runMode('unscoped');

  // --- Compute Abstention for Negatives ---
  // In RRF fusion: positive queries typically have dense + sparse matches (rrfScore ~ 0.032),
  // whereas negative queries only match dense vectors with no keyword matches (rrfScore <= 0.01639).
  // Rule: top-1 score is not in the top decile of positive-query scores.
  // We compute the 90th percentile of positive RRF scores (and 10th percentile for full transparency).
  function analyzeNegatives(modeSummary: ModeRunSummary) {
    const positiveScores = modeSummary.results.map((r) => r.topRelevanceScore).sort((a, b) => a - b);
    const p10Score = positiveScores[Math.floor(positiveScores.length * 0.10)] ?? 0;
    const p90Score = positiveScores[Math.floor(positiveScores.length * 0.90)] ?? 0;
    const medianScore = positiveScores[Math.floor(positiveScores.length * 0.50)] ?? 0;

    // Default cosine threshold check as well
    const cosineThreshold = 0.5;

    // Rule A: Rank-based P90 abstention (score not in top decile of positive queries, i.e., score < P90)
    const abstainedByRrfP90 = modeSummary.negativeResults.filter((r) => r.topRelevanceScore < p90Score).length;
    // Rule B: Rank-based P10 abstention (score below bottom decile of positive queries, i.e., score < P10)
    const abstainedByRrfP10 = modeSummary.negativeResults.filter((r) => r.topRelevanceScore < p10Score).length;
    // Rule C: Cosine similarity < 0.5
    const abstainedByCosine = modeSummary.negativeResults.filter((r) => r.topSimilarity < cosineThreshold).length;

    return {
      totalNegatives: modeSummary.negativeResults.length,
      p10Score,
      p90Score,
      medianScore,
      abstainedByRrfP90,
      abstentionRateRrfP90: abstainedByRrfP90 / modeSummary.negativeResults.length,
      fpRateRrfP90: 1 - abstainedByRrfP90 / modeSummary.negativeResults.length,
      abstainedByRrfP10,
      abstentionRateRrfP10: abstainedByRrfP10 / modeSummary.negativeResults.length,
      fpRateRrfP10: 1 - abstainedByRrfP10 / modeSummary.negativeResults.length,
      abstainedByCosine,
      abstentionRateCosine: abstainedByCosine / modeSummary.negativeResults.length,
      fpRateCosine: 1 - abstainedByCosine / modeSummary.negativeResults.length,
    };
  }

  const scopedNegs = analyzeNegatives(scopedSummary);
  const unscopedNegs = analyzeNegatives(unscopedSummary);

  // --- Build Aggregations ---
  function buildAggregations(results: QueryEvalResult[]) {
    // 1. Overall
    const overall = computeBucketMetrics('Overall (All Active Answerable)', results);

    // 2. By difficulty
    const difficulties = ['keyword', 'paraphrase', 'hard'] as const;
    const byDifficulty = difficulties.map((diff) =>
      computeBucketMetrics(`Difficulty: ${diff}`, results.filter((r) => r.difficulty === diff))
    );

    // 3. By doc_id
    const docs = Array.from(new Set(results.map((r) => r.doc).filter(Boolean))) as string[];
    docs.sort();
    const byDoc = docs.map((d) => computeBucketMetrics(d, results.filter((r) => r.doc === d)));

    // 4. By variant_type
    const variants = ['paraphrase', 'messy'] as const;
    const byVariant = variants.map((v) =>
      computeBucketMetrics(`Variant: ${v}`, results.filter((r) => r.variantType === v))
    );

    return { overall, byDifficulty, byDoc, byVariant };
  }

  const scopedAggs = buildAggregations(scopedSummary.results);
  const unscopedAggs = buildAggregations(unscopedSummary.results);

  // --- Save Raw Per-Query JSON Files ---
  const scopedJsonPath = path.resolve(RESULTS_DIR, `retrieval-eval-v2-scoped-${runDate}.json`);
  const unscopedJsonPath = path.resolve(RESULTS_DIR, `retrieval-eval-v2-unscoped-${runDate}.json`);

  const scopedJsonContent = {
    metadata: {
      mode: 'scoped',
      evalSetVersion: goldenData.dataset_version,
      generatedAt: new Date().toISOString(),
      embeddingModel: EMBEDDING_MODEL,
      taskType: TASK_TYPE,
      corpusChunkCount: 66,
      totalQueriesEvaluated: scopedSummary.totalQueries,
      activeAnswerable: scopedSummary.results.length,
      unanswerableNegatives: scopedSummary.negativeResults.length,
      wallTimeMs: scopedSummary.wallTimeMs,
      cacheHits: scopedSummary.cacheHits,
      cacheMisses: scopedSummary.cacheMisses,
      apiCalls: scopedSummary.apiCalls,
    },
    aggregates: scopedAggs,
    negativesAnalysis: scopedNegs,
    queries: [...scopedSummary.results, ...scopedSummary.negativeResults],
  };

  const unscopedJsonContent = {
    metadata: {
      mode: 'unscoped',
      evalSetVersion: goldenData.dataset_version,
      generatedAt: new Date().toISOString(),
      embeddingModel: EMBEDDING_MODEL,
      taskType: TASK_TYPE,
      corpusChunkCount: 66,
      totalQueriesEvaluated: unscopedSummary.totalQueries,
      activeAnswerable: unscopedSummary.results.length,
      unanswerableNegatives: unscopedSummary.negativeResults.length,
      wallTimeMs: unscopedSummary.wallTimeMs,
      cacheHits: unscopedSummary.cacheHits,
      cacheMisses: unscopedSummary.cacheMisses,
      apiCalls: unscopedSummary.apiCalls,
    },
    aggregates: unscopedAggs,
    negativesAnalysis: unscopedNegs,
    queries: [...unscopedSummary.results, ...unscopedSummary.negativeResults],
  };

  fs.writeFileSync(scopedJsonPath, JSON.stringify(scopedJsonContent, null, 2) + '\n', 'utf8');
  fs.writeFileSync(unscopedJsonPath, JSON.stringify(unscopedJsonContent, null, 2) + '\n', 'utf8');
  console.log(`\nSaved raw per-query JSON results to:`);
  console.log(`  - ${scopedJsonPath}`);
  console.log(`  - ${unscopedJsonPath}`);

  // --- Generate Markdown Summary Report ---
  const overallWilsonScoped = computeWilson95(scopedAggs.overall.hitAt3Count, scopedAggs.overall.n);
  const overallWilsonUnscoped = computeWilson95(unscopedAggs.overall.hitAt3Count, unscopedAggs.overall.n);

  let md = `# OrchestrAI: Retrieval Evaluation Report (v2)

**Execution Date:** ${runDate}  
**Corpus:** 66 active chunks across 12 policy/FAQ documents in PostgreSQL (\`knowledge_chunks\`)  
**Evaluator Dataset:** \`eval/knowledge-golden-dataset.v2.json\` (263 active: 249 answerable + 14 negatives; 39 excluded)  
**Embedding Model:** \`${EMBEDDING_MODEL}\` (768-dim, taskType \`${TASK_TYPE}\`)  
**Cache Location:** \`scripts/.embed-cache/\`  

---

## 1. Execution Telemetry & Cache Performance

| Metric | Scoped Mode | Unscoped Mode | Total |
|---|---|---|---|
| Total Queries Evaluated | ${scopedSummary.totalQueries} | ${unscopedSummary.totalQueries} | ${scopedSummary.totalQueries + unscopedSummary.totalQueries} |
| Answerable Queries ($n$) | ${scopedSummary.results.length} | ${unscopedSummary.results.length} | ${scopedSummary.results.length} distinct |
| Negative Queries ($n$) | ${scopedSummary.negativeResults.length} | ${unscopedSummary.negativeResults.length} | ${scopedSummary.negativeResults.length} distinct |
| Cache Hits | ${scopedSummary.cacheHits} | ${unscopedSummary.cacheHits} | ${globalCacheHits} |
| Cache Misses | ${scopedSummary.cacheMisses} | ${unscopedSummary.cacheMisses} | ${globalCacheMisses} |
| Total Gemini API Calls | ${scopedSummary.apiCalls} | ${unscopedSummary.apiCalls} | ${globalApiCalls} |
| Cache-Hit Rate | ${((scopedSummary.cacheHits / (scopedSummary.cacheHits + scopedSummary.cacheMisses || 1)) * 100).toFixed(1)}% | ${((unscopedSummary.cacheHits / (unscopedSummary.cacheHits + unscopedSummary.cacheMisses || 1)) * 100).toFixed(1)}% | ${((globalCacheHits / (globalCacheHits + globalCacheMisses || 1)) * 100).toFixed(1)}% |
| Wall-Clock Time | ${(scopedSummary.wallTimeMs / 1000).toFixed(2)}s | ${(unscopedSummary.wallTimeMs / 1000).toFixed(2)}s | ${((scopedSummary.wallTimeMs + unscopedSummary.wallTimeMs) / 1000).toFixed(2)}s |

---

## 2. Confidence Intervals (Wilson 95% Score Interval)

Formula:
$$\\hat{p} = \\frac{x}{n}$$
$$\\text{CI}_{95\\%} = \\frac{\\hat{p} + \\frac{z^2}{2n} \\pm z \\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n} + \\frac{z^2}{4n^2}}}{1 + \\frac{z^2}{n}} \\quad (z = 1.959964, z^2 = 3.8416)$$

### Overall hit@3 Confidence Intervals:
- **Scoped Mode ($n=249$):**
  - Numerator: $\\hat{p} + \\frac{z^2}{2n} = ${overallWilsonScoped.numeratorStr}$
  - Denominator: $1 + \\frac{z^2}{n} = ${overallWilsonScoped.denominatorStr}$
  - Point Estimate: $\\hat{p} = ${(overallWilsonScoped.p * 100).toFixed(2)}\\%$ (${scopedAggs.overall.hitAt3Count}/${scopedAggs.overall.n})
  - **Wilson 95% CI:** **${overallWilsonScoped.formatted}**
- **Unscoped Mode ($n=249$):**
  - Numerator: $\\hat{p} + \\frac{z^2}{2n} = ${overallWilsonUnscoped.numeratorStr}$
  - Denominator: $1 + \\frac{z^2}{n} = ${overallWilsonUnscoped.denominatorStr}$
  - Point Estimate: $\\hat{p} = ${(overallWilsonUnscoped.p * 100).toFixed(2)}\\%$ (${unscopedAggs.overall.hitAt3Count}/${unscopedAggs.overall.n})
  - **Wilson 95% CI:** **${overallWilsonUnscoped.formatted}**

*(Note: Confidence intervals are computed for buckets with $n \\ge 30$; buckets with $n < 30$ report raw counts and note $n < 30$ per methodology guidelines).*

---

## 3. Scoped Retrieval Evaluation (Domain + Topic Filter)

| Category / Bucket | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | search_ms (p50) | Wilson 95% CI (hit@3) |
|---|---|---|---|---|---|---|---|---|---|---|
| **${scopedAggs.overall.name}** | **${scopedAggs.overall.n}** | **${scopedAggs.overall.hitAt1Count}** | **${(scopedAggs.overall.hitAt1Rate * 100).toFixed(1)}%** | **${scopedAggs.overall.hitAt3Count}** | **${(scopedAggs.overall.hitAt3Rate * 100).toFixed(1)}%** | **${scopedAggs.overall.recallAt3Mean.toFixed(3)}** | **${scopedAggs.overall.mrrMean.toFixed(3)}** | **${scopedAggs.overall.searchMsMean.toFixed(1)}ms** | **${scopedAggs.overall.searchMsP50.toFixed(1)}ms** | **${scopedAggs.overall.wilsonCI}** |
`;

  for (const b of scopedAggs.byDifficulty) {
    md += `| ${b.name} | ${b.n} | ${b.hitAt1Count} | ${(b.hitAt1Rate * 100).toFixed(1)}% | ${b.hitAt3Count} | ${(b.hitAt3Rate * 100).toFixed(1)}% | ${b.recallAt3Mean.toFixed(3)} | ${b.mrrMean.toFixed(3)} | ${b.searchMsMean.toFixed(1)}ms | ${b.searchMsP50.toFixed(1)}ms | ${b.wilsonCI} |\n`;
  }

  for (const b of scopedAggs.byVariant) {
    md += `| ${b.name} | ${b.n} | ${b.hitAt1Count} | ${(b.hitAt1Rate * 100).toFixed(1)}% | ${b.hitAt3Count} | ${(b.hitAt3Rate * 100).toFixed(1)}% | ${b.recallAt3Mean.toFixed(3)} | ${b.mrrMean.toFixed(3)} | ${b.searchMsMean.toFixed(1)}ms | ${b.searchMsP50.toFixed(1)}ms | ${b.wilsonCI} |\n`;
  }

  md += `\n### Scoped Performance by Document:\n\n`;
  md += `| Document ID | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | Wilson 95% CI |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const b of scopedAggs.byDoc) {
    md += `| \`${b.name}\` | ${b.n} | ${b.hitAt1Count} | ${(b.hitAt1Rate * 100).toFixed(1)}% | ${b.hitAt3Count} | ${(b.hitAt3Rate * 100).toFixed(1)}% | ${b.recallAt3Mean.toFixed(3)} | ${b.mrrMean.toFixed(3)} | ${b.searchMsMean.toFixed(1)}ms | ${b.wilsonCI} |\n`;
  }

  md += `\n---\n\n## 4. Unscoped Retrieval Evaluation (Full 66-Chunk Corpus)\n\n`;
  md += `| Category / Bucket | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | search_ms (p50) | Wilson 95% CI (hit@3) |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;
  md += `| **${unscopedAggs.overall.name}** | **${unscopedAggs.overall.n}** | **${unscopedAggs.overall.hitAt1Count}** | **${(unscopedAggs.overall.hitAt1Rate * 100).toFixed(1)}%** | **${unscopedAggs.overall.hitAt3Count}** | **${(unscopedAggs.overall.hitAt3Rate * 100).toFixed(1)}%** | **${unscopedAggs.overall.recallAt3Mean.toFixed(3)}** | **${unscopedAggs.overall.mrrMean.toFixed(3)}** | **${unscopedAggs.overall.searchMsMean.toFixed(1)}ms** | **${unscopedAggs.overall.searchMsP50.toFixed(1)}ms** | **${unscopedAggs.overall.wilsonCI}** |\n`;

  for (const b of unscopedAggs.byDifficulty) {
    md += `| ${b.name} | ${b.n} | ${b.hitAt1Count} | ${(b.hitAt1Rate * 100).toFixed(1)}% | ${b.hitAt3Count} | ${(b.hitAt3Rate * 100).toFixed(1)}% | ${b.recallAt3Mean.toFixed(3)} | ${b.mrrMean.toFixed(3)} | ${b.searchMsMean.toFixed(1)}ms | ${b.searchMsP50.toFixed(1)}ms | ${b.wilsonCI} |\n`;
  }

  for (const b of unscopedAggs.byVariant) {
    md += `| ${b.name} | ${b.n} | ${b.hitAt1Count} | ${(b.hitAt1Rate * 100).toFixed(1)}% | ${b.hitAt3Count} | ${(b.hitAt3Rate * 100).toFixed(1)}% | ${b.recallAt3Mean.toFixed(3)} | ${b.mrrMean.toFixed(3)} | ${b.searchMsMean.toFixed(1)}ms | ${b.searchMsP50.toFixed(1)}ms | ${b.wilsonCI} |\n`;
  }

  md += `\n### Unscoped Performance by Document:\n\n`;
  md += `| Document ID | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | Wilson 95% CI |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const b of unscopedAggs.byDoc) {
    md += `| \`${b.name}\` | ${b.n} | ${b.hitAt1Count} | ${(b.hitAt1Rate * 100).toFixed(1)}% | ${b.hitAt3Count} | ${(b.hitAt3Rate * 100).toFixed(1)}% | ${b.recallAt3Mean.toFixed(3)} | ${b.mrrMean.toFixed(3)} | ${b.searchMsMean.toFixed(1)}ms | ${b.wilsonCI} |\n`;
  }

  md += `\n---\n\n## 5. Negative Queries & Abstention Analysis (14 Unanswerable Queries)\n\n`;
  md += `Negative queries evaluate topics not present in any policy document (e.g. cryptocurrency payments, drone delivery, wedding registry).\n\n`;
  md += `### Score Threshold Rules & Results:\n\n`;
  md += `| Metric / Threshold Rule | Scoped Mode | Unscoped Mode |\n`;
  md += `|---|---|---|\n`;
  md += `| Total Unanswerable Queries ($n$) | ${scopedNegs.totalNegatives} | ${unscopedNegs.totalNegatives} |\n`;
  md += `| Positive Queries Top-1 RRF P90 Cutoff | ${scopedNegs.p90Score.toFixed(6)} | ${unscopedNegs.p90Score.toFixed(6)} |\n`;
  md += `| Positive Queries Top-1 RRF P10 Cutoff | ${scopedNegs.p10Score.toFixed(6)} | ${unscopedNegs.p10Score.toFixed(6)} |\n`;
  md += `| **Rule A (Rank-based P90: score not in top decile of positives)** | | |\n`;
  md += `| - Abstention Count | ${scopedNegs.abstainedByRrfP90} / ${scopedNegs.totalNegatives} | ${unscopedNegs.abstainedByRrfP90} / ${unscopedNegs.totalNegatives} |\n`;
  md += `| - Abstention Rate | ${(scopedNegs.abstentionRateRrfP90 * 100).toFixed(1)}% | ${(unscopedNegs.abstentionRateRrfP90 * 100).toFixed(1)}% |\n`;
  md += `| - False Positive Rate ($1 - \\text{Abstention}$) | ${(scopedNegs.fpRateRrfP90 * 100).toFixed(1)}% | ${(unscopedNegs.fpRateRrfP90 * 100).toFixed(1)}% |\n`;
  md += `| **Rule B (Rank-based P10: score below bottom decile of positives)** | | |\n`;
  md += `| - Abstention Count | ${scopedNegs.abstainedByRrfP10} / ${scopedNegs.totalNegatives} | ${unscopedNegs.abstainedByRrfP10} / ${unscopedNegs.totalNegatives} |\n`;
  md += `| - Abstention Rate | ${(scopedNegs.abstentionRateRrfP10 * 100).toFixed(1)}% | ${(unscopedNegs.abstentionRateRrfP10 * 100).toFixed(1)}% |\n`;
  md += `| - False Positive Rate ($1 - \\text{Abstention}$) | ${(scopedNegs.fpRateRrfP10 * 100).toFixed(1)}% | ${(unscopedNegs.fpRateRrfP10 * 100).toFixed(1)}% |\n`;
  md += `| **Rule C (Cosine Threshold: similarity < 0.50)** | | |\n`;
  md += `| - Abstention Count | ${scopedNegs.abstainedByCosine} / ${scopedNegs.totalNegatives} | ${unscopedNegs.abstainedByCosine} / ${unscopedNegs.totalNegatives} |\n`;
  md += `| - Abstention Rate | ${(scopedNegs.abstentionRateCosine * 100).toFixed(1)}% | ${(unscopedNegs.abstentionRateCosine * 100).toFixed(1)}% |\n`;
  md += `| - False Positive Rate ($1 - \\text{Abstention}$) | ${(scopedNegs.fpRateCosine * 100).toFixed(1)}% | ${(unscopedNegs.fpRateCosine * 100).toFixed(1)}% |\n`;

  md += `\n---\n\n## 6. Scoped vs Unscoped Comparison Summary\n\n`;
  md += `| Metric | Scoped Retrieval | Unscoped Retrieval | Delta (Scoped − Unscoped) |\n`;
  md += `|---|---|---|---|\n`;
  md += `| **hit@1** | ${(scopedAggs.overall.hitAt1Rate * 100).toFixed(1)}% (${scopedAggs.overall.hitAt1Count}/${scopedAggs.overall.n}) | ${(unscopedAggs.overall.hitAt1Rate * 100).toFixed(1)}% (${unscopedAggs.overall.hitAt1Count}/${unscopedAggs.overall.n}) | ${((scopedAggs.overall.hitAt1Rate - unscopedAggs.overall.hitAt1Rate) * 100).toFixed(1)}% |\n`;
  md += `| **hit@3** | ${(scopedAggs.overall.hitAt3Rate * 100).toFixed(1)}% (${scopedAggs.overall.hitAt3Count}/${scopedAggs.overall.n}) | ${(unscopedAggs.overall.hitAt3Rate * 100).toFixed(1)}% (${unscopedAggs.overall.hitAt3Count}/${unscopedAggs.overall.n}) | ${((scopedAggs.overall.hitAt3Rate - unscopedAggs.overall.hitAt3Rate) * 100).toFixed(1)}% |\n`;
  md += `| **recall@3** | ${scopedAggs.overall.recallAt3Mean.toFixed(3)} | ${unscopedAggs.overall.recallAt3Mean.toFixed(3)} | ${(scopedAggs.overall.recallAt3Mean - unscopedAggs.overall.recallAt3Mean).toFixed(3)} |\n`;
  md += `| **MRR** | ${scopedAggs.overall.mrrMean.toFixed(3)} | ${unscopedAggs.overall.mrrMean.toFixed(3)} | ${(scopedAggs.overall.mrrMean - unscopedAggs.overall.mrrMean).toFixed(3)} |\n`;
  md += `| **search_ms (mean)** | ${scopedAggs.overall.searchMsMean.toFixed(1)}ms | ${unscopedAggs.overall.searchMsMean.toFixed(1)}ms | ${(scopedAggs.overall.searchMsMean - unscopedAggs.overall.searchMsMean).toFixed(1)}ms |\n`;
  md += `| **search_ms (p50)** | ${scopedAggs.overall.searchMsP50.toFixed(1)}ms | ${unscopedAggs.overall.searchMsP50.toFixed(1)}ms | ${(scopedAggs.overall.searchMsP50 - unscopedAggs.overall.searchMsP50).toFixed(1)}ms |\n`;

  const summaryMdPath = path.resolve(RESULTS_DIR, 'retrieval-eval-v2-summary.md');
  fs.writeFileSync(summaryMdPath, md, 'utf8');
  console.log(`\nSaved summary report to: ${summaryMdPath}`);

  // Print summary tables to stdout
  console.log('\n' + md);

  // Close database connection cleanly
  process.exit(0);
}

main().catch((err) => {
  console.error('\nEvaluation Runner Fatal Error:', err);
  process.exit(1);
});
