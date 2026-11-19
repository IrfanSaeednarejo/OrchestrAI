/**
 * scripts/benchmark-large-pdf.ts
 * Baseline & post-fix benchmark for large-doc ingestion and retrieval.
 *
 * Usage:
 *   LOG_EMBEDDING_CALLS=1 LOG_PEAK_RSS=1 npx tsx scripts/benchmark-large-pdf.ts
 *
 * Measures: ingest wall-time, peak RSS, chunk count, embedding API call count,
 * cost estimate, retrieval latency (p50/p95 over 20 queries), storage size.
 * Only the retrieveKnowledge call time is measured for latency (no subprocess overhead).
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ingestPdfKnowledgeBase } from '../src/knowledge/ingest.js';
import { retrieveKnowledge } from '../src/knowledge/retrieval.js';
import { poolStats } from '../src/persistence/db/client.js';
import pg from 'pg';

// ── 0. Reset log files ────────────────────────────────────────────────────────
fs.mkdirSync('logs', { recursive: true });
fs.rmSync('logs/embedding_calls.log', { force: true });
fs.rmSync('logs/peak_rss.log', { force: true });

// ── 1. Ingest ─────────────────────────────────────────────────────────────────
const FIXTURE_DIR = path.resolve('test-fixtures/large-doc');
console.log('\n=== BENCHMARK: Ingest ===');
const ingestStart = performance.now();
await ingestPdfKnowledgeBase(FIXTURE_DIR);
const ingestWallSec = ((performance.now() - ingestStart) / 1000).toFixed(2);
console.log(`Ingest wall-time (s): ${ingestWallSec}  [TARGET: < 60]`);

// ── 2. Peak RSS (approximate from current process; exact value in logs/peak_rss.log on exit) ──
const rssApproxMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
console.log(`Peak RSS approx (MB): ${rssApproxMb}  [TARGET: < 500] [exact: see logs/peak_rss.log after exit]`);

// ── 3. Chunk count & storage size ─────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}
const pgClient = new pg.Client({ connectionString: dbUrl });
await pgClient.connect();

const { rows: chunkRows } = await pgClient.query<{ count: string }>(
  `SELECT COUNT(*) FROM knowledge_chunks WHERE domain='orders' AND topic='large_doc_test' AND status='active'`
);
const chunkCount = chunkRows[0]?.count ?? '0';
console.log(`Chunk count (large_doc_test active): ${chunkCount}  [TARGET: > 30]`);

const { rows: sizeRows } = await pgClient.query<{ size: string }>(
  `SELECT pg_size_pretty(pg_total_relation_size('knowledge_chunks')) AS size`
);
const tableSize = sizeRows[0]?.size ?? 'UNVERIFIED';
console.log(`knowledge_chunks table size: ${tableSize}`);

await pgClient.end();

// ── 4. Embedding API call count ───────────────────────────────────────────────
let embedCallCount = 'UNVERIFIED (LOG_EMBEDDING_CALLS not set or file missing)';
if (fs.existsSync('logs/embedding_calls.log')) {
  const lines = fs
    .readFileSync('logs/embedding_calls.log', 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  embedCallCount = String(lines.length);
}
console.log(`Embedding API calls: ${embedCallCount}`);

// ── 5. Cost estimate ─────────────────────────────────────────────────────────
// Avg chunk ~400 tokens (350 target + 50 overlap breadcrumb).
// gemini-embedding-001: placeholder rate $0.0002/1k tokens (document embedding).
const tokenEstimate = Number(chunkCount) * 400;
const costEstimate = (tokenEstimate / 1000) * 0.0002;
console.log(
  `ESTIMATE: embedding cost ≈ $${costEstimate.toFixed(6)} (${tokenEstimate} tokens × $0.0002/1k — placeholder rate)`
);

// ── 6. Retrieval latency — 20 queries from actual fixture section headings ────
// Queries derived from the H2 section headings in generate-large-doc-pdf.ts
const QUERIES = [
  'return eligibility criteria',
  'return window calculation days',
  'eligible order statuses for return',
  'concurrent return limits per order',
  'item condition requirements for return',
  'non-returnable items policy',
  'digital products return policy',
  'perishable goods return policy',
  'hazardous materials return',
  'return shipping prepaid labels',
  'self-ship returns process',
  'international returns policy',
  'refund timing after approval',
  'original payment method refund',
  'store credit option for refund',
  'partial refunds policy',
  'duplicate charge refund process',
  'refund disputes escalation',
  'exchange process for orders',
  'defective item exchange requirements',
];

console.log('\n=== BENCHMARK: Retrieval Latency (20 queries) ===');
const latencies: number[] = [];

for (const query of QUERIES) {
  const beforePool = JSON.stringify(poolStats());
  const t0 = performance.now();
  const result = await retrieveKnowledge({
    query,
    domains: ['orders'],
    topics: ['large_doc_test'],
    topK: 3,
  });
  const latMs = performance.now() - t0;
  const afterPool = JSON.stringify(poolStats());
  latencies.push(latMs);
  const hits = result.success ? result.data.length : 0;
  const status = result.success ? 'OK' : `FAIL:${(result as any).error?.code}`;
  console.log(
    `  [${latMs.toFixed(0).padStart(5)}ms] hits=${hits} status=${status} pool(before=${beforePool}, after=${afterPool}) | ${query}`
  );
  // 2000 ms pacing to respect Gemini rate limits and prevent backoff retries
  await new Promise((r) => setTimeout(r, 2000));
}

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)]!.toFixed(0);
const p95 = latencies[Math.floor(latencies.length * 0.95)]!.toFixed(0);
console.log(`\np50 latency (ms): ${p50}  [TARGET: < 500]`);
console.log(`p95 latency (ms): ${p95}  [TARGET: < 1000]`);

// ── 7. Summary table ──────────────────────────────────────────────────────────
console.log('\n=== BENCHMARK SUMMARY ===');
console.log(`Ingest wall-time (s): ${ingestWallSec}            [TARGET: < 60]`);
console.log(`Peak RSS (MB):        ${rssApproxMb}              [TARGET: < 500]`);
console.log(`Chunk count:          ${chunkCount}               [TARGET: > 30]`);
console.log(`Embedding API calls:  ${embedCallCount}`);
console.log(`ESTIMATE cost:        $${costEstimate.toFixed(6)}`);
console.log(`p50 retrieval (ms):   ${p50}               [TARGET: < 500]`);
console.log(`p95 retrieval (ms):   ${p95}               [TARGET: < 1000]`);
console.log(`Table size:           ${tableSize}`);
