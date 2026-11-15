// src/evaluation/runner/eval-runner.ts
// Multi-turn evaluation runner with latency and DB query instrumentation.

import crypto from 'node:crypto';
import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { HumanMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { buildParentGraph } from '../../graphs/parent/parent-graph.js';
import type { ConversationState } from '../../state/conversation-state.js';
import { ALL_BINARY_EVALUATORS } from '../evaluators/binary-evaluators.js';
import type {
  EvaluatorResult,
  EvaluatorContext,
  ExecutedToolRecord,
  RoutingDecisionRecord,
} from '../evaluators/types.js';
import type { EvaluationScenario, ScenarioTurn } from '../dataset/types.js';
import {
  runWithTurnContext,
  installPgQueryTracking,
  type TurnContext,
  type QuerySourceStat,
} from '../../shared/turn-context.js';
import { db, pgPool } from '../../persistence/db/client.js';
import { conversations, users } from '../../persistence/db/schema.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface TurnTiming {
  turnMs: number;
  dbMs: number;
  dbQueryCount: number;
  llmMs: number;
  otherMs: number;
  querySources: Record<string, { count: number; totalMs: number }>;
}

export interface TurnResult {
  turnIndex: number;
  turn: ScenarioTurn;
  evaluatorResults: EvaluatorResult[];
  passed: boolean;
  timing: TurnTiming;
}

export interface ScenarioBenchmarkResult {
  scenario: EvaluationScenario;
  turnResults: TurnResult[];
  scenarioPassed: boolean;
  passingEvaluators: number;
  totalEvaluators: number;
}

export interface TimingStats {
  count: number;
  turnMsP50: number;
  turnMsP95: number;
  turnMsMean: number;
  dbMsP50: number;
  dbMsP95: number;
  dbMsMean: number;
  meanQueries: number;
  meanLlmMs: number;
  meanOtherMs: number;
}

export interface BenchmarkReport {
  evalRunId?: string;
  datasetVersion?: string;
  timestamp: string;
  checkpointerType: string;
  totalScenarios: number;
  passedScenarios: number;
  passRate: number;
  byEvaluator: Record<string, { passed: number; total: number; rate: number }>;
  byDomain: Record<string, { passed: number; total: number; rate: number }>;
  timingSummary?: {
    overall: TimingStats;
    turn1: TimingStats;
    laterTurns: TimingStats;
    topQuerySources: Array<{ source: string; count: number; totalMs: number }>;
  };
  scenarioResults: ScenarioBenchmarkResult[];
}

// ---------------------------------------------------------------------------
// Runner configuration
// ---------------------------------------------------------------------------

export interface RunScenarioOptions {
  graph?: ReturnType<typeof buildParentGraph>;
  configurable?: Record<string, unknown>;
  executedTools?: ExecutedToolRecord[];
  evalRunId?: string;
  datasetVersion?: string;
  usePostgresCheckpointer?: boolean;
  pacingMs?: number;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  const lowerVal = sorted[lower] ?? 0;
  const upperVal = sorted[upper] ?? 0;
  return Math.round(lowerVal * (1 - weight) + upperVal * weight);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10;
}

function computeStats(timings: TurnTiming[]): TimingStats {
  const turnMsList = timings.map((t) => t.turnMs);
  const dbMsList = timings.map((t) => t.dbMs);
  const queriesList = timings.map((t) => t.dbQueryCount);
  const llmMsList = timings.map((t) => t.llmMs);
  const otherMsList = timings.map((t) => t.otherMs);

  return {
    count: timings.length,
    turnMsP50: percentile(turnMsList, 0.5),
    turnMsP95: percentile(turnMsList, 0.95),
    turnMsMean: mean(turnMsList),
    dbMsP50: percentile(dbMsList, 0.5),
    dbMsP95: percentile(dbMsList, 0.95),
    dbMsMean: mean(dbMsList),
    meanQueries: mean(queriesList),
    meanLlmMs: mean(llmMsList),
    meanOtherMs: mean(otherMsList),
  };
}

