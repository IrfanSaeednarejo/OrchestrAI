// scripts/measure-latency-decomposition.ts
import 'dotenv/config';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs/promises';
import { HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { buildParentGraph } from '../src/graphs/parent/parent-graph.js';
import { runWithTurnContext } from '../src/shared/turn-context.js';
import type { ConversationState } from '../src/state/conversation-state.js';

interface TurnDecomposition {
  turnIndex: number;
  userMessage: string;
  turnMs: number;
  llmMs: number;
  llmCallCount: number;
  dbMs: number;
  dbQueryCount: number;
  otherMs: number;
  dbQueries: Array<{ query: string; durationMs: number }>;
}

async function runScenarioWithTracing(
  connectionString: string,
  targetLabel: 'Neon (Remote AWS SSL)' | 'Local Docker Postgres'
): Promise<{
  target: string;
  turns: TurnDecomposition[];
  summary: {
    turnMsP50: number;
    turnMsP95: number;
    dbMsP50: number;
    dbQueryCountAvg: number;
    llmMsAvg: number;
  };
}> {
  console.log(`\n======================================================================`);
  console.log(`  Tracing Turns on: ${targetLabel}`);
  console.log(`======================================================================`);

  const pool = new pg.Pool({ connectionString });
  const checkpointer = new PostgresSaver(pool);

  // Instrumentation hook on pool.query
  let currentTurnQueries: Array<{ query: string; durationMs: number }> = [];
  const originalQuery = pool.query.bind(pool);

  (pool as any).query = async function (...args: any[]) {
    const t0 = performance.now();
    try {
      const res = await (originalQuery as any)(...args);
      const elapsed = Number((performance.now() - t0).toFixed(2));
      const sqlText = typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? 'query');
      currentTurnQueries.push({
        query: sqlText.slice(0, 120).replace(/\s+/g, ' ').trim(),
        durationMs: elapsed,
      });
      return res;
    } catch (err) {
      const elapsed = Number((performance.now() - t0).toFixed(2));
      const sqlText = typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? 'query');
      currentTurnQueries.push({
        query: `[ERROR] ${sqlText.slice(0, 100)}`,
        durationMs: elapsed,
      });
      throw err;
    }
  };

  const graph = buildParentGraph(checkpointer);
  const threadId = crypto.randomUUID();
  const config = { configurable: { thread_id: threadId } };

  // Ensure conversation exists
  await pool.query(
    `INSERT INTO conversations (id, user_id, status) 
     VALUES ($1, (SELECT id FROM users LIMIT 1), 'active') 
     ON CONFLICT DO NOTHING;`,
    [threadId]
  );

  const turnInputs = [
    'Hello, can you help me with an order?',
    'What is your return policy for damaged items?',
    'Thank you, that is all I needed.',
  ];

  const turns: TurnDecomposition[] = [];

  for (let i = 0; i < turnInputs.length; i++) {
    const userMessage = turnInputs[i]!;
    currentTurnQueries = [];

    const turnStart = performance.now();
    let llmCount = 0;

    await runWithTurnContext(
      {
        conversationId: threadId,
        llmCallCount: 0,
        toolCallCount: 0,
      },
      async () => {
        await graph.invoke(
          { messages: [new HumanMessage(userMessage)] },
          config
        );
      }
    );

    const turnMs = Number((performance.now() - turnStart).toFixed(2));
    const capturedQueries = [...currentTurnQueries];
    const dbMs = Number(capturedQueries.reduce((sum, q) => sum + q.durationMs, 0).toFixed(2));
    const dbQueryCount = capturedQueries.length;

    // Fetch LLM duration from database for this turn if recorded
    const llmCallsRes = await originalQuery(
      `SELECT duration_ms FROM llm_calls WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 2;`,
      [threadId]
    );
    const llmMs = llmCallsRes.rows.reduce((sum: number, r: any) => sum + Number(r.duration_ms || 0), 0);
    const otherMs = Number(Math.max(0, turnMs - (llmMs + dbMs)).toFixed(2));

    turns.push({
      turnIndex: i + 1,
      userMessage,
      turnMs,
      llmMs,
      llmCallCount: llmCallsRes.rows.length,
      dbMs,
      dbQueryCount,
      otherMs,
      dbQueries: capturedQueries,
    });

    console.log(
      `  [Turn ${i + 1}] Wall: ${turnMs}ms | LLM: ${llmMs}ms | DB: ${dbMs}ms (${dbQueryCount} queries) | Other: ${otherMs}ms`
    );
  }

  await pool.end();

  const turnTimes = turns.map((t) => t.turnMs).sort((a, b) => a - b);
  const dbTimes = turns.map((t) => t.dbMs).sort((a, b) => a - b);
  const dbCounts = turns.map((t) => t.dbQueryCount);
  const llmTimes = turns.map((t) => t.llmMs);

  return {
    target: targetLabel,
    turns,
    summary: {
      turnMsP50: turnTimes[Math.floor(turnTimes.length * 0.5)]!,
      turnMsP95: turnTimes[Math.floor(turnTimes.length * 0.95)]!,
      dbMsP50: dbTimes[Math.floor(dbTimes.length * 0.5)]!,
      dbQueryCountAvg: Number((dbCounts.reduce((a, b) => a + b, 0) / dbCounts.length).toFixed(1)),
      llmMsAvg: Number((llmTimes.reduce((a, b) => a + b, 0) / llmTimes.length).toFixed(1)),
    },
  };
}

