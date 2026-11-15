// scripts/inspect-llm-failures.ts
import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const failureStats = await db.execute(sql`
    SELECT 
      error_kind,
      count(*)::int as count,
      min(duration_ms) as min_ms,
      max(duration_ms) as max_ms,
      round(avg(duration_ms))::int as avg_ms,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::int as p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int as p95_ms
    FROM llm_calls
    WHERE status = 'failure'
    GROUP BY error_kind;
  `);

  console.log('--- Failure Durations by error_kind ---');
  console.table(failureStats.rows);

  // Check how many failed calls have duration >= 9500ms (timeout correlation)
  const timeoutCorrelation = await db.execute(sql`
    SELECT 
      error_kind,
      count(*)::int as total_failures,
      count(*) FILTER (WHERE duration_ms >= 9500)::int as timed_out_10s,
      count(*) FILTER (WHERE duration_ms < 9500)::int as fast_failures
    FROM llm_calls
    WHERE status = 'failure'
    GROUP BY error_kind;
  `);

  console.log('--- Timeout Correlation (duration >= 9500ms) ---');
  console.table(timeoutCorrelation.rows);

  process.exit(0);
}

main().catch(console.error);

