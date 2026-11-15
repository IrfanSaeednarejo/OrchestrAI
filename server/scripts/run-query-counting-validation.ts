import 'dotenv/config';

// Force local Docker Postgres connection before importing app modules
process.env.DATABASE_URL = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/orchestrai';

import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { HumanMessage } from '@langchain/core/messages';
import {
  installPgQueryTracking,
  runWithTurnContext,
  type TurnContext,
  type QueryInterval,
} from '../src/shared/turn-context.js';

interface TurnValidationResult {
  turnNumber: number;
  scenarioId: string;
  userMessage: string;
  turnMs: number;
  inAppDbQueryCount: number;
  serverStatementCount: number;
  countDifference: number; // inApp - server
  summedQueryDurationMs: number;
  criticalPathDbWaitMs: number;
  overlappingQueryCount: number;
  criticalPathSavingsMs: number;
  serverTopStatements: Array<{ query: string; calls: number }>;
}

function computeIntervalUnion(intervals: QueryInterval[]): {
  criticalPathMs: number;
  summedMs: number;
  overlappingCount: number;
} {
  if (intervals.length === 0) {
    return { criticalPathMs: 0, summedMs: 0, overlappingCount: 0 };
  }

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const summedMs = sorted.reduce((sum, i) => sum + i.durationMs, 0);

  const merged: Array<{ start: number; end: number }> = [];
  let overlaps = 0;

  for (const curr of sorted) {
    if (merged.length === 0) {
      merged.push({ start: curr.start, end: curr.end });
    } else {
      const last = merged[merged.length - 1]!;
      if (curr.start < last.end) {
        overlaps++;
        last.end = Math.max(last.end, curr.end);
      } else {
        merged.push({ start: curr.start, end: curr.end });
      }
    }
  }

  const criticalPathMs = merged.reduce((sum, i) => sum + (i.end - i.start), 0);

  return {
    criticalPathMs: Number(criticalPathMs.toFixed(2)),
    summedMs: Number(summedMs.toFixed(2)),
    overlappingCount: overlaps,
  };
}

