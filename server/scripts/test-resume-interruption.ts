// scripts/test-resume-interruption.ts
process.env.EMAIL_DRY_RUN = 'true';
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pgPool, db } from '../src/persistence/db/client.js';
import { users, conversations } from '../src/persistence/db/schema.js';
import { buildParentGraph } from '../src/graphs/parent/parent-graph.js';
import { verificationService } from '../src/services/verification.service.js';
import type { ConversationState } from '../src/state/conversation-state.js';

interface RunResult {
  iteration: number;
  threadId: string;
  success: boolean;
  restoreTimeMs: number;
  initialStatus?: string;
  finalStatus?: string;
  finalIdentityStatus?: string;
  error?: string;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Number(((1 - weight) * (sorted[lower] ?? 0) + weight * (sorted[upper] ?? 0)).toFixed(2));
}

async function main() {
  console.log('='.repeat(70));
  console.log('  Resume-After-Interruption Integration Benchmark (N=20)');
  console.log('='.repeat(70));

  // Find a test user
  const [testUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (!testUser) {
    throw new Error('No user found in database. Run npm run db:seed first.');
  }
  const userId = testUser.id;
  console.log(`Using test user: ${userId}\n`);

  const results: RunResult[] = [];
  const TOTAL_RUNS = 20;

  for (let i = 1; i <= TOTAL_RUNS; i++) {
    const threadId = crypto.randomUUID();
    console.log(`[Run ${i}/${TOTAL_RUNS}] Starting verification flow for thread ${threadId}...`);

    try {
      // Clear any cooldown or leftover OTP from previous iterations
      await verificationService.revokeVerificationCode(userId);
      const { redisClient, connectRedis } = await import('../src/persistence/redis/client.js');
      await connectRedis();
      await redisClient.del(`verify:cooldown:${userId}`);

      // 1. Ensure conversation row exists in Postgres
      await db.insert(conversations).values({
        id: threadId,
        userId,
        status: 'active',
      });

      // 2. Build initial graph instance with Postgres checkpointer
      const checkpointer1 = new PostgresSaver(pgPool);
      const graph1 = buildParentGraph(checkpointer1);
      const config = { configurable: { thread_id: threadId } };

      // Step A: Trigger identity verification flow
      const turn1Input = {
        user: { id: userId },
        identity: { status: 'UNVERIFIED' as const, verificationMethod: null, verifiedAt: null },
        messages: [new HumanMessage('I need to verify my identity for my account')],
      };

      const state1 = (await graph1.invoke(turn1Input, config)) as ConversationState;
      const step1Status = state1.workflowStatus;

      // Ensure OTP was issued
      const otp = await verificationService.peekVerificationCode(userId);
      if (!otp) {
        throw new Error(`OTP code was not found in Redis after Step 1. State status: ${step1Status}`);
      }

      // 3. SIMULATE SERVER PROCESS KILL AND RESTART
      // Discard graph1 and checkpointer1 references completely.
      // Build a brand-new checkpointer and parent graph instance from pool.
      const restartedCheckpointer = new PostgresSaver(pgPool);
      const restartedGraph = buildParentGraph(restartedCheckpointer);

      // Measure graph.getState restore time
      const t0 = performance.now();
      const restoredCheckpoint = await restartedGraph.getState(config);
      const restoreTimeMs = Number((performance.now() - t0).toFixed(2));

      const restoredValues = restoredCheckpoint.values as ConversationState;
      if (!restoredValues || !restoredValues.messages || restoredValues.messages.length === 0) {
        throw new Error(`State was not restored from Postgres checkpointer. Restored: ${JSON.stringify(restoredValues)}`);
      }

      // Step B: Submit the OTP code to the restarted graph
      const turn2Input = {
        messages: [new HumanMessage(`My verification code is ${otp}`)],
      };

      const state2 = (await restartedGraph.invoke(turn2Input, config)) as ConversationState;

      const success =
        state2.identity?.status === 'VERIFIED' &&
        state2.workflowStatus === 'COMPLETED';

      results.push({
        iteration: i,
        threadId,
        success,
        restoreTimeMs,
        initialStatus: step1Status,
        finalStatus: state2.workflowStatus,
        finalIdentityStatus: state2.identity?.status,
      });

      console.log(
        `  -> Restored in ${restoreTimeMs}ms | OTP: ${otp} | Identity: ${state2.identity?.status} | Workflow: ${state2.workflowStatus} | Success: ${success ? '✅' : '❌'}`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  -> Run ${i} FAILED:`, errMsg);
      results.push({
        iteration: i,
        threadId,
        success: false,
        restoreTimeMs: -1,
        error: errMsg,
      });
    }

    // Small delay between runs
    await new Promise((r) => setTimeout(r, 100));
  }

  // Calculate statistics
  const successes = results.filter((r) => r.success).length;
  const validTimes = results.filter((r) => r.restoreTimeMs > 0).map((r) => r.restoreTimeMs);
  const p50 = percentile(validTimes, 50);
  const p95 = percentile(validTimes, 95);

  const failureCauses: Record<string, number> = {};
  for (const r of results) {
    if (!r.success) {
      const cause = r.error ?? `Workflow status=${r.finalStatus}, identity=${r.finalIdentityStatus}`;
      failureCauses[cause] = (failureCauses[cause] ?? 0) + 1;
    }
  }

  const benchmarkSummary = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scenario: 'Resume-after-interruption OTP verification',
      totalRuns: TOTAL_RUNS,
      database: 'PostgreSQL + PostgresSaver checkpointer (Neon SSL)',
      dataSource: 'live model (gemini-3.5-flash-lite) + real checkpointer + real Redis',
    },
    successCount: successes,
    totalCount: TOTAL_RUNS,
    successRate: successes / TOTAL_RUNS,
    restoreTimeMs: {
      p50,
      p95,
      min: validTimes.length > 0 ? Math.min(...validTimes) : null,
      max: validTimes.length > 0 ? Math.max(...validTimes) : null,
      mean: validTimes.length > 0 ? Number((validTimes.reduce((a, b) => a + b, 0) / validTimes.length).toFixed(2)) : null,
    },
    failureCauses,
    runs: results,
  };

  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS: ${successes}/${TOTAL_RUNS} runs succeeded (${((successes / TOTAL_RUNS) * 100).toFixed(1)}%)`);
  console.log(`graph.getState restore latency: p50 = ${p50}ms | p95 = ${p95}ms`);
  if (Object.keys(failureCauses).length > 0) {
    console.log('Failure causes:', failureCauses);
  }
  console.log('='.repeat(70));

  const outPath = path.resolve(process.cwd(), '../benchmarks/results/resume-interruption.json');
  await fs.writeFile(outPath, JSON.stringify(benchmarkSummary, null, 2), 'utf-8');
  console.log(`Raw benchmark output written to: ${outPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error running resume-interruption benchmark:', err);
  process.exit(1);
});

