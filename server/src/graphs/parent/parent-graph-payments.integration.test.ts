// src/graphs/parent/parent-graph-payments.integration.test.ts
// Phase 10: Integration tests for Payments Specialists & Pattern B lateral handoffs.
// Covers REFERENCE.md Scenarios 3, 4, and 8 against real PostgreSQL and PostgresSaver checkpointer.
// External LLM calls are mocked per testing conventions.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '../../persistence/db/client.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import {
  users,
  orders,
  payments as paymentsTable,
  shipments,
  returns as returnsTable,
  refunds as refundsTable,
  conversations,
  messages,
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../../persistence/db/schema.js';
import {
  createUser,
  createOrder,
  createPayment,
  createShipment,
  createReturn,
  getRefundsByPaymentId,
} from '../../persistence/repositories/marketplace.repository.js';
import {
  startConversation,
} from '../../services/conversation-lifecycle.service.js';
import { getRoutingHistoryByConversationId } from '../../persistence/repositories/orchestration.repository.js';
import { buildParentGraph } from './parent-graph.js';

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

describe('Phase 10: Payments Specialists Integration (Scenarios 3, 4, 8)', () => {
  let fixtureUserId: string;
  let order3aId: string;
  let order3bId: string;
  let payment3bId: string;

  let order4Id: string;

  let order8Id: string;
  let payment8Id: string;
  let return8Id: string;

  const createdConversationIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdReturnIds: string[] = [];
  const createdShipmentIds: string[] = [];

  const parentGraph = buildParentGraph(checkpointer);

  beforeAll(async () => {
    const user = await createUser({
      name: 'Phase 10 Payments Integration User',
      email: `p10-payments-${Date.now()}@example.com`,
      defaultAddress: '200 Payments Plaza',
    });
    fixtureUserId = user.id;

    // ── Fixtures for Scenario 3: Duplicate Charge ─────────────────────────
    // Same user, same amount ($150.00), both captured, within 24h
    const o3a = await createOrder({
      userId: fixtureUserId,
      totalAmount: '150.00',
      shippingAddressSnapshot: '200 Payments Plaza',
      status: 'paid',
    });
    order3aId = o3a.id;
    createdOrderIds.push(o3a.id);

    const o3b = await createOrder({
      userId: fixtureUserId,
      totalAmount: '150.00',
      shippingAddressSnapshot: '200 Payments Plaza',
      status: 'paid',
    });
    order3bId = o3b.id;
    createdOrderIds.push(o3b.id);

    const now = Date.now();
    const p3a = await createPayment({
      orderId: order3aId,
      amount: '150.00',
      status: 'captured',
      method: 'credit_card',
    });
    createdPaymentIds.push(p3a.id);

    const p3b = await createPayment({
      orderId: order3bId,
      amount: '150.00',
      status: 'captured',
      method: 'credit_card',
    });
    payment3bId = p3b.id;
    createdPaymentIds.push(p3b.id);

    // ── Fixtures for Scenario 4: Refund without return ────────────────────
    const o4 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '60.00',
      shippingAddressSnapshot: '200 Payments Plaza',
      status: 'delivered',
    });
    order4Id = o4.id;
    createdOrderIds.push(o4.id);

    const s4 = await createShipment({
      orderId: order4Id,
      status: 'delivered',
      carrier: 'UPS',
      trackingNumber: 'TRK-P10-4444',
      deliveredAt: new Date(now - 5 * 86400000), // delivered 5 days ago (eligible)
    });
    createdShipmentIds.push(s4.id);

    // ── Fixtures for Scenario 8: Approved return without refund ───────────
    const o8 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '85.50',
      shippingAddressSnapshot: '200 Payments Plaza',
      status: 'delivered',
    });
    order8Id = o8.id;
    createdOrderIds.push(o8.id);

    const p8 = await createPayment({
      orderId: order8Id,
      amount: '85.50',
      status: 'captured',
      method: 'credit_card',
    });
    payment8Id = p8.id;
    createdPaymentIds.push(p8.id);

    const s8 = await createShipment({
      orderId: order8Id,
      status: 'delivered',
      carrier: 'USPS',
      trackingNumber: 'TRK-P10-8888',
      deliveredAt: new Date(now - 10 * 86400000),
    });
    createdShipmentIds.push(s8.id);

    const ret8 = await createReturn({
      orderId: order8Id,
      status: 'approved',
      reason: 'Wrong size delivered',
    });
    return8Id = ret8.id;
    createdReturnIds.push(ret8.id);
  });

  afterAll(async () => {
    // Scoped cleanup of all created fixture rows
    try {
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

      if (createdPaymentIds.length > 0) {
        await db.delete(refundsTable).where(inArray(refundsTable.paymentId, createdPaymentIds));
      }

      if (createdReturnIds.length > 0) {
        await db.delete(returnsTable).where(inArray(returnsTable.id, createdReturnIds));
      }

      if (createdPaymentIds.length > 0) {
        await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
      }

      if (createdShipmentIds.length > 0) {
        await db.delete(shipments).where(inArray(shipments.id, createdShipmentIds));
      }

      if (createdOrderIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, createdOrderIds));
      }

      if (fixtureUserId) {
        await db.delete(users).where(eq(users.id, fixtureUserId));
      }
    } catch (err) {
      console.warn('Phase 10 cleanup error:', err);
    }
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockEmbedContent.mockReset();
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: new Array(768).fill(0.01) }],
    });
  });

  it('Scenario 3: Duplicate charge confirmed -> Payment -> Refund (Pattern B lateral re-route)', async () => {
    // 1. Router classifies customer message to payment specialist
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'payment',
        intent: 'DUPLICATE_CHARGE',
        confidence: 0.98,
        reasoning: 'Customer reports being billed twice for order.',
      }),
    });

    // 2. Payment specialist extracts orderId and intent
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: order3aId,
        paymentId: null,
        intent: 'duplicate_charge',
        confidence: 0.99,
      }),
    });

    // 3. Refund specialist generates customer response confirming duplicate refund
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: 'I have confirmed the duplicate charge of $150.00 and have initiated a full refund to your card.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`I was charged twice for order ${order3aId}! Please refund the duplicate.`)],
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Verify end state
    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('refund');
    expect(state.routing.previousAgent).toBe('payment');
    expect(state.routing.handoffCount).toBe(2); // 1 from handoff + 1 from re-route
    expect(state.activeWorkflow).toBeNull(); // Cleared by refund upon completion

    // Verify response message
    expect(state.messages.at(-1)?.content).toContain('initiated a full refund');

    // Verify real DB refund row created with returnId: null
    const refunds = await getRefundsByPaymentId(payment3bId);
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds[0]?.amount).toBe('150.00');
    expect(refunds[0]?.returnId).toBeNull(); // Crucial: duplicate charge refund has returnId = null
    expect(refunds[0]?.status).toBe('pending');

    // Verify durable routing history in Postgres
    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBe(2);
    expect(history[0]?.decisionType).toBe('INITIAL_ROUTE');
    expect(history[0]?.destinationAgent).toBe('payment');
    expect(history[1]?.decisionType).toBe('RE_ROUTE');
    expect(history[1]?.destinationAgent).toBe('refund');
  });

  it('Scenario 4: Refund inquiry with no linked return -> Refund -> Returns (Pattern B lateral re-route)', async () => {
    // 1. Router classifies customer message to refund specialist
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_REQUEST',
        confidence: 0.95,
        reasoning: 'Customer asks for a refund on an order.',
      }),
    });

    // 2. Refund specialist extracts orderId
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: order4Id,
        refundId: null,
        intent: 'refund_request',
        confidence: 0.95,
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Can I get a refund for order ${order4Id}?`)],
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Verify end state: re-routed to Returns specialist
    expect(state.routing.currentAgent).toBe('returns');
    expect(state.routing.previousAgent).toBe('refund');
    expect(state.routing.handoffCount).toBe(2);

    // Verify durable routing history in Postgres
    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBe(2);
    expect(history[0]?.decisionType).toBe('INITIAL_ROUTE');
    expect(history[0]?.destinationAgent).toBe('refund');
    expect(history[1]?.decisionType).toBe('RE_ROUTE');
    expect(history[1]?.destinationAgent).toBe('returns');
  });

  it('Scenario 8: Return approved, refund not yet created -> structured check -> create_refund (not RAG)', async () => {
    // 1. Router classifies to refund specialist
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_STATUS',
        confidence: 0.96,
        reasoning: 'Customer asks about refund for approved return.',
      }),
    });

    // 2. Refund specialist extracts orderId
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: order8Id,
        refundId: null,
        intent: 'refund_status',
        confidence: 0.97,
      }),
    });

    // 3. Refund specialist customer-facing confirmation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: `I checked your approved return and processed your refund of $85.50 for order ${order8Id}.`,
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [
          new HumanMessage(
            `My return for order ${order8Id} was approved several days ago, when will I receive my refund?`
          ),
        ],
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Verify end state
    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('refund');
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toContain('processed your refund of $85.50');

    // Verify real DB refund row created with returnId = return8Id
    const refunds = await getRefundsByPaymentId(payment8Id);
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds[0]?.amount).toBe('85.50');
    expect(refunds[0]?.returnId).toBe(return8Id); // Crucial: returnId linked to approved return
    expect(refunds[0]?.status).toBe('pending');

    // Verify routing history
    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBe(1);
    expect(history[0]?.decisionType).toBe('INITIAL_ROUTE');
    expect(history[0]?.destinationAgent).toBe('refund');
  });
});
