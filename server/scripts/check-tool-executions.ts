import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const tools = await db.execute(sql`
    SELECT id, tool, status, error, input, output, created_at
    FROM tool_executions
    WHERE created_at >= '2026-11-14 14:56:00' AND created_at <= '2026-11-14 15:02:00'
    ORDER BY created_at
    LIMIT 20;
  `);
  console.log('tool_executions in v2-run1:');
  console.table(tools.rows);
}

main().catch(console.error);

