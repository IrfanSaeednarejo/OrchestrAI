/**
 * server/scripts/run-equivalence-verification.ts
 *
 * Task A — Equivalence verification between:
 * 1. Pre-CTE Layer A retrieval (searchDenseScoped + searchSparseScoped + in-memory fuseRrf)
 * 2. Current Layer B retrieval (searchHybridScopedCTE with in-SQL RRF)
 *
 * Runs across the 30 queries in eval/retrieval-queries.json.
 * For each query, generates a deterministic pseudo-embedding (SHA-256 derived float vector)
 * so that:
 * - Zero Gemini API calls are made (quota protected).
 * - Vector is 100% identical and deterministic for both implementations.
 *
 * Saves baseline results to:
 *   server/src/knowledge/fixtures/layer-b-pre-cte-baseline.json
 *
 * Then diffs by chunk_id set AND by ordered list.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  searchDenseScoped,
  searchSparseScoped,
  searchHybridScopedCTE,
  type KnowledgeDomain,
} from '../src/persistence/repositories/knowledge.repository.js';
import { fuseRrf } from '../src/knowledge/rrf-reranker.js';

interface TestQuery {
  id: string;
  query: string;
  expectedDomain: KnowledgeDomain;
  topic: string;
}

function generateDeterministicVector(text: string): number[] {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vector: number[] = new Array(768);
  for (let i = 0; i < 768; i++) {
    const byte = hash[i % hash.length]!;
    vector[i] = Math.sin(byte + i + 1) / Math.sqrt(768);
  }
  return vector;
}

async function main() {
  console.log('=== Task A — Layer B vs Pre-CTE Equivalence Verification ===');

  const queriesPath = path.resolve('eval/retrieval-queries.json');
  const queries: TestQuery[] = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
  console.log(`Loaded ${queries.length} test queries from eval/retrieval-queries.json`);

  const topK = 3;
  const preCteBaseline: Array<{
    id: string;
    query: string;
    domain: string;
    topic: string;
    top3: Array<{ id: string; rrfScore: number }>;
  }> = [];

  const cteResults: Array<{
    id: string;
    query: string;
    domain: string;
    topic: string;
    top3: Array<{ id: string; rrfScore: number }>;
  }> = [];

  console.log('\nRunning queries through both pipelines...');

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const vector = generateDeterministicVector(q.query);

    // 1. Pre-CTE pipeline (Layer A: dense + sparse + in-memory fuseRrf)
    const [denseHits, sparseHits] = await Promise.all([
      searchDenseScoped(vector, q.expectedDomain, q.topic, topK),
      searchSparseScoped(q.query, q.expectedDomain, q.topic, topK),
    ]);
    const fusedInMemory = fuseRrf(denseHits, sparseHits, 60, topK);

    preCteBaseline.push({
      id: q.id,
      query: q.query,
      domain: q.expectedDomain,
      topic: q.topic,
      top3: fusedInMemory.map((h) => ({
        id: h.id,
        rrfScore: Number(h.rrfScore.toFixed(6)),
      })),
    });

    // 2. Current Layer B CTE pipeline
    const cteHits = await searchHybridScopedCTE(vector, q.query, q.expectedDomain, q.topic, topK);

    cteResults.push({
      id: q.id,
      query: q.query,
      domain: q.expectedDomain,
      topic: q.topic,
      top3: cteHits.map((h) => ({
        id: h.id,
        rrfScore: Number(h.rrfScore.toFixed(6)),
      })),
    });

    process.stdout.write(`  [${i + 1}/${queries.length}] query ${q.id} completed\r`);
  }
  console.log('\nAll 30 queries executed on both pipelines.');

  // Save baseline fixture
  const fixtureDir = path.resolve('src/knowledge/fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const fixturePath = path.join(fixtureDir, 'layer-b-pre-cte-baseline.json');
  fs.writeFileSync(fixturePath, JSON.stringify(preCteBaseline, null, 2), 'utf-8');
  console.log(`Saved pre-CTE baseline to: ${fixturePath}`);

  // Diff Analysis
  let setDiffCount = 0;
  let orderDiffCount = 0;
  let scoreDiffCount = 0;

  const diffReport: string[] = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const pre = preCteBaseline[i]!.top3;
    const post = cteResults[i]!.top3;

    const preSet = new Set(pre.map((h) => h.id));
    const postSet = new Set(post.map((h) => h.id));

    // Check set difference
    let setEquals = preSet.size === postSet.size;
    if (setEquals) {
      for (const id of preSet) {
        if (!postSet.has(id)) {
          setEquals = false;
          break;
        }
      }
    }

    if (!setEquals) {
      setDiffCount++;
      diffReport.push(
        `[SET DIFF] ${q.id} ("${q.query.slice(0, 40)}..."): pre=[${pre.map((h) => h.id).join(', ')}] post=[${post.map((h) => h.id).join(', ')}]`
      );
      continue;
    }

    // Set is equal: check order
    const preIds = pre.map((h) => h.id);
    const postIds = post.map((h) => h.id);
    const orderEquals = JSON.stringify(preIds) === JSON.stringify(postIds);

    if (!orderEquals) {
      orderDiffCount++;
      diffReport.push(
        `[ORDER DIFF on ties] ${q.id}: pre=[${preIds.join(', ')}] post=[${postIds.join(', ')}]`
      );
    }

    // Check score differences > 0.001
    for (let k = 0; k < pre.length; k++) {
      const pScore = pre[k]?.rrfScore ?? 0;
      const cScore = post[k]?.rrfScore ?? 0;
      if (Math.abs(pScore - cScore) > 0.001) {
        scoreDiffCount++;
        diffReport.push(
          `[SCORE DIFF] ${q.id} chunk ${pre[k]?.id}: pre=${pScore} post=${cScore}`
        );
      }
    }
  }

  console.log('\n=============================================================');
  console.log('              EQUIVALENCE VERIFICATION REPORT                ');
  console.log('=============================================================');
  console.log(`Total sample queries evaluated       : ${queries.length}`);
  console.log(`Number of queries where top-3 SET differs : ${setDiffCount}`);
  console.log(`Number of queries where ORDER differs     : ${orderDiffCount} (only when sets equal)`);
  console.log(`Score differences beyond 0.001            : ${scoreDiffCount}`);
  console.log('-------------------------------------------------------------');

  if (diffReport.length > 0) {
    console.log('Differences identified:');
    for (const d of diffReport) {
      console.log('  ' + d);
    }
  } else {
    console.log('PERFECT 100% MATCH: All 30 queries produce identical top-3 chunk IDs and identical order.');
  }
  console.log('=============================================================');

  if (setDiffCount > 0) {
    console.error('\nFAIL: Top-3 set differ on one or more queries! Halting per task specification.');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
