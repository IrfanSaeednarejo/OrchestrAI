// src/graphs/parent/parent-graph.integration.test.ts
// Phase 8: End-to-end integration tests for parent graph & stateful router.
// Uses real PostgreSQL database and PostgresSaver checkpointer;
// LLM is mocked via vi.mock('@google/genai') per testing conventions.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '../../persistence/db/client.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import { users, conversations, messages, routingHistory } from '../../persistence/db/schema.js';
import { createUser } from '../../persistence/repositories/marketplace.repository.js';
import {
  startConversation,
  sendMessage,
  loadConversation,
} from '../../services/conversation-lifecycle.service.js';
import { getRoutingHistoryByConversationId } from '../../persistence/repositories/orchestration.repository.js';
import { buildParentGraph } from './parent-graph.js';
import type { StubBehavior } from '../../agents/specialists/stubs.js';

// ---------------------------------------------------------------------------
// Mock @google/genai — zero external network calls in test suite
// ---------------------------------------------------------------------------

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

describe('Parent Graph & Stateful Router Integration', () => {
  let fixtureUserId: string;
  const createdConversationIds: string[] = [];
  const parentGraph = buildParentGraph(checkpointer);

  beforeAll(async () => {
    const user = await createUser({
      name: 'Phase 8 Router Integration User',
      email: `p8-integration-${Date.now()}@example.com`,
      defaultAddress: '100 Routing Boulevard',
    });
    fixtureUserId = user.id;
  });

  afterAll(async () => {
    // Scoped FK-safe cleanup
    for (const cid of createdConversationIds) {
      await db.delete(routingHistory).where(eq(routingHistory.conversationId, cid));
      await db.delete(messages).where(eq(messages.conversationId, cid));
      await db.delete(conversations).where(eq(conversations.id, cid));
    }
    if (fixtureUserId) {
      await db.delete(users).where(eq(users.id, fixtureUserId));
    }
  });

  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  it('1. Initial Route: persists user message, logs routing_history row, and checkpoints state', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked about shipping status.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const { message, state } = await sendMessage({
      conversationId: convo.id,
      role: 'user',
      content: 'Where is my order #ord-777?',
      graph: parentGraph,
    });

    // 1. User message row persisted
    expect(message.id).toBeDefined();
    expect(message.content).toBe('Where is my order #ord-777?');

    // 2. Runtime state assertions
    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('order_tracking');
    expect(state.routing.visitedAgents).toContain('order_tracking');
    expect(state.currentIntent).toBe('ORDER_STATUS');

    // 3. Durable routing_history table record
    const historyRows = await getRoutingHistoryByConversationId(convo.id);
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.destinationAgent).toBe('order_tracking');
    expect(historyRows[0]?.decisionType).toBe('INITIAL_ROUTE');
    expect(historyRows[0]?.intent).toBe('ORDER_STATUS');

    // 4. Reload from PostgresSaver checkpointer
    const loaded = await loadConversation(convo.id, parentGraph);
    expect(loaded.state).not.toBeNull();
    expect(loaded.state?.routing.currentAgent).toBe('order_tracking');
    expect(loaded.state?.workflowStatus).toBe('COMPLETED');
  });

  it('2. Multi-turn Lateral Handoff: persists multi-step routing_history and accumulates handoff count', async () => {
    // Turn 1 router classification -> returns
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.92,
        reasoning: 'Customer wants to return an item.',
      }),
    });

    // Lateral re-route after returns stub hands off -> refund
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_REQUEST',
        confidence: 0.96,
        reasoning: 'Returns handed off to refund specialist.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const handoffBehavior: StubBehavior = {
      type: 'HANDOFF',
      handoffRequest: {
        sourceAgent: 'returns',
        handoffReason: 'Item is ineligible for return, initiating direct refund',
        detectedIntent: 'refund_request',
        recommendedDomain: 'refund',
        relevantContext: { orderId: 'ord-888' },
        attemptedActions: ['check_return_eligibility'],
        confidence: 0.96,
      },
    };

    // Invoke graph directly with configurable stub behavior on this thread
    const resultState = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Can I return this damaged item?')],
      },
      {
        configurable: {
          thread_id: convo.id,
          conversationId: convo.id,
          stubBehaviors: {
            returns: handoffBehavior,
          },
        },
      }
    );

    expect(resultState.workflowStatus).toBe('COMPLETED');
    expect(resultState.routing.currentAgent).toBe('refund');
    expect(resultState.routing.previousAgent).toBe('returns');
    expect(resultState.routing.handoffCount).toBe(2);

    // Durable routing history in Postgres should record both the INITIAL_ROUTE and the HANDOFF
    const historyRows = await getRoutingHistoryByConversationId(convo.id);
    expect(historyRows.length).toBeGreaterThanOrEqual(2);
    expect(historyRows[0]?.decisionType).toBe('INITIAL_ROUTE');
    expect(historyRows[0]?.destinationAgent).toBe('returns');
    expect(historyRows[1]?.decisionType).toBe('HANDOFF');
    expect(historyRows[1]?.destinationAgent).toBe('refund');
  });

  it('3. Resume Route: routes directly to returnTo when verification precondition is met', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Invoke with satisfied identity precondition and activeWorkflow.returnTo
    const resultState = await parentGraph.invoke(
      {
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'bank_id',
          verifiedAt: '2026-11-05T00:00:00Z',
        },
        activeWorkflow: {
          workflowId: 'wf-resume-1',
          originatingIntent: 'view_payment',
          currentStep: 'get_payment',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
          resumeContext: { orderId: 'ord-999' },
        },
      },
      {
        configurable: {
          thread_id: convo.id,
          conversationId: convo.id,
        },
      }
    );

    // LLM must not be called
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(resultState.workflowStatus).toBe('COMPLETED');
    expect(resultState.routing.currentAgent).toBe('payment');

    const historyRows = await getRoutingHistoryByConversationId(convo.id);
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.decisionType).toBe('RE_ROUTE');
    expect(historyRows[0]?.destinationAgent).toBe('payment');
  });

  it('4. Escalation: transitions to ESCALATED and records ESCALATION event when handoff cap reached', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const resultState = await parentGraph.invoke(
      {
        routing: {
          currentAgent: 'returns',
          previousAgent: 'order_tracking',
          history: [],
          handoffCount: 3, // at threshold
          visitedAgents: ['order_tracking', 'returns'],
        },
      },
      {
        configurable: {
          thread_id: convo.id,
          conversationId: convo.id,
        },
      }
    );

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(resultState.workflowStatus).toBe('ESCALATED');
    expect(resultState.routing.currentAgent).toBe('escalation');

    const historyRows = await getRoutingHistoryByConversationId(convo.id);
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.decisionType).toBe('ESCALATION');
    expect(historyRows[0]?.destinationAgent).toBe('escalation');
  });
});
