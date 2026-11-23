/**
 * server/scripts/check-gucs.ts
 *
 * Phase 36 Step 2b-β: Connection-level GUC and pgvector extension verification.
 *
 * Opens a fresh connection via the RETRIEVAL pool (unpooled Neon endpoint +
 * GUC options startup parameter) and verifies that:
 *   1. hnsw.ef_search        = 100
 *   2. hnsw.iterative_scan   = relaxed_order
 *   3. hnsw.max_scan_tuples  = 40000
 *   4. pg_extension 'vector' extversion >= 0.7.0
 *
 * Exits with code 0 if all match, or code 1 with report if any do not match.
 *
 * Run from server/ directory:
 *   npx tsx scripts/check-gucs.ts
 *
 * Run 5 times to verify determinism across pooler backends:
 *   for ($i=1; $i -le 5; $i++) { Write-Host "Run $i:"; npx tsx scripts/check-gucs.ts }
 */

import 'dotenv/config';
import pg from 'pg';
import semver from 'semver';

const { Pool } = pg;

interface GucCheckResult {
  parameter: string;
  expected: string;
  actual: string;
  matched: boolean;
}

/** Append HNSW GUC options to a Postgres connection string (mirrors retrieval-client.ts). */
function buildRetrievalConnectionString(base: string): string {
  const gucs = [
    'hnsw.ef_search=100',
    'hnsw.iterative_scan=relaxed_order',
    'hnsw.max_scan_tuples=40000',
  ]
    .map((g) => `-c ${g}`)
    .join(' ');
  const encoded = encodeURIComponent(gucs);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}options=${encoded}`;
}

async function main() {
  // Use DATABASE_URL_UNPOOLED (direct connection; GUC options accepted).
  // Falls back to DATABASE_URL if UNPOOLED is absent (will likely fail GUC checks).
  const baseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';
  if (!baseUrl) {
    console.error('ERROR: Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set.');
    process.exit(1);
  }

  const connectionString = buildRetrievalConnectionString(baseUrl);
  console.log('=== OrchestrAI Phase 36 Step 2b-β: Retrieval Pool GUC Verification ===');
  console.log(
    `Endpoint: ${baseUrl.replace(/:[^@]+@/, ':REDACTED@').split('?')[0]} (unpooled + GUC options)`
  );

  const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    // Trigger vector extension type parser so GUC namespace is loaded.
    await client.query('SELECT 1 FROM knowledge_chunks LIMIT 1;');

    // Check GUCs one by one.
    const efRes = await client.query('SHOW "hnsw.ef_search";');
    const efSearch = String(efRes.rows[0]?.['hnsw.ef_search'] ?? '').trim();

    const iterRes = await client.query('SHOW "hnsw.iterative_scan";');
    const iterScan = String(iterRes.rows[0]?.['hnsw.iterative_scan'] ?? '').trim();

    const maxRes = await client.query('SHOW "hnsw.max_scan_tuples";');
    const maxScan = String(maxRes.rows[0]?.['hnsw.max_scan_tuples'] ?? '').trim();

    const extRes = await client.query(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector';`
    );
    const extversion = String(extRes.rows[0]?.extversion ?? '').trim();

    const checks: GucCheckResult[] = [
      {
        parameter: 'hnsw.ef_search',
        expected: '100',
        actual: efSearch,
        matched: efSearch === '100',
      },
      {
        parameter: 'hnsw.iterative_scan',
        expected: 'relaxed_order',
        actual: iterScan,
        matched: iterScan === 'relaxed_order',
      },
      {
        parameter: 'hnsw.max_scan_tuples',
        expected: '40000',
        actual: maxScan,
        matched: maxScan === '40000',
      },
      {
        parameter: 'pg_extension.vector version',
        expected: '>=0.7.0',
        actual: extversion,
        matched: semver.gte(semver.coerce(extversion) ?? '0.0.0', '0.7.0'),
      },
    ];

    console.log('----------------------------------------------------------------------');
    console.log('Parameter                      Expected         Actual           Status');
    console.log('----------------------------------------------------------------------');
    for (const c of checks) {
      const status = c.matched ? 'PASSED [✓]' : 'FAILED [✗]';
      console.log(
        `${c.parameter.padEnd(30)} ${c.expected.padEnd(16)} ${c.actual.padEnd(16)} ${status}`
      );
    }
    console.log('----------------------------------------------------------------------');

    const allPassed = checks.every((c) => c.matched);
    if (!allPassed) {
      console.error('\nGATE REJECTED: One or more connection GUCs do not match expected values.');
      console.error('Verify DATABASE_URL_UNPOOLED is set and points to the direct (non-pooled) endpoint.');
      process.exit(1);
    }

    console.log('\nGATE PASSED: Retrieval pool GUCs verified successfully.');
    console.log('Safe to proceed with Phase 36 Step 3 (remove transaction + SET LOCAL).');
    process.exit(0);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('Check failed with unexpected error:', err);
  process.exit(1);
});