// ---------------------------------------------------------------------------
// Core: run a single scenario through the graph, turn by turn
// ---------------------------------------------------------------------------

export async function runScenario(
  scenario: EvaluationScenario,
  options: RunScenarioOptions = {}
): Promise<ScenarioBenchmarkResult> {
  installPgQueryTracking();

  const checkpointer = options.usePostgresCheckpointer
    ? new PostgresSaver(pgPool)
    : new MemorySaver();
  const graph = options.graph ?? buildParentGraph(checkpointer);
  const threadId = crypto.randomUUID();

  try {
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    if (u) {
      await db
        .insert(conversations)
        .values({
          id: threadId,
          userId: u.id,
          status: 'active',
        })
        .onConflictDoNothing();
    }
  } catch {
    // Non-blocking in isolated unit tests
  }

  const initialStateOverrides: Partial<ConversationState> = {};
  if (scenario.initialIdentity) {
    initialStateOverrides.identity = {
      status: scenario.initialIdentity.status,
      verificationMethod: scenario.initialIdentity.verificationMethod ?? null,
      verifiedAt: scenario.initialIdentity.verifiedAt ?? null,
    };
  }
  // Harness fix: Inject default user identity so account/profile scenarios have a valid state.user
  initialStateOverrides.user = { id: '00000000-0000-4000-8000-000000000001' };

  const turnResults: TurnResult[] = [];
  let previousState: ConversationState | undefined;

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    if (!turn) continue;

    if (options.pacingMs && options.pacingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.pacingMs));
    }

    const invokeInput =
      i === 0
        ? {
            ...initialStateOverrides,
            messages: [new HumanMessage(turn.userMessage)],
          }
        : {
            messages: [new HumanMessage(turn.userMessage)],
          };

    const config: RunnableConfig = {
      configurable: {
        thread_id: threadId,
        ...(options.configurable ?? {}),
      },
    };

    const turnTools: ExecutedToolRecord[] = [];
    const querySources = new Map<string, QuerySourceStat>();
    const turnCtx: TurnContext = {
      conversationId: threadId,
      evalRunId: options.evalRunId,
      datasetVersion: options.datasetVersion,
      llmCallCount: 0,
      toolCallCount: 0,
      executedTools: turnTools,
      dbQueryCount: 0,
      dbDurationMs: 0,
      llmDurationMs: 0,
      querySources,
    };

    const turnStart = performance.now();
    const finalState = (await runWithTurnContext(
      turnCtx,
      () => graph.invoke(invokeInput, config)
    )) as ConversationState;
    const turnMs = Math.round(performance.now() - turnStart);
    const dbMs = Math.round(turnCtx.dbDurationMs ?? 0);
    const llmMs = Math.round(turnCtx.llmDurationMs ?? 0);
    const otherMs = Math.max(0, turnMs - dbMs - llmMs);

    const querySourcesObj: Record<string, { count: number; totalMs: number }> = {};
    for (const [k, v] of querySources.entries()) {
      querySourcesObj[k] = { count: v.count, totalMs: Math.round(v.totalMs) };
    }

    const timing: TurnTiming = {
      turnMs,
      dbMs,
      dbQueryCount: turnCtx.dbQueryCount ?? 0,
      llmMs,
      otherMs,
      querySources: querySourcesObj,
    };

    const routingDecisions: RoutingDecisionRecord[] = finalState.routing.history.map((h) => {
      const isHandoff = Boolean(h.fromAgent && h.fromAgent !== h.toAgent);
      return {
        decisionType: isHandoff ? 'HANDOFF' : 'INITIAL_ROUTE',
        sourceAgent: h.fromAgent,
        targetAgent: h.toAgent,
        reason: h.reason,
      };
    });

    const executedTools: ExecutedToolRecord[] = options.executedTools ?? turnTools;

    const context: EvaluatorContext = {
      scenario,
      turn,
      initialState: previousState,
      finalState,
      executedTools,
      routingDecisions,
    };

    const evaluatorResults = ALL_BINARY_EVALUATORS.map((fn) => fn(context));
    const passed = evaluatorResults.every((r) => r.passed);

    turnResults.push({ turnIndex: i, turn, evaluatorResults, passed, timing });
    previousState = finalState;
  }

  const totalEvaluators = turnResults.reduce((sum, t) => sum + t.evaluatorResults.length, 0);
  const passingEvaluators = turnResults.reduce(
    (sum, t) => sum + t.evaluatorResults.filter((r) => r.passed).length,
    0
  );
  const scenarioPassed = turnResults.every((t) => t.passed);

  return { scenario, turnResults, scenarioPassed, passingEvaluators, totalEvaluators };
}

