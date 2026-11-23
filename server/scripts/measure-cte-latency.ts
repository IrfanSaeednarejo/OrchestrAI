/**
 * server/scripts/measure-cte-latency.ts
 *
 * Phase 36 Step 4: Empirical latency measurement of Layer B single-CTE hybrid retrieval.
 * Runs N=30 timed retrieval calls executing the consolidated CTE query against Neon Postgres.
 */

import 'dotenv/config';
import {
  searchHybridScopedCTE,
  type KnowledgeDomain,
} from '../src/persistence/repositories/knowledge.repository.js';

interface SummaryStatistics {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
}

function calculateStats(values: number[]): SummaryStatistics {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;

  const p50 = sorted[Math.floor(sorted.length * 0.50)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
  };
}

async function main() {
  console.log('=== OrchestrAI Phase 36 Step 4: Layer B Single-CTE Latency Measurement ===');
  console.log('Driver: node-postgres (retrieval pool, unpooled direct connection + GUC options)');
  console.log('Target: Scoped Single-CTE Hybrid Retrieval (orders / returns)');
  console.log('Statement Count: EXACTLY 1 statement per retrieval call');

  const query = 'How long do I have to return an item?';
  const domain: KnowledgeDomain = 'orders';
  const topic = 'returns';
  const topK = 3;

  const syntheticEmbedding: number[] = new Array(768).fill(0).map((_, i) => {
    return Math.sin(i + 1) / Math.sqrt(768);
  });

  console.log('\nWarming up connection pool & JIT (3 discardable iterations)...');
  for (let i = 0; i < 3; i++) {
    await searchHybridScopedCTE(syntheticEmbedding, query, domain, topic, topK);
  }
  console.log('Warm-up completed.');

  const N = 30;
  console.log(`\nExecuting N=${N} timed single-CTE calls...`);
  const durations: number[] = [];

  for (let i = 1; i <= N; i++) {
    const start = performance.now();
    const hits = await searchHybridScopedCTE(syntheticEmbedding, query, domain, topic, topK);
    const duration = performance.now() - start;
    durations.push(duration);

    if (i % 5 === 0 || i === N) {
      console.log(`  [Iteration ${String(i).padStart(2)}/${N}] CTE Query: ${duration.toFixed(1)}ms | Hits: ${hits.length}`);
    }
  }

  const stats = calculateStats(durations);

  console.log('\n=============================================================');
  console.log('           LAYER B SINGLE-CTE RETRIEVAL LATENCY REPORT       ');
  console.log('=============================================================');
  console.log(`Iterations (N) : ${N}`);
  console.log('Endpoint       : Neon Direct (unpooled + GUC options)');
  console.log('Round-Trips    : EXACTLY 1 database statement');
  console.log('-------------------------------------------------------------');
  console.log('Metric               Min (ms)   Max (ms)   Mean (ms)  p50 (ms)   p95 (ms)');
  console.log('-------------------------------------------------------------');
  console.log(
    `Single-CTE Query     ${String(stats.min).padStart(8)}   ${String(stats.max).padStart(8)}   ${String(stats.mean).padStart(8)}  ${String(stats.p50).padStart(8)}   ${String(stats.p95).padStart(8)}`
  );
  console.log('=============================================================');
}

main().catch((err: unknown) => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
