// scripts/truncate-audit-tables.ts
import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Truncating audit tables...');
  await db.execute(sql`
    TRUNCATE TABLE llm_calls, retrieval_executions, tool_executions, agent_executions, routing_history CASCADE;
  `);
  console.log('Audit tables truncated.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to truncate audit tables:', err);
  process.exit(1);
});