// ---------------------------------------------------------------------------
// Aggregate: run multiple scenarios and produce a BenchmarkReport
// ---------------------------------------------------------------------------

export async function runBenchmark(
  scenarios: EvaluationScenario[],
  options: RunScenarioOptions = {}
): Promise<BenchmarkReport> {
  const scenarioResults: ScenarioBenchmarkResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, options);
    scenarioResults.push(result);
  }

  const totalScenarios = scenarioResults.length;
  const passedScenarios = scenarioResults.filter((r) => r.scenarioPassed).length;
  const passRate = totalScenarios > 0 ? passedScenarios / totalScenarios : 0;

  // Per-evaluator aggregation
  const byEvaluator: Record<string, { passed: number; total: number; rate: number }> = {};
  for (const sr of scenarioResults) {
    for (const tr of sr.turnResults) {
      for (const er of tr.evaluatorResults) {
        const stats = byEvaluator[er.evaluator] ?? { passed: 0, total: 0, rate: 0 };
        stats.total += 1;
        if (er.passed) stats.passed += 1;
        byEvaluator[er.evaluator] = stats;
      }
    }
  }
  for (const key of Object.keys(byEvaluator)) {
    const entry = byEvaluator[key];
    if (entry) {
      entry.rate = entry.total > 0 ? entry.passed / entry.total : 0;
    }
  }

  // Per-domain aggregation
  const byDomain: Record<string, { passed: number; total: number; rate: number }> = {};
  for (const sr of scenarioResults) {
    const domain = sr.scenario.domain;
    const stats = byDomain[domain] ?? { passed: 0, total: 0, rate: 0 };
    stats.total += 1;
    if (sr.scenarioPassed) stats.passed += 1;
    byDomain[domain] = stats;
  }
  for (const key of Object.keys(byDomain)) {
    const entry = byDomain[key];
    if (entry) {
      entry.rate = entry.total > 0 ? entry.passed / entry.total : 0;
    }
  }

  // Timing aggregation
  const allTimings: TurnTiming[] = [];
  const turn1Timings: TurnTiming[] = [];
  const laterTimings: TurnTiming[] = [];
  const aggregatedQuerySources: Record<string, { count: number; totalMs: number }> = {};

  for (const sr of scenarioResults) {
    for (const tr of sr.turnResults) {
      allTimings.push(tr.timing);
      if (tr.turnIndex === 0) {
        turn1Timings.push(tr.timing);
      } else {
        laterTimings.push(tr.timing);
      }
      for (const [src, data] of Object.entries(tr.timing.querySources)) {
        const current = aggregatedQuerySources[src] ?? { count: 0, totalMs: 0 };
        current.count += data.count;
        current.totalMs += data.totalMs;
        aggregatedQuerySources[src] = current;
      }
    }
  }

  const topSources = Object.entries(aggregatedQuerySources)
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.totalMs - a.totalMs);

  const timingSummary = {
    overall: computeStats(allTimings),
    turn1: computeStats(turn1Timings),
    laterTurns: computeStats(laterTimings),
    topQuerySources: topSources,
  };

  return {
    evalRunId: options.evalRunId,
    datasetVersion: options.datasetVersion,
    timestamp: new Date().toISOString(),
    checkpointerType: options.usePostgresCheckpointer ? 'PostgresSaver' : 'MemorySaver',
    totalScenarios,
    passedScenarios,
    passRate,
    byEvaluator,
    byDomain,
    timingSummary,
    scenarioResults,
  };
}
