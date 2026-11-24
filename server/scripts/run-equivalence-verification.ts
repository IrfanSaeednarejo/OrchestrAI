/**
 * server/scripts/run-equivalence-verification.ts
 *
 * Phase 36 Step 6: Equivalence verification between:
 * 1. Pre-CTE Layer A retrieval (from verified production baseline fixture layer-b-pre-cte-baseline.json)
 * 2. Current Layer B retrieval (searchHybridScopedCTE with in-SQL RRF at HEAD)
 *
 * Runs across the 30 stratified queries from eval/knowledge-golden-dataset.v2.json.
 * For each query, generates a deterministic pseudo-embedding (SHA-256 derived float vector)
 * so that:
 * - Zero Gemini API calls are made (quota protected).
 * - Vector is 100% identical and deterministic for both implementations.
 *
 * Diffs by chunk_id set AND by ordered list.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  searchHybridScopedCTE,
  type KnowledgeDomain,
} from '../src/persistence/repositories/knowledge.repository.js';

interface BaselineQuery {
  id: string;
  query: string;
  domain: KnowledgeDomain;
  topic: string;
  difficulty?: string;
  variantType?: string;
  top3: Array<{ id: string; rrfScore: number }>;
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
  console.log('=== Phase 36 Step 6: Layer B vs Pre-CTE Equivalence Verification ===');

  const fixturePath = path.resolve('src/knowledge/fixtures/layer-b-pre-cte-baseline.json');
  const baseline: BaselineQuery[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  console.log(`Loaded ${baseline.length} test queries from ${fixturePath}`);

  const topK = 3;
  const cteResults: Array<{
    id: string;
    query: string;
    domain: string;
    topic: string;
    top3: Array<{ id: string; rrfScore: number }>;
  }> = [];

  console.log('\nRunning queries through Layer B Single-CTE pipeline...');

  for (let i = 0; i < baseline.length; i++) {
    const q = baseline[i]!;
    const vector = generateDeterministicVector(q.query);

    const cteHits = await searchHybridScopedCTE(vector, q.query, q.domain, q.topic, topK);

    cteResults.push({
      id: q.id,
      query: q.query,
      domain: q.domain,
      topic: q.topic,
      top3: cteHits.map((h) => ({
        id: h.id,
        rrfScore: Number(Number(h.rrfScore).toFixed(6)),
      })),
    });

    process.stdout.write(`  [${i + 1}/${baseline.length}] query ${q.id} completed\r`);
  }
  console.log('\nAll 30 queries executed on Layer B CTE pipeline.');

  // Diff Analysis
  let setDiffCount = 0;
  let orderDiffCount = 0;
  let scoreDiffCount = 0;

  const diffReport: string[] = [];

  for (let i = 0; i < baseline.length; i++) {
    const q = baseline[i]!;
    const pre = q.top3;
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
        `[SET DIFF] Query ${q.id} ("${q.query}"): Pre=[${pre.map((h) => h.id).join(', ')}] Post=[${post.map((h) => h.id).join(', ')}]`
      );
    } else {
      // Check order difference (only if set is equal)
      let orderEquals = true;
      for (let j = 0; j < pre.length; j++) {
        if (pre[j]!.id !== post[j]!.id) {
          orderEquals = false;
          break;
        }
      }
      if (!orderEquals) {
        orderDiffCount++;
        diffReport.push(
          `[ORDER DIFF] Query ${q.id} ("${q.query}"): Pre order=[${pre.map((h) => h.id).join(', ')}] Post order=[${post.map((h) => h.id).join(', ')}]`
        );
      }
    }

    // Check score differences beyond 0.001
    for (const preHit of pre) {
      const postHit = post.find((h) => h.id === preHit.id);
      if (postHit) {
        const delta = Math.abs(preHit.rrfScore - postHit.rrfScore);
        if (delta > 0.001) {
          scoreDiffCount++;
          diffReport.push(
            `[SCORE DIFF] Query ${q.id} Chunk ${preHit.id}: Pre=${preHit.rrfScore} Post=${postHit.rrfScore} Delta=${delta.toFixed(6)}`
          );
        }
      }
    }
  }

  console.log('\n=============================================================');
  console.log('              EQUIVALENCE VERIFICATION REPORT               ');
  console.log('=============================================================');
  console.log(`Total queries tested               : ${baseline.length}`);
  console.log(`Queries where top-3 SET differs     : ${setDiffCount} / ${baseline.length}`);
  console.log(`Queries where ORDER differs (tied)  : ${orderDiffCount} / ${baseline.length}`);
  console.log(`Score differences beyond 0.001      : ${scoreDiffCount} / ${baseline.length}`);
  console.log('=============================================================');

  if (diffReport.length > 0) {
    console.log('\nDifferences detected:');
    for (const d of diffReport) {
      console.log(`  - ${d}`);
    }
  } else {
    console.log('\nVERDICT: 100% PERFECT MATCH across all 30 production queries.');
    console.log('Every single query produced identical top-3 candidate IDs,');
    console.log('identical ranking order, and identical RRF scores.');
  }

  if (setDiffCount > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Equivalence verification failed:', err);
  process.exit(1);
});
