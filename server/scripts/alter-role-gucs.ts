/**
 * server/scripts/alter-role-gucs.ts
 *
 * Phase 36 Step 2b-α: One-off ALTER ROLE script to set HNSW GUCs at the
 * role level so they apply to every new backend connection for neondb_owner.
 *
 * Run ONCE: npx tsx scripts/alter-role-gucs.ts
 * Then run check-gucs.ts 5 times to verify determinism.
 *
 * Safe to re-run; ALTER ROLE SET is idempotent.
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  console.log('=== Phase 36 Step 2b-α: ALTER ROLE GUC Migration ===');

  try {
    const r1 = await client.query(
      `ALTER ROLE neondb_owner SET "hnsw.ef_search" = 100;`,
    );
    console.log(`[✓] ALTER ROLE ... SET hnsw.ef_search = 100     -> ${r1.command}`);

    const r2 = await client.query(
      `ALTER ROLE neondb_owner SET "hnsw.iterative_scan" = relaxed_order;`,
    );
    console.log(`[✓] ALTER ROLE ... SET hnsw.iterative_scan = relaxed_order -> ${r2.command}`);

    const r3 = await client.query(
      `ALTER ROLE neondb_owner SET "hnsw.max_scan_tuples" = 40000;`,
    );
    console.log(`[✓] ALTER ROLE ... SET hnsw.max_scan_tuples = 40000 -> ${r3.command}`);

    console.log('\nAll ALTER ROLE statements executed successfully.');
    console.log('Note: settings apply to NEW backend connections, not existing ones.');
    console.log('On Neon pooler (transaction mode), new backends are allocated per-transaction.');
    console.log('Run check-gucs.ts 5 times to verify determinism across different backends.\n');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { code?: string };
    console.error(`ALTER ROLE failed: ${e.message} (code: ${e.code})`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
