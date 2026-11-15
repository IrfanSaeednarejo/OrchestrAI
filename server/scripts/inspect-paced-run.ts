import 'dotenv/config';
import { pgPool } from '../src/persistence/db/client.js';

async function main() {
  const llm = await pgPool.query(`
    SELECT status, error_kind, count(*)::int as count 
    FROM llm_calls 
    WHERE created_at >= '2026-11-14 18:00:00+00' AND created_at <= '2026-11-14 18:15:00+00'
    GROUP BY status, error_kind
  `);
  console.log('LLM calls during live-v2-paced (18:00 - 18:15 UTC):');
  console.table(llm.rows);

  const routing = await pgPool.query(`
    SELECT decision_type, count(*)::int as count 
    FROM routing_history 
    WHERE timestamp >= '2026-11-14 18:00:00+00' AND timestamp <= '2026-11-14 18:15:00+00'
    GROUP BY decision_type
  `);
  console.log('Routing during live-v2-paced (18:00 - 18:15 UTC):');
  console.table(routing.rows);

  // Check fallback reasons
  const fallbacks = await pgPool.query(`
    SELECT reason, count(*)::int as count 
    FROM routing_history 
    WHERE timestamp >= '2026-11-14 18:00:00+00' AND timestamp <= '2026-11-14 18:15:00+00' AND decision_type = 'FALLBACK'
    GROUP BY reason
  `);
  console.log('Fallback reasons:');
  console.table(fallbacks.rows);

  await pgPool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
