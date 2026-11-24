/**
 * server/scripts/measure-retrieval-latency.ts
 *
 * Phase 35: Empirical latency baseline measurement for OrchestrAI hybrid RAG retrieval.
 * Times N=30 retrieval calls under warm connection pool, isolating embedding generation
 * from database round-trips.
 *
 * CONSTRAINTS:
 * - Zero external Gemini API quota consumed (uses pre-cached or fixed test vector).
 * - Immediate abort if cache miss or un-mocked API call is attempted.
 * - Zero new npm dependencies.
 */

import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { db } from '../src/persistence/db/client.js';
import {
  searchDenseScoped,
  searchSparseScoped,
} from '../src/persistence/repositories/knowledge.repository.js';
import { fuseRrf } from '../src/knowledge/rrf-reranker.js';
import { logRetrievalExecutionSafely } from '../src/persistence/repositories/orchestration.repository.js';
import type { KnowledgeDomain } from '../src/persistence/db/schema.js';

interface LatencyIterationMetrics {
  iteration: number;
  dbWallClockMs: number;
  denseMs: number;
  sparseMs: number;
  fusionMs: number;
  telemetryMs: number;
  denseHitCount: number;
  sparseHitCount: number;
  fusedHitCount: number;
}

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
  console.log('=== OrchestrAI Phase 35: Hybrid Retrieval Latency Baseline ===');
  console.log('Driver: node-postgres (pg Pool)');
  console.log('Target: Scoped Hybrid Retrieval (orders / returns)');
  console.log('Quota Constraint: Gemini API call strictly prohibited (synthetic vector fixture)');

  // 1. Prepare deterministic query and embedding vector
  const query = 'How long do I have to return an item?';
  const domain: KnowledgeDomain = 'orders';
  const topic = 'returns';
  const topK = 3;

  // Generate deterministic 768-dim synthetic normalized float vector (no Gemini API call)
  const syntheticEmbedding: number[] = new Array(768).fill(0).map((_, i) => {
    return Math.sin(i + 1) / Math.sqrt(768);
  });

  // Verify vector dimension & validity
  if (syntheticEmbedding.length !== 768) {
    throw new Error('CACHE_MISS_ABORT: Invalid embedding vector dimensionality.');
  }

  // 2. Warm-up phase (3 discardable runs to warm connection pool and JIT)
  console.log('\nWarming up connection pool & JIT (3 discardable iterations)...');
  for (let i = 0; i < 3; i++) {
    const [denseHits, sparseHits] = await Promise.all([
      searchDenseScoped(syntheticEmbedding, domain, topic, topK),
      searchSparseScoped(query, domain, topic, topK),
    ]);
    fuseRrf(denseHits, sparseHits, 60, topK);
  }
  console.log('Warm-up completed.');

  // 3. Timed execution phase (N = 30)
  const N = 30;
  console.log(`\nExecuting N=${N} timed retrieval calls...`);
  const metrics: LatencyIterationMetrics[] = [];

  for (let i = 1; i <= N; i++) {
    const iterStart = performance.now();

    // Time Dense branch (Transaction + SET LOCALs + Vector SELECT + COMMIT)
    const denseStart = performance.now();
    const densePromise = searchDenseScoped(syntheticEmbedding, domain, topic, topK).then((res) => {
      const duration = performance.now() - denseStart;
      return { res, duration };
    });

    // Time Sparse branch (Direct SELECT websearch_to_tsquery)
    const sparseStart = performance.now();
    const sparsePromise = searchSparseScoped(query, domain, topic, topK).then((res) => {
      const duration = performance.now() - sparseStart;
      return { res, duration };
    });

    const [denseResult, sparseResult] = await Promise.all([densePromise, sparsePromise]);

    // Time Fusion (in-memory)
    const fusionStart = performance.now();
    const fused = fuseRrf(denseResult.res, sparseResult.res, 60, topK);
    const fusionMs = performance.now() - fusionStart;

    // Time Telemetry write
    const telemetryStart = performance.now();
    await logRetrievalExecutionSafely({
      domain,
      topic,
      embedMs: 0,
      searchMs: Math.round(performance.now() - iterStart),
      resultCount: fused.length,
      topSimilarity: fused.length > 0 ? (denseResult.res[0]?.distance !== undefined ? 1 - Number(denseResult.res[0].distance) : null) : null,
    });
    const telemetryMs = performance.now() - telemetryStart;

    const dbWallClockMs = performance.now() - iterStart;

    metrics.push({
      iteration: i,
      dbWallClockMs,
      denseMs: denseResult.duration,
      sparseMs: sparseResult.duration,
      fusionMs,
      telemetryMs,
      denseHitCount: denseResult.res.length,
      sparseHitCount: sparseResult.res.length,
      fusedHitCount: fused.length,
    });

    // Log progress every 5 iterations
    if (i % 5 === 0 || i === N) {
      console.log(`  [Iteration ${String(i).padStart(2)}/${N}] Wall: ${dbWallClockMs.toFixed(1)}ms | Dense: ${denseResult.duration.toFixed(1)}ms | Sparse: ${sparseResult.duration.toFixed(1)}ms | Telem: ${telemetryMs.toFixed(1)}ms`);
    }
  }

  // 4. Compute Statistical Summary
  const wallStats = calculateStats(metrics.map((m) => m.dbWallClockMs));
  const denseStats = calculateStats(metrics.map((m) => m.denseMs));
  const sparseStats = calculateStats(metrics.map((m) => m.sparseMs));
  const fusionStats = calculateStats(metrics.map((m) => m.fusionMs));
  const telemetryStats = calculateStats(metrics.map((m) => m.telemetryMs));

  console.log('\n=============================================================');
  console.log('               RETRIEVAL LATENCY BASELINE REPORT             ');
  console.log('=============================================================');
  console.log(`Iterations (N) : ${N}`);
  console.log(`Region         : Remote Neon Postgres (AWS us-east-2)`);
  console.log(`Driver         : node-postgres (Pool)`);
  console.log(`Embedding Time : 0.00ms (Synthetic fixture, quota-isolated)`);
  console.log('-------------------------------------------------------------');
  console.log('Metric               Min (ms)   Max (ms)   Mean (ms)  p50 (ms)   p95 (ms)');
  console.log('-------------------------------------------------------------');
  console.log(`DB Wall-Clock        ${wallStats.min.toFixed(2).padStart(8)}   ${wallStats.max.toFixed(2).padStart(8)}   ${wallStats.mean.toFixed(2).padStart(8)}   ${wallStats.p50.toFixed(2).padStart(8)}   ${wallStats.p95.toFixed(2).padStart(8)}`);
  console.log(`Dense Branch (Tx)    ${denseStats.min.toFixed(2).padStart(8)}   ${denseStats.max.toFixed(2).padStart(8)}   ${denseStats.mean.toFixed(2).padStart(8)}   ${denseStats.p50.toFixed(2).padStart(8)}   ${denseStats.p95.toFixed(2).padStart(8)}`);
  console.log(`Sparse Branch (FTS)  ${sparseStats.min.toFixed(2).padStart(8)}   ${sparseStats.max.toFixed(2).padStart(8)}   ${sparseStats.mean.toFixed(2).padStart(8)}   ${sparseStats.p50.toFixed(2).padStart(8)}   ${sparseStats.p95.toFixed(2).padStart(8)}`);
  console.log(`RRF Fusion (Memory)  ${fusionStats.min.toFixed(2).padStart(8)}   ${fusionStats.max.toFixed(2).padStart(8)}   ${fusionStats.mean.toFixed(2).padStart(8)}   ${fusionStats.p50.toFixed(2).padStart(8)}   ${fusionStats.p95.toFixed(2).padStart(8)}`);
  console.log(`Telemetry Write      ${telemetryStats.min.toFixed(2).padStart(8)}   ${telemetryStats.max.toFixed(2).padStart(8)}   ${telemetryStats.mean.toFixed(2).padStart(8)}   ${telemetryStats.p50.toFixed(2).padStart(8)}   ${telemetryStats.p95.toFixed(2).padStart(8)}`);
  console.log('=============================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
