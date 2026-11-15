// src/graphs/parent/parent-graph.test.ts
// Phase 8: Unit tests for parent graph & stateful router.
// Fast in-memory execution with MemorySaver and mocked @google/genai.

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

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

import { buildParentGraph } from './parent-graph.js';
import { SPECIALIST_STUBS, type StubBehavior } from '../../agents/specialists/stubs.js';

describe('Parent Graph & Stateful Router', () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  it('routes initial order tracking message to order_tracking specialist and completes', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked about order tracking.',
      }),
    });

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Where is my package #ord-123?')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('order_tracking');
    expect(result.routing.visitedAgents).toContain('order_tracking');
    expect(result.currentIntent).toBe('ORDER_STATUS');
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('routes directly to resume target when activeWorkflow preconditions are met without calling LLM', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('I verified my identity.')],
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: '2026-11-05T00:00:00Z',
        },
        activeWorkflow: {
          workflowId: 'wf-pay-1',
          originatingIntent: 'get_payment',
          currentStep: 'get_payment',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
          resumeContext: { orderId: 'ord-123' },
        },
      },
      { configurable: { thread_id: threadId } }
    );

    // LLM should not have been called because deterministic resume guard fired first
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('payment');
  });

  it('escalates to human agent when handoff cap (>= 3) is reached without calling LLM', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Still need help')],
        routing: {
          currentAgent: 'returns',
          previousAgent: 'order_tracking',
          history: [],
          handoffCount: 3, // at limit
          visitedAgents: ['order_tracking', 'returns'],
        },
      },
      { configurable: { thread_id: threadId } }
    );

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.workflowStatus).toBe('ESCALATED');
    expect(result.routing.currentAgent).toBe('escalation');
  });

  it('detects routing loop and escalates', async () => {
    // LLM wants to route to 'returns', but 'returns' is the previous agent and handoffCount >= 2
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.9,
        reasoning: 'Customer asked for return.',
      }),
    });

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Send me back to returns')],
        routing: {
          currentAgent: 'order_tracking',
          previousAgent: 'returns', // ping-pong target
          history: [],
          handoffCount: 2,
          visitedAgents: ['returns', 'order_tracking'],
        },
      },
      { configurable: { thread_id: threadId } }
    );

    expect(result.workflowStatus).toBe('ESCALATED');
    expect(result.routing.currentAgent).toBe('escalation');
  });

  it('handles specialist handoff back to router and re-routes to target specialist', async () => {
    // 1st LLM call: router classifies initial message to returns
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.95,
        reasoning: 'Initial returns classification',
      }),
    });

    // 2nd LLM call: after returns stub hands off with detectedIntent refund_request
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_REQUEST',
        confidence: 0.95,
        reasoning: 'Re-routing after returns handoff to refund',
      }),
    });

    const handoffBehavior: StubBehavior = {
      type: 'HANDOFF',
      handoffRequest: {
        sourceAgent: 'returns',
        handoffReason: 'Item non-returnable, issuing refund instead',
        detectedIntent: 'refund_request',
        recommendedDomain: 'refund',
        relevantContext: { orderId: 'ord-123' },
        attemptedActions: ['check_return_eligibility'],
        confidence: 0.95,
      },
    };

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('I want to return this damaged item')],
      },
      {
        configurable: {
          thread_id: threadId,
          stubBehaviors: {
            returns: handoffBehavior,
          },
        },
      }
    );

    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('refund');
    expect(result.routing.previousAgent).toBe('returns');
    expect(result.routing.handoffCount).toBe(2); // 1 from handoff + 1 from re-route
  });

  it('records FALLBACK decision when classifier fails and defaults to order_tracking', async () => {
    // Classifier throws or produces invalid response
    mockGenerateContent.mockRejectedValueOnce(new Error('LLM rate limit / network error'));

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Help with something unexpected')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('order_tracking');
    expect(result.routing.history.at(-1)?.reason).toContain('Classifier fallback');
  });

  it('terminal ESCALATED state lock: subsequent messages do NOT call LLM and stay ESCALATED', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Hello, is anyone there?')],
        workflowStatus: 'ESCALATED',
        routing: {
          currentAgent: 'escalation',
          previousAgent: 'returns',
          history: [],
          handoffCount: 1,
          visitedAgents: ['returns', 'escalation'],
        },
      },
      { configurable: { thread_id: threadId } }
    );

    // LLM must not be called because conversation is locked in ESCALATED state
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.workflowStatus).toBe('ESCALATED');
    expect(result.routing.currentAgent).toBe('escalation');
    expect(result.messages.at(-1)?.content).toMatch(/human specialist/i);
  });

  it('greets customer directly from router on "hello there" and routes to specialist on subsequent turn', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    // Turn 1: Greeting
    const turn1 = await graph.invoke(
      {
        messages: [new HumanMessage('hello there')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(turn1.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1.routing.currentAgent).toBe('router');
    expect(turn1.currentIntent).toBe('GREETING');
    expect(turn1.messages.at(-1)?.content).toMatch(/OrchestrAI's autonomous customer support assistant/i);

    // Turn 2: Customer provides order request
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer provided order status inquiry.',
      }),
    });

    const turn2 = await graph.invoke(
      {
        messages: [new HumanMessage('Where is my package #ord-123?')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(turn2.workflowStatus).toBe('COMPLETED');
    expect(turn2.routing.currentAgent).toBe('order_tracking');
    expect(turn2.routing.handoffCount).toBe(0); // initial route from router supervisor, not lateral handoff
  });
});


