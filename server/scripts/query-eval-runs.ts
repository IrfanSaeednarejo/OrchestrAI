import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('--- LLM Calls by eval_run_id, status, error_kind ---');
  const llmRes = await db.execute(sql`
    SELECT 
      COALESCE(eval_run_id, 'NULL') as eval_run_id,
      COALESCE(dataset_version, 'NULL') as dataset_version,
      status,
      COALESCE(error_kind, 'none') as error_kind,
      count(*)::int as count
    FROM llm_calls
    GROUP BY eval_run_id, dataset_version, status, error_kind
    ORDER BY eval_run_id, dataset_version, status, error_kind;
  `);
  console.table(llmRes.rows);

  console.log('\n--- Routing History by eval_run_id, decision_type ---');
  const routingRes = await db.execute(sql`
    SELECT 
      COALESCE(eval_run_id, 'NULL') as eval_run_id,
      decision_type,
      count(*)::int as count
    FROM routing_history
    GROUP BY eval_run_id, decision_type
    ORDER BY eval_run_id, decision_type;
  `);
  console.table(routingRes.rows);
}

main().catch(console.error);

