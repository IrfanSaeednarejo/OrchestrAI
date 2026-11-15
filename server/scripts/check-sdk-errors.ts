import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const errs = await db.execute(sql`
    SELECT node, error_kind, duration_ms, attempts, created_at, id
    FROM llm_calls
    WHERE error_kind = 'SDK_ERROR' AND created_at >= '2026-11-14 14:56:00'
    ORDER BY created_at
    LIMIT 10;
  `);
  console.log('SDK_ERROR samples:');
  console.table(errs.rows);
}

main().catch(console.error);

