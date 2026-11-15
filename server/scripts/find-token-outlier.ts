import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';

async function main() {
  console.log('Finding conversation with ~85k tokens...');
  const res = await db.execute(sql`
    SELECT 
      conversation_id, 
      sum(prompt_tokens) as total_prompt, 
      sum(output_tokens) as total_output, 
      sum(total_tokens) as total_tokens,
      count(*)::int as call_count
    FROM llm_calls 
    GROUP BY conversation_id 
    ORDER BY total_tokens DESC NULLS LAST
    LIMIT 5;
  `);

  console.table(res.rows);

  const topConv = res.rows[0];
  if (topConv && topConv.conversation_id) {
    console.log(`\nInspecting calls for conversation ${topConv.conversation_id}:`);
    const calls = await db.execute(sql`
      SELECT id, node, prompt_tokens, output_tokens, total_tokens, duration_ms, status, error_kind, created_at
      FROM llm_calls
      WHERE conversation_id = ${topConv.conversation_id}
      ORDER BY created_at ASC;
    `);
    console.table(calls.rows);

    // Also check messages table for this conversation if any
    const msgs = await db.execute(sql`
      SELECT role, content, metadata
      FROM messages
      WHERE conversation_id = ${topConv.conversation_id};
    `);
    console.log('\nMessages in DB for this conversation:', msgs.rows.length);
    if (msgs.rows.length > 0) {
      console.log('Sample message:', msgs.rows[0]);
    }

    // Check routing history
    const routing = await db.execute(sql`
      SELECT from_agent, to_agent, reason, routing_path
      FROM routing_history
      WHERE conversation_id = ${topConv.conversation_id};
    `);
    console.log('\nRouting history for this conversation:', routing.rows.length);
    console.table(routing.rows);
  }

  process.exit(0);
}

main().catch(console.error);

