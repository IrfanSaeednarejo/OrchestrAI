// src/evaluation/runner/eval-runner.ts
// Phase 15: Multi-turn evaluation runner.
// Accepts an EvaluationScenario and drives each turn through the parent graph
// sequentially, preserving thread state across turns using MemorySaver.
// After each turn it feeds an EvaluatorContext to ALL_BINARY_EVALUATORS and
// aggregates results into a structured BenchmarkReport.

import crypto from 'node:crypto';
import { MemorySaver } from '@langchain/langgraph';
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

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface TurnResult {
  /** Zero-based index of the turn within the scenario */
  turnIndex: number;
  turn: ScenarioTurn;
  /** All 8 binary evaluator results for this turn */
  evaluatorResults: EvaluatorResult[];
  /** true iff every evaluator passed for this turn */
  passed: boolean;
}

export interface ScenarioBenchmarkResult {
  scenario: EvaluationScenario;
  turnResults: TurnResult[];
  /** true iff every turn passed */
  scenarioPassed: boolean;
  passingEvaluators: number;
  totalEvaluators: number;
}

export interface BenchmarkReport {
  totalScenarios: number;
  passedScenarios: number;
  passRate: number;
  byEvaluator: Record<string, { passed: number; total: number; rate: number }>;
  byDomain: Record<string, { passed: number; total: number; rate: number }>;
  scenarioResults: ScenarioBenchmarkResult[];
}

// ---------------------------------------------------------------------------
// Runner configuration
// ---------------------------------------------------------------------------

export interface RunScenarioOptions {
  /**
   * Optional pre-built graph to reuse across runs (e.g. for integration tests).
   * When omitted a fresh graph with MemorySaver is built per scenario.
   */
  graph?: ReturnType<typeof buildParentGraph>;
  /**
   * Extra configurable values forwarded to the graph on every turn.
   * Integration tests use { useStubs: true } or { stubBehaviors: {...} }.
   */
  configurable?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Core: run a single scenario through the graph, turn by turn
// ---------------------------------------------------------------------------

export async function runScenario(
  scenario: EvaluationScenario,
  options: RunScenarioOptions = {}
): Promise<ScenarioBenchmarkResult> {
  const checkpointer = new MemorySaver();
  const graph = options.graph ?? buildParentGraph(checkpointer);
  const threadId = crypto.randomUUID();

  // Build initial state overrides from scenario.initialIdentity
  const initialStateOverrides: Partial<ConversationState> = {};
  if (scenario.initialIdentity) {
    initialStateOverrides.identity = {
      status: scenario.initialIdentity.status,
      verificationMethod: scenario.initialIdentity.verificationMethod ?? null,
      verifiedAt: scenario.initialIdentity.verifiedAt ?? null,
    };
  }

  const turnResults: TurnResult[] = [];
  let previousState: ConversationState | undefined;

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    if (!turn) continue;

    // Build the per-turn invoke input.
    // On the first turn we apply scenario-level state overrides; subsequent turns
    // only send the new HumanMessage — the graph's checkpointer carries the rest.
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

    const finalState = (await graph.invoke(invokeInput, config)) as ConversationState;

    // Build EvaluatorContext — routing decisions and tool executions are
    // derived from finalState.routing.history when real DB is not available,
    // which is the case for the MemorySaver-based unit tests.
    const routingDecisions: RoutingDecisionRecord[] = finalState.routing.history.map((h) => ({
      decisionType: 'ROUTE',
      sourceAgent: h.fromAgent,
      targetAgent: h.toAgent,
      reason: h.reason,
    }));

    // Tools executed: the MemorySaver runner does not query Postgres tool_executions.
    // The integration test variant (Step 4) can supply them via EvaluatorContext directly.
    const executedTools: ExecutedToolRecord[] = [];

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

    turnResults.push({ turnIndex: i, turn, evaluatorResults, passed });

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

  return { totalScenarios, passedScenarios, passRate, byEvaluator, byDomain, scenarioResults };
}