async function main() {
  // Dynamically import client and graph AFTER process.env.DATABASE_URL is set
  const { pgPool, db } = await import('../src/persistence/db/client.js');
  const { users, conversations, messages } = await import('../src/persistence/db/schema.js');
  const { buildParentGraph } = await import('../src/graphs/parent/parent-graph.js');

  console.log('======================================================================');
  console.log('  ORCHESTRAI: PER-TURN QUERY COUNTING & LATENCY VALIDATION');
  console.log('  Target: LOCAL Docker Postgres (pg_stat_statements & in-app wrapper)');
  console.log(`  Connected Database URL: ${process.env.DATABASE_URL}`);
  console.log('======================================================================\n');

  installPgQueryTracking();

  // Create isolated admin client for pg_stat_statements inspection
  const adminClient = new pg.Client({
    connectionString: process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/orchestrai',
  });
  await adminClient.connect();

  // Ensure pg_stat_statements is available
  await adminClient.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');

  const checkpointer = new PostgresSaver(pgPool);
  const graph = buildParentGraph(checkpointer);

  // Retrieve valid user for FK integrity
  const [testUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (!testUser) {
    throw new Error('No user found in local Docker Postgres users table.');
  }

  const turnsToTest = [
    {
      scenarioId: 'SCENARIO-01',
      userMessage: 'Where is my order 00000000-0000-0000-0000-000000000101? It was supposed to arrive yesterday.',
    },
    {
      scenarioId: 'SCENARIO-02',
      userMessage: 'Hi, I have an issue.',
    },
    {
      scenarioId: 'SCENARIO-03',
      userMessage: 'I noticed I was charged twice for order 00000000-0000-0000-0000-000000000103. Can you refund the second charge?',
    },
    {
      scenarioId: 'SCENARIO-04',
      userMessage: 'I need to return an item from order 00000000-0000-0000-0000-000000000104. How do I get my refund?',
    },
    {
      scenarioId: 'SCENARIO-05',
      userMessage: 'Can you send me the receipt for order 00000000-0000-0000-0000-000000000105?',
    },
    {
      scenarioId: 'SCENARIO-06',
      userMessage: 'I want to return an item from order 00000000-0000-0000-0000-000000000106.',
    },
    {
      scenarioId: 'SCENARIO-07',
      userMessage: 'I need to return order 00000000-0000-0000-0000-000000000107.',
    },
    {
      scenarioId: 'SCENARIO-08',
      userMessage: 'I returned order 00000000-0000-0000-0000-000000000108 three days ago. Where is my refund?',
    },
    {
      scenarioId: 'SCENARIO-09',
      userMessage: 'I want to return an item I bought 45 days ago, order 00000000-0000-0000-0000-000000000109.',
    },
    {
      scenarioId: 'SCENARIO-10',
      userMessage: 'Can you recommend a good laptop?',
    },
  ];

  const results: TurnValidationResult[] = [];

  for (let idx = 0; idx < turnsToTest.length; idx++) {
    const { scenarioId, userMessage } = turnsToTest[idx]!;
    const turnNumber = idx + 1;
    const threadId = crypto.randomUUID();

    // 1. Persist conversation and initial user message before invoking graph
    await db.insert(conversations).values({
      id: threadId,
      userId: testUser.id,
      status: 'active',
    }).onConflictDoNothing();

    await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId: threadId,
      role: 'user',
      content: userMessage,
    });

    // 2. Reset pg_stat_statements immediately before the turn
    await adminClient.query('SELECT pg_stat_statements_reset();');

    const turnCtx: TurnContext = {
      conversationId: threadId,
      llmCallCount: 0,
      toolCallCount: 0,
      dbQueryCount: 0,
      dbDurationMs: 0,
      queryIntervals: [],
    };

    console.log(`Running Turn ${turnNumber} / 10 [${scenarioId}]...`);
    const t0 = performance.now();

    await runWithTurnContext(turnCtx, async () => {
      await graph.invoke(
        { messages: [new HumanMessage(userMessage)] },
        { configurable: { thread_id: threadId } }
      );
    });

    const turnMs = Number((performance.now() - t0).toFixed(2));

    // 3. Query server-side statement counts from pg_stat_statements
    const sumRes = await adminClient.query(`
      SELECT COALESCE(sum(calls), 0)::int as total_calls 
      FROM pg_stat_statements 
      WHERE query NOT LIKE '%pg_stat_statements%';
    `);
    const serverCalls = Number(sumRes.rows[0]?.total_calls ?? 0);

    const breakdownRes = await adminClient.query(`
      SELECT calls, query 
      FROM pg_stat_statements 
      WHERE query NOT LIKE '%pg_stat_statements%' 
      ORDER BY calls DESC 
      LIMIT 5;
    `);

    const topStatements = breakdownRes.rows.map((r: any) => ({
      query: String(r.query).replace(/\s+/g, ' ').slice(0, 100),
      calls: Number(r.calls),
    }));

    // 4. Compute critical-path DB wait vs summed query duration
    const intervalStats = computeIntervalUnion(turnCtx.queryIntervals ?? []);

    const inAppCount = turnCtx.dbQueryCount ?? 0;
    const countDiff = inAppCount - serverCalls;
    const savings = Number((intervalStats.summedMs - intervalStats.criticalPathMs).toFixed(2));

    results.push({
      turnNumber,
      scenarioId,
      userMessage,
      turnMs,
      inAppDbQueryCount: inAppCount,
      serverStatementCount: serverCalls,
      countDifference: countDiff,
      summedQueryDurationMs: intervalStats.summedMs,
      criticalPathDbWaitMs: intervalStats.criticalPathMs,
      overlappingQueryCount: intervalStats.overlappingCount,
      criticalPathSavingsMs: savings,
      serverTopStatements: topStatements,
    });

    console.log(`  ✓ Turn ${turnNumber}: inAppCount=${inAppCount}, serverCalls=${serverCalls} (diff: ${countDiff}) | DB Wait: crit=${intervalStats.criticalPathMs}ms vs sum=${intervalStats.summedMs}ms (savings=${savings}ms)`);
  }

  // Save full results to benchmarks/results/
  const repoRoot = path.resolve(process.cwd(), '..');
  const outDir = path.resolve(repoRoot, 'benchmarks/results');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.resolve(outDir, 'query-counting-validation.json');
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n======================================================================`);
  console.log(`Results saved to: ${outPath}`);
  console.log(`======================================================================`);

  await adminClient.end();
  await pgPool.end();
}

main().catch((err) => {
  console.error('Fatal error in validation script:', err);
  process.exit(1);
});
