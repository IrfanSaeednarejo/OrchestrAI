import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== LLM Calls grouped by 5-minute time windows ===');
  const windows = await db.execute(sql`
    SELECT 
      date_trunc('minute', created_at) as window_start,
      status,
      error_kind,
      count(*)::int as count
    FROM llm_calls
    WHERE created_at >= '2026-11-14 14:00:00'
    GROUP BY date_trunc('minute', created_at), status, error_kind
    ORDER BY window_start;
  `);
  console.table(windows.rows);

  console.log('\n=== Routing History decisions grouped by 5-minute time windows ===');
  const routing = await db.execute(sql`
    SELECT 
      date_trunc('minute', timestamp) as window_start,
      decision_type,
      count(*)::int as count
    FROM routing_history
    WHERE timestamp >= '2026-11-14 14:00:00'
    GROUP BY date_trunc('minute', timestamp), decision_type
    ORDER BY window_start;
  `);
  console.table(routing.rows);
}

main().catch(console.error);

