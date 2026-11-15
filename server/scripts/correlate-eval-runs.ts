import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const runs = [
    { name: 'live-v1-run1', start: '2026-11-14 14:35:00', end: '2026-11-14 14:44:00' },
    { name: 'live-v1-run2', start: '2026-11-14 14:44:00', end: '2026-11-14 14:51:00' },
    { name: 'live-v1-run3', start: '2026-11-14 14:51:00', end: '2026-11-14 14:56:00' },
    { name: 'live-v2-run1', start: '2026-11-14 14:56:00', end: '2026-11-14 15:01:00' },
    { name: 'live-v2-run2', start: '2026-11-14 15:01:00', end: '2026-11-14 15:06:00' },
    { name: 'live-v2-run3', start: '2026-11-14 15:06:00', end: '2026-11-14 15:12:00' },
  ];

  for (const r of runs) {
    console.log(`\n======================================================`);
    console.log(`Run: ${r.name} (${r.start} to ${r.end})`);
    
    // LLM calls
    const llm = await db.execute(sql`
      SELECT 
        status, 
        COALESCE(error_kind, 'none') as error_kind, 
        count(*)::int as count 
      FROM llm_calls 
      WHERE created_at >= ${r.start} AND created_at < ${r.end}
      GROUP BY status, error_kind;
    `);
    console.log('LLM Calls:');
    console.table(llm.rows);

    // Routing history
    const routing = await db.execute(sql`
      SELECT 
        decision_type, 
        count(*)::int as count 
      FROM routing_history 
      WHERE timestamp >= ${r.start} AND timestamp < ${r.end}
      GROUP BY decision_type;
    `);
    console.log('Routing Decisions:');
    console.table(routing.rows);
  }
}

main().catch(console.error);

