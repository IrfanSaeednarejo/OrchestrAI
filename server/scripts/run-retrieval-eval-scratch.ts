import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { embedDocument, embedQuery } from '../src/knowledge/embeddings-client.js';

const SCRATCH_DB_URL = process.env.SCRATCH_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/orchestrai_bench';
const KNOWLEDGE_PATH = path.resolve(process.cwd(), '../seed/knowledge-expanded.json');
const QUERIES_PATH = path.resolve(process.cwd(), '../eval/retrieval-queries.json');
const RESULTS_DIR = path.resolve(process.cwd(), '../benchmarks/results');

interface KnowledgeChunk {
  id: string;
  domain: string;
  topic: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

interface RetrievalQuery {
  id: string;
  query: string;
  expectedChunkId: string;
  expectedDomain: string;
  topic?: string;
}

interface SearchHit {
  id: string;
  domain: string;
  topic: string;
  title: string;
  similarity: number;
}

interface ModeResult {
  mode: string;
  overall: { hit1: number; hit3: number; mrr: number; total: number };
  byDomain: Record<string, { hit1: number; hit3: number; mrr: number; total: number }>;
  failingQueries: Array<{
    queryId: string;
    query: string;
    expectedChunkId: string;
    expectedDomain: string;
    topHits: SearchHit[];
  }>;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  ORCHESTRAI: RETRIEVAL EVALUATION ON SCRATCH DATABASE');
  console.log('='.repeat(70));

  const client = new pg.Client({ connectionString: SCRATCH_DB_URL });
  await client.connect();
  console.log('Connected to SCRATCH database: orchestrai_bench');

  // 1. Ensure table schema in scratch database
  await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await client.query(`DROP TABLE IF EXISTS knowledge_eval_scratch CASCADE;`);
  await client.query(`
    CREATE TABLE knowledge_eval_scratch (
      id text PRIMARY KEY,
      domain text NOT NULL,
      topic text NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      embedding vector(768) NOT NULL,
      metadata jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS knowledge_eval_scratch_domain_topic_idx 
    ON knowledge_eval_scratch(domain, topic);
  `);

  // 2. Read chunks and ingest
  const rawChunks = await fs.readFile(KNOWLEDGE_PATH, 'utf-8');
  const chunks: KnowledgeChunk[] = JSON.parse(rawChunks);
  console.log(`Loaded ${chunks.length} chunks from seed/knowledge-expanded.json.`);

  console.log(`Ingesting ${chunks.length} chunks with real gemini-embedding-2 (768 dims)...`);
  const ingestStart = performance.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    // Use production embedDocument prefix: `title: none | text: ${text}`
    const embedding = await embedDocument(chunk.content);
    const vectorStr = `[${embedding.join(',')}]`;

    await client.query(
      `
      INSERT INTO knowledge_eval_scratch (id, domain, topic, title, content, embedding, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
    `,
      [chunk.id, chunk.domain, chunk.topic, chunk.title, chunk.content, vectorStr, JSON.stringify(chunk.metadata)]
    );

