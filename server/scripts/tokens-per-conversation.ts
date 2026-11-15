// scripts/tokens-per-conversation.ts
import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`
    WITH conv_tokens AS (
      SELECT conversation_id, sum(total_tokens)::int as tokens
      FROM llm_calls
      WHERE total_tokens IS NOT NULL
      GROUP BY conversation_id
    )
    SELECT 
      count(*)::int as n,
      round(avg(tokens), 1)::float as mean_tokens,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY tokens) as p50_tokens,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY tokens) as p95_tokens,
      min(tokens) as min_tokens,
      max(tokens) as max_tokens
    FROM conv_tokens;
  `);

  console.log('--- Tokens per Conversation ---');
  console.log(result.rows[0]);
  process.exit(0);
}

main().catch(console.error);

