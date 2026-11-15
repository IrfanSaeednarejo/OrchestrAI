// scripts/query-llm-calls.ts
import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const result = await db.execute(sql`
    SELECT 
      status, 
      error_kind, 
      count(*)::int as count,
      sum(case when attempts > 1 then attempts - 1 else 0 end)::int as total_retries
    FROM llm_calls 
    GROUP BY status, error_kind;
  `);

  const summary = await db.execute(sql`
    SELECT 
      count(*)::int as total_calls,
      count(*) FILTER (WHERE status = 'success')::int as successful_calls,
      count(*) FILTER (WHERE status = 'failure')::int as failed_calls,
      sum(case when attempts > 1 then attempts - 1 else 0 end)::int as total_retries,
      count(*) FILTER (WHERE error_kind ILIKE '%429%' OR error_kind ILIKE '%resource_exhausted%')::int as rate_limit_errors
    FROM llm_calls;
  `);

  console.log('--- LLM Calls Status Breakdown ---');
  console.log(result.rows);
  console.log('--- LLM Calls Summary ---');
  console.log(summary.rows[0]);

  const failures = await db.execute(sql`
    SELECT id, node, error_kind, duration_ms, attempts, created_at
    FROM llm_calls
    WHERE status = 'failure'
    LIMIT 10;
  `);
  console.log('--- Sample Failures ---');
  console.log(failures.rows);

  const output = {
    timestamp: new Date().toISOString(),
    breakdown: result.rows,
    summary: summary.rows[0],
    sampleFailures: failures.rows,
  };

  const outputPath = path.resolve(process.cwd(), '../benchmarks/results/live-eval-llm-calls.json');
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Saved to ${outputPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

