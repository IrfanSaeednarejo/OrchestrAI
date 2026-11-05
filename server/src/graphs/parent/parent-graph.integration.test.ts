// src/graphs/parent/parent-graph.integration.test.ts
// Phase 8 & 9: End-to-end integration tests for parent graph & stateful router.
// Uses real PostgreSQL database and PostgresSaver checkpointer;
// LLM is mocked via vi.mock('@google/genai') per testing conventions.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '../../persistence/db/client.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import {
  users,
  orders,
  shipments,
  returns as returnsTable,
  conversations,
  messages,
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../../persistence/db/schema.js';
import {
  createUser,
  createOrder,
  createShipment,
} from '../../persistence/repositories/marketplace.repository.js';
import {
  startConversation,
  sendMessage,
  loadConversation,
} from '../../services/conversation-lifecycle.service.js';
import { getRoutingHistoryByConversationId } from '../../persistence/repositories/orchestration.repository.js';
import { buildParentGraph } from './parent-graph.js';
import { SPECIALIST_STUBS, type StubBehavior } from '../../agents/specialists/stubs.js';

// ---------------------------------------------------------------------------
// Mock @google/genai — zero external network calls in test suite
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockEmbedContent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    embeddings: [{ values: new Array(768).fill(0.01) }],
  })
);

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
        embedContent: mockEmbedContent,
      };
    },
  };
});

describe('Parent Graph & Stateful Router Integration', () => {
  let fixtureUserId: string;
  let scenario1OrderId: string;
  let scenario9OrderId: string;
  const createdConversationIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdShipmentIds: string[] = [];

  const stubParentGraph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
  const parentGraph = buildParentGraph(checkpointer);

  beforeAll(async () => {
    const user = await createUser({
      name: 'Phase 8/9 Router Integration User',
      email: `p89-integration-${Date.now()}@example.com`,
      defaultAddress: '100 Routing Boulevard',
    });
    fixtureUserId = user.id;

    // Fixture for Scenario 1: Order Tracking (status: shipped, in_transit)
    const o1 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '120.00',
      shippingAddressSnapshot: '100 Routing Boulevard',
      status: 'shipped',
    });
    scenario1OrderId = o1.id;
    createdOrderIds.push(o1.id);

    const s1 = await createShipment({
      orderId: scenario1OrderId,
      status: 'in_transit',
      carrier: 'FedEx',
      trackingNumber: 'TRK-P9-1111',
      estimatedDelivery: new Date(Date.now() + 3 * 86400000),
    });
    createdShipmentIds.push(s1.id);

    // Fixture for Scenario 9: Ineligible Return (delivered 45 days ago > 30-day window)
    const o9 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '75.00',
      shippingAddressSnapshot: '100 Routing Boulevard',
      status: 'delivered',
    });
    scenario9OrderId = o9.id;
    createdOrderIds.push(o9.id);

    const s9 = await createShipment({
      orderId: scenario9OrderId,
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 45 * 86400000),
    });
    createdShipmentIds.push(s9.id);
  });

  afterAll(async () => {
    // Scoped FK-safe cleanup
    for (const cid of createdConversationIds) {
      const aRows = await db
        .select({ id: agentExecutions.id })
        .from(agentExecutions)
        .where(eq(agentExecutions.conversationId, cid));
      for (const a of aRows) {
        await db.delete(toolExecutions).where(eq(toolExecutions.agentExecutionId, a.id));
      }
      await db.delete(agentExecutions).where(eq(agentExecutions.conversationId, cid));
      await db.delete(routingHistory).where(eq(routingHistory.conversationId, cid));
      await db.delete(messages).where(eq(messages.conversationId, cid));
      await db.delete(conversations).where(eq(conversations.id, cid));
    }
    for (const sid of createdShipmentIds) {
      await db.delete(shipments).where(eq(shipments.id, sid));
    }
    for (const oid of createdOrderIds) {
      await db.delete(returnsTable).where(eq(returnsTable.orderId, oid));
      await db.delete(orders).where(eq(orders.id, oid));
    }
    if (fixtureUserId) {
      await db.delete(users).where(eq(users.id, fixtureUserId));
    }
  });

  beforeEach(() => {
    mockGenerateContent.mockClear();
    mockEmbedContent.mockClear();
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
      graph: stubParentGraph,
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
    const loaded = await loadConversation(convo.id, stubParentGraph);
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

    // Invoke stub graph directly with configurable stub behavior on this thread
    const resultState = await stubParentGraph.invoke(
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
    const resultState = await stubParentGraph.invoke(
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

  it('5. Scenario 1: Simple order status query routes to real order_tracking specialist and resolves with tracking details', async () => {
    // 1. Router classification
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked for shipping status of an order.',
      }),
    });

    // 2. Order Tracking specialist extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: scenario1OrderId,
        confidence: 0.98,
      }),
    });

    // 3. Order Tracking customer-facing response generation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: 'Your order is currently shipped and in transit with FedEx (Tracking: TRK-P9-1111).',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Where is my order ${scenario1OrderId}?`)],
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('order_tracking');
    expect(state.messages.at(-1)?.content).toContain('TRK-P9-1111');

    const historyRows = await getRoutingHistoryByConversationId(convo.id);
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.destinationAgent).toBe('order_tracking');
    expect(historyRows[0]?.decisionType).toBe('INITIAL_ROUTE');
  });

  it('6. Scenario 9: Ineligible return request routes to real returns specialist, retrieves policy, and declines', async () => {
    // 1. Router classification
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.95,
        reasoning: 'Customer wants to return an item.',
      }),
    });

    // 2. Returns specialist extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: scenario9OrderId,
        reason: 'Too small',
        intent: 'create_return',
        confidence: 0.95,
      }),
    });

    // 3. Returns specialist decline response generation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: 'We cannot accept your return because the order was delivered 45 days ago, which exceeds our 30-day return policy.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`I would like to return order ${scenario9OrderId}`)],
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.activeWorkflow).toBeNull();
    expect(state.routing.currentAgent).toBe('returns');
    expect(state.messages.at(-1)?.content).toMatch(/30-day/i);

    const historyRows = await getRoutingHistoryByConversationId(convo.id);
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.destinationAgent).toBe('returns');
    expect(historyRows[0]?.decisionType).toBe('INITIAL_ROUTE');
  });
});