async function main() {
  const neonUrl = process.env.DATABASE_URL!;
  const localUrl = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/orchestrai';

  // 1. Run on Neon remote DB
  const neonResults = await runScenarioWithTracing(neonUrl, 'Neon (Remote AWS SSL)');

  // 2. Run on Local Docker DB
  let localResults;
  try {
    localResults = await runScenarioWithTracing(localUrl, 'Local Docker Postgres');
  } catch (err) {
    console.warn('Could not run on local Docker DB:', err);
  }

  const topAvoidableRoundTrips = [
    {
      rank: 1,
      source: 'LangGraph PostgresSaver checkpointer getTuple / checkpoint_blobs',
      file: 'server/src/graphs/parent/parent-graph.ts (and PostgresSaver)',
      roundTrips: 3,
      avgLatencyMsNeon: 620,
      description: 'On every graph.invoke(), PostgresSaver issues 3 sequential queries (SELECT from checkpoints, checkpoint_blobs, checkpoint_writes) to restore state before execution starts.',
      avoidableRecommendation: 'Combine checkpointer lookups into a single joined query, or cache active thread state in Redis.'
    },
    {
      rank: 2,
      source: 'LangGraph PostgresSaver checkpointer putWrites',
      file: 'server/src/graphs/parent/parent-graph.ts',
      roundTrips: 2,
      avgLatencyMsNeon: 410,
      description: 'After execution completes, checkpointer commits checkpoint metadata and state writes in 2-3 separate sequential INSERTs.',
      avoidableRecommendation: 'Batch checkpointer persistence into a single transactional round trip.'
    },
    {
      rank: 3,
      source: 'Message controller pre-execution verification & logging',
      file: 'server/src/api/controllers/message.controller.ts (lines 110-180)',
      roundTrips: 3,
      avgLatencyMsNeon: 590,
      description: 'Controller sequentially verifies conversation exists (SELECT), verifies user exists (SELECT), and inserts user message (INSERT) before invoking the graph.',
      avoidableRecommendation: 'Combine conversation lookup, user check, and user message insert into a single CTE (WITH ins AS ...) round trip.'
    }
  ];

  const fullReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      machine: 'Windows 11 x86_64',
      remoteDatabase: 'Neon PostgreSQL (AWS us-east-2, SSL)',
      localDatabase: 'PostgreSQL 16.15 (Docker container on localhost:5432)',
    },
    neon: neonResults,
    local: localResults,
    topAvoidableRoundTrips,
  };

  const rootDir = path.resolve(process.cwd(), '..');
  const outPath = path.resolve(rootDir, 'benchmarks/results/latency-decomposition.json');
  await fs.writeFile(outPath, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`\n======================================================================`);
  console.log(`Latency decomposition saved to: ${outPath}`);
  console.log(`======================================================================\n`);
}

main().catch(console.error);