    if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
      console.log(`Ingested ${i + 1} / ${chunks.length} chunks...`);
    }
  }

  const ingestDurationMs = Math.round(performance.now() - ingestStart);
  console.log(`Ingest complete in ${ingestDurationMs} ms (${(ingestDurationMs / 1000).toFixed(2)}s).`);

  // 3. Load 30 labeled retrieval queries
  const rawQueries = await fs.readFile(QUERIES_PATH, 'utf-8');
  const queries: RetrievalQuery[] = JSON.parse(rawQueries);
  console.log(`Loaded ${queries.length} queries from eval/retrieval-queries.json.\n`);

  // Helper search function mimicking production cosineDistance query
  async function searchCorpus(
    queryVec: number[],
    mode: 'domain_and_topic' | 'domain_only' | 'unscoped',
    domain: string,
    topic?: string
  ): Promise<SearchHit[]> {
    const vecStr = `[${queryVec.join(',')}]`;
    let sqlQuery = `
      SELECT id, domain, topic, title, (1 - (embedding <=> $1::vector)) AS similarity
      FROM knowledge_eval_scratch
    `;
    const params: any[] = [vecStr];

    if (mode === 'domain_and_topic' && topic) {
      sqlQuery += ` WHERE domain = $2 AND topic = $3`;
      params.push(domain, topic);
    } else if (mode === 'domain_only') {
      sqlQuery += ` WHERE domain = $2`;
      params.push(domain);
    }

    sqlQuery += ` ORDER BY embedding <=> $1::vector ASC LIMIT 3;`;
    const res = await client.query(sqlQuery, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      domain: r.domain,
      topic: r.topic,
      title: r.title,
      similarity: parseFloat(r.similarity),
    }));
  }

  // Pre-embed all queries once so all 3 modes compare on identical query vectors
  console.log(`Embedding ${queries.length} queries with real gemini-embedding-2...`);
  const embeddedQueries: Array<{ query: RetrievalQuery; vector: number[] }> = [];
  for (const q of queries) {
    const vector = await embedQuery(q.query);
    embeddedQueries.push({ query: q, vector });
  }

  // Evaluate across 3 modes
  const modes: Array<{ id: 'domain_and_topic' | 'domain_only' | 'unscoped'; label: string }> = [
    { id: 'domain_and_topic', label: '1. Scoped (Domain + Topic)' },
    { id: 'domain_only', label: '2. Scoped (Domain Only)' },
    { id: 'unscoped', label: '3. Unscoped (Global Corpus)' },
  ];

  const modeResults: ModeResult[] = [];

  for (const m of modes) {
    let hit1Count = 0;
    let hit3Count = 0;
    let reciprocalRankSum = 0;

    const byDomain: Record<string, { hit1: number; hit3: number; mrr: number; total: number }> = {};
    const failingQueries: ModeResult['failingQueries'] = [];

    for (const { query: q, vector } of embeddedQueries) {
      const hits = await searchCorpus(vector, m.id, q.expectedDomain, q.topic);
      const rank = hits.findIndex((h) => h.id === q.expectedChunkId) + 1; // 1-based, 0 if not found

      const isHit1 = rank === 1 ? 1 : 0;
      const isHit3 = rank >= 1 && rank <= 3 ? 1 : 0;
      const rr = rank > 0 ? 1 / rank : 0;

      hit1Count += isHit1;
      hit3Count += isHit3;
      reciprocalRankSum += rr;

      const dom = q.expectedDomain;
      const dStats = byDomain[dom] ?? { hit1: 0, hit3: 0, mrr: 0, total: 0 };
      dStats.total += 1;
      dStats.hit1 += isHit1;
      dStats.hit3 += isHit3;
      dStats.mrr += rr;
      byDomain[dom] = dStats;

      if (!isHit1) {
        failingQueries.push({
          queryId: q.id,
          query: q.query,
          expectedChunkId: q.expectedChunkId,
          expectedDomain: q.expectedDomain,
          topHits: hits,
        });
      }
    }

    // Normalize per-domain rates
    for (const dom of Object.keys(byDomain)) {
      const d = byDomain[dom]!;
      d.hit1 = Math.round((d.hit1 / d.total) * 1000) / 10;
      d.hit3 = Math.round((d.hit3 / d.total) * 1000) / 10;
      d.mrr = Math.round((d.mrr / d.total) * 1000) / 1000;
    }

    const n = queries.length;
    modeResults.push({
      mode: m.label,
      overall: {
        hit1: Math.round((hit1Count / n) * 1000) / 10,
        hit3: Math.round((hit3Count / n) * 1000) / 10,
        mrr: Math.round((reciprocalRankSum / n) * 1000) / 1000,
        total: n,
      },
      byDomain,
      failingQueries,
    });
  }

  // Print results
  for (const mr of modeResults) {
    console.log('\n' + '='.repeat(60));
    console.log(`MODE: ${mr.mode}`);
    console.log('='.repeat(60));
    console.log(`Overall: hit@1 = ${mr.overall.hit1}%, hit@3 = ${mr.overall.hit3}%, MRR = ${mr.overall.mrr} (N=${mr.overall.total})`);
    console.log('\nPer Domain Breakdown:');
    for (const [dom, st] of Object.entries(mr.byDomain)) {
      console.log(`  [${dom.padEnd(12)}] hit@1: ${st.hit1}%, hit@3: ${st.hit3}%, MRR: ${st.mrr} (n=${st.total})`);
    }
    console.log(`\nFailing Queries (hit@1 misses: ${mr.failingQueries.length}):`);
    for (const f of mr.failingQueries) {
      console.log(`  [${f.queryId}] "${f.query.slice(0, 50)}..."`);
      console.log(`     Expected: ${f.expectedChunkId} (${f.expectedDomain})`);
      console.log(`     Got Top-3: ${f.topHits.map((h, i) => `#${i + 1} ${h.id} (${h.similarity.toFixed(3)})`).join(', ')}`);
    }
  }

  const finalReport = {
    label: 'synthetic corpus and queries authored by the same tool; shows the pipeline retrieves correctly, not real-world accuracy.',
    commitHash: '339e28c1f59d7286f69ec39389369552018c18ea',
    timestamp: new Date().toISOString(),
    scratchDatabase: 'orchestrai_bench',
    embeddingModel: 'gemini-embedding-2 (768 dimensions)',
    chunksCount: chunks.length,
    ingestDurationMs,
    queriesCount: queries.length,
    results: modeResults,
  };

  const outPath = path.join(RESULTS_DIR, 'retrieval-eval-scratch-results.json');
  await fs.writeFile(outPath, JSON.stringify(finalReport, null, 2), 'utf-8');
  console.log(`\nSaved retrieval evaluation report to: ${outPath}`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Retrieval eval error:', err);
  process.exit(1);
});

