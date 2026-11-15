// scripts/analyze-llm-calls.ts
import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('--- Total Rows in llm_calls ---');
  const countRes = await db.execute(sql`SELECT count(*)::int as count FROM llm_calls;`);
  console.log(countRes.rows[0]);

  console.log('\n--- Counts by node x status x error_kind x attempts ---');
  const groupedRes = await db.execute(sql`
    SELECT 
      node, 
      status, 
      COALESCE(error_kind, 'NONE') as error_kind, 
      attempts, 
      count(*)::int as call_count
    FROM llm_calls
    GROUP BY node, status, error_kind, attempts
    ORDER BY node, status, error_kind, attempts;
  `);
  console.table(groupedRes.rows);

  console.log('\n--- p50 and p95 duration_ms per node ---');
  const latencyRes = await db.execute(sql`
    SELECT 
      node,
      count(*)::int as n,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) as p50_duration_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms,
      min(duration_ms) as min_duration_ms,
      max(duration_ms) as max_duration_ms
    FROM llm_calls
    GROUP BY node
    ORDER BY node;
  `);
  console.table(latencyRes.rows);

  console.log('\n--- Samples of error messages per error_kind ---');
  // Check schema of llm_calls to see what error column exists
  const colsRes = await db.execute(sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'llm_calls';
  `);
  console.log('Columns in llm_calls:', colsRes.rows.map((r: any) => r.column_name));

  process.exit(0);
}

main().catch(console.error);

