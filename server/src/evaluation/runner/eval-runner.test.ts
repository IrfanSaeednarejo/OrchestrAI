// src/evaluation/runner/eval-runner.test.ts
// Phase 15: Unit tests for multi-turn evaluation runner and benchmark reporter.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runScenario, runBenchmark } from './eval-runner.js';
import type { EvaluationScenario } from '../dataset/types.js';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe('Evaluation Runner', () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  const singleTurnScenario: EvaluationScenario = {
    id: 'test-single-turn',
    name: 'Single Turn Tracking Test',
    description: 'Verify order tracking single turn evaluation',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: {
      status: 'LIGHTLY_VERIFIED',
      verificationMethod: 'order_lookup',
      verifiedAt: '2026-11-05T00:00:00Z',
    },
    turns: [
      {
        userMessage: 'Where is my order #ord-999?',
        expectedTargetSpecialist: 'order_tracking',
        expectedIntent: 'ORDER_STATUS',
        expectedWorkflowStatus: 'COMPLETED',
        expectedResponseKeywords: ['order'],
      },
    ],
  };

  const multiTurnScenario: EvaluationScenario = {
    id: 'test-multi-turn',
    name: 'Multi Turn Order Tracking Test',
    description: 'Verify multi-turn state preservation across turns',
    domain: 'orders',
    pattern: 'PATTERN_A',
    initialIdentity: {
      status: 'VERIFIED',
    },
    turns: [
      {
        userMessage: 'Check my order ord-111',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'COMPLETED',
      },
      {
        userMessage: 'Thank you, that helps!',
        expectedTargetSpecialist: 'order_tracking',
        expectedWorkflowStatus: 'COMPLETED',
      },
    ],
  };

  it('runs a single-turn scenario and evaluates all 8 binary evaluators', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked for order status.',
      }),
    });

    const result = await runScenario(singleTurnScenario, {
      configurable: {
        stubBehaviors: {
          order_tracking: {
            type: 'COMPLETE',
            message: 'Your order #ord-999 is out for delivery today.',
          },
        },
      },
    });

    expect(result.scenario.id).toBe('test-single-turn');
    expect(result.turnResults).toHaveLength(1);
    const firstTurn = result.turnResults[0];
    expect(firstTurn).toBeDefined();
    if (!firstTurn) throw new Error('Turn expected');
    expect(firstTurn.evaluatorResults).toHaveLength(8);
    expect(result.totalEvaluators).toBe(8);
    expect(result.passingEvaluators).toBe(8);
    expect(result.scenarioPassed).toBe(true);

    const routingEval = firstTurn.evaluatorResults.find(
      (e) => e.evaluator === 'ROUTING_CORRECT'
    );
    expect(routingEval?.passed).toBe(true);

    const groundedEval = firstTurn.evaluatorResults.find(
      (e) => e.evaluator === 'KNOWLEDGE_GROUNDED'
    );
    expect(groundedEval?.passed).toBe(true);
  });

  it('runs a multi-turn scenario preserving state across turns', async () => {
    // Turn 1 LLM response
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Tracking inquiry',
      }),
    });

    // Turn 2 LLM response
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.9,
        reasoning: 'Follow up inquiry',
      }),
    });

    const result = await runScenario(multiTurnScenario, {
      configurable: {
        stubBehaviors: {
          order_tracking: {
            type: 'COMPLETE',
            message: 'Order status acknowledged.',
          },
        },
      },
    });

    expect(result.turnResults).toHaveLength(2);
    const turn0 = result.turnResults[0];
    const turn1 = result.turnResults[1];
    expect(turn0).toBeDefined();
    expect(turn1).toBeDefined();
    if (!turn0 || !turn1) throw new Error('Two turns expected');
    expect(turn0.turnIndex).toBe(0);
    expect(turn1.turnIndex).toBe(1);

    // State preserved should pass across turn 1 to turn 2
    const statePreservedTurn2 = turn1.evaluatorResults.find(
      (e) => e.evaluator === 'STATE_PRESERVED'
    );
    expect(statePreservedTurn2?.passed).toBe(true);
    expect(result.scenarioPassed).toBe(true);
  });

  it('correctly aggregates multiple scenarios in runBenchmark report', async () => {
    // Single-turn scenario mock
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Tracking inquiry',
      }),
    });

    // Multi-turn scenario turn 1
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Tracking inquiry',
      }),
    });

    // Multi-turn scenario turn 2
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.9,
        reasoning: 'Follow up',
      }),
    });

    const report = await runBenchmark([singleTurnScenario, multiTurnScenario], {
      configurable: {
        useStubs: true,
        stubBehavior: {
          type: 'COMPLETE',
          message: 'Your order is processed.',
        },
      },
    });

    expect(report.totalScenarios).toBe(2);
    expect(report.passedScenarios).toBe(2);
    expect(report.passRate).toBe(1.0);
    expect(report.byDomain['orders']?.rate).toBe(1.0);
    expect(report.byEvaluator['ROUTING_CORRECT']?.rate).toBe(1.0);
    expect(report.byEvaluator['STATE_PRESERVED']?.rate).toBe(1.0);
    expect(report.scenarioResults).toHaveLength(2);
  });
});

