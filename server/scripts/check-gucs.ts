/**
 * server/scripts/check-gucs.ts
 *
 * Phase 36 Step 2: Connection-level GUC and pgvector extension verification.
 * Opens a fresh un-configured pooled connection and verifies that:
 * 1. hnsw.ef_search = 100
 * 2. hnsw.iterative_scan = relaxed_order
 * 3. hnsw.max_scan_tuples = 40000
 * 4. pg_extension 'vector' extversion >= 0.7.0
 *
 * Exits with code 0 if all match, or code 1 with report if any do not match.
 */

import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';
import semver from 'semver';

interface GucCheckResult {
  parameter: string;
  expected: string;
  actual: string;
  matched: boolean;
}

async function main() {
  console.log('=== OrchestrAI Phase 36 Step 2: Connection-Level GUC Verification ===');

  // Trigger vector extension type parser to ensure GUC namespace is loaded
  await db.execute(sql.raw('SELECT 1 FROM knowledge_chunks LIMIT 1;'));

  // 1. Check hnsw.ef_search
  const efSearchRes = await db.execute(sql.raw('SHOW hnsw.ef_search;'));
  const efSearch = String(efSearchRes[1]?.rows?.[0]?.['hnsw.ef_search'] ?? efSearchRes?.rows?.[0]?.['hnsw.ef_search'] ?? '').trim();

  // 2. Check hnsw.iterative_scan
  const iterScanRes = await db.execute(sql.raw('SHOW hnsw.iterative_scan;'));
  const iterScan = String(iterScanRes[1]?.rows?.[0]?.['hnsw.iterative_scan'] ?? iterScanRes?.rows?.[0]?.['hnsw.iterative_scan'] ?? '').trim();

  // 3. Check hnsw.max_scan_tuples
  const maxScanRes = await db.execute(sql.raw('SHOW hnsw.max_scan_tuples;'));
  const maxScan = String(maxScanRes[1]?.rows?.[0]?.['hnsw.max_scan_tuples'] ?? maxScanRes?.rows?.[0]?.['hnsw.max_scan_tuples'] ?? '').trim();

  // 4. Check vector extension version
  const extRes = await db.execute(sql.raw("SELECT extversion FROM pg_extension WHERE extname = 'vector';"));
  const extversion = String(extRes[1]?.rows?.[0]?.['extversion'] ?? extRes?.rows?.[0]?.['extversion'] ?? '').trim();

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
    console.log(`${c.parameter.padEnd(30)} ${c.expected.padEnd(16)} ${c.actual.padEnd(16)} ${status}`);
  }
  console.log('----------------------------------------------------------------------');

  const allPassed = checks.every((c) => c.matched);
  if (!allPassed) {
    console.error('\nGATE REJECTED: One or more connection GUCs do not match expected values.');
    console.error('The pooler has not applied the URL options parameter or ALTER ROLE is required.');
    process.exit(1);
  }

  console.log('\nGATE PASSED: Connection-level GUCs verified successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Check failed with unexpected error:', err);
  process.exit(1);
});
