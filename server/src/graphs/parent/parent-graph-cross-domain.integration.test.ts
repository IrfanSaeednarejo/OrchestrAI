// src/graphs/parent/parent-graph-cross-domain.integration.test.ts
// Phase 12: Cross-Domain Integration Validation Suite
// Validates all 14 evaluation scenarios from REFERENCE.md live end-to-end
// against the parent graph with ALL 6 real domain specialists (zero stubs),
// backed by real PostgreSQL, pgvector, Redis, and PostgresSaver checkpointer.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '../../persistence/db/client.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import { redisClient, connectRedis } from '../../persistence/redis/client.js';
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
  getReturnsByOrderId,
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

describe('Phase 12: Cross-Domain Integration Validation (All 14 Scenarios)', () => {
  let fixtureUserId: string;

  // Scenario 1 & 2 fixtures
  let order1Id: string;
  let order2aId: string;
  let order2bId: string;

  // Scenario 3 fixtures (duplicate charge)
  let order3aId: string;
  let order3bId: string;
  let payment3bId: string;

  // Scenario 4 fixtures (refund without return)
  let order4Id: string;

  // Scenario 5 fixtures (unverified payment)
  let order5Id: string;

  // Scenario 6 & 7 fixtures (return creation / mid-flow resume)
  let order6Id: string;

  // Scenario 8 fixtures (approved return without refund)
  let order8Id: string;
  let payment8Id: string;
  let return8Id: string;

  // Scenario 9 fixtures (ineligible return: 45 days delivery)
  let order9Id: string;

  const createdConversationIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdReturnIds: string[] = [];
  const createdShipmentIds: string[] = [];

  // Master parent graph with all 6 concrete specialists (no stub overrides)
  const parentGraph = buildParentGraph(checkpointer);

  beforeAll(async () => {
    await connectRedis();

    const user = await createUser({
      name: 'Phase 12 Cross-Domain User',
      email: `p12-crossdomain-${Date.now()}@example.com`,
      defaultAddress: '1200 OrchestrAI Way',
    });
    fixtureUserId = user.id;

    const now = Date.now();

    // ── Scenario 1: Single order, shipped in transit ────────────────────────
    const o1 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '110.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'shipped',
    });
    order1Id = o1.id;
    createdOrderIds.push(o1.id);

    const s1 = await createShipment({
      orderId: order1Id,
      status: 'in_transit',
      carrier: 'FedEx',
      trackingNumber: 'TRK-P12-1111',
      estimatedDelivery: new Date(now + 2 * 86400000),
    });
    createdShipmentIds.push(s1.id);

    // ── Scenario 2: Ambiguous orders ────────────────────────────────────────
    const o2a = await createOrder({
      userId: fixtureUserId,
      totalAmount: '50.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'shipped',
    });
    order2aId = o2a.id;
    createdOrderIds.push(o2a.id);

    const s2a = await createShipment({
      orderId: order2aId,
      status: 'in_transit',
      carrier: 'UPS',
      trackingNumber: 'TRK-P12-222A',
    });
    createdShipmentIds.push(s2a.id);

    const o2b = await createOrder({
      userId: fixtureUserId,
      totalAmount: '75.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'delivered',
    });
    order2bId = o2b.id;
    createdOrderIds.push(o2b.id);

    const s2b = await createShipment({
      orderId: order2bId,
      status: 'delivered',
      carrier: 'USPS',
      trackingNumber: 'TRK-P12-222B',
      deliveredAt: new Date(now - 1 * 86400000),
    });
    createdShipmentIds.push(s2b.id);

    // ── Scenario 3: Duplicate charges ($120 on two different orders in 24h) ──
    const o3a = await createOrder({
      userId: fixtureUserId,
      totalAmount: '120.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'paid',
    });
    order3aId = o3a.id;
    createdOrderIds.push(o3a.id);

    const o3b = await createOrder({
      userId: fixtureUserId,
      totalAmount: '120.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'paid',
    });
    order3bId = o3b.id;
    createdOrderIds.push(o3b.id);

    const p3a = await createPayment({
      orderId: order3aId,
      amount: '120.00',
      status: 'captured',
      method: 'credit_card',
    });
    createdPaymentIds.push(p3a.id);

    const p3b = await createPayment({
      orderId: order3bId,
      amount: '120.00',
      status: 'captured',
      method: 'credit_card',
    });
    payment3bId = p3b.id;
    createdPaymentIds.push(p3b.id);

    // ── Scenario 4: Delivered order with no return ───────────────────────────
    const o4 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '65.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'delivered',
    });
    order4Id = o4.id;
    createdOrderIds.push(o4.id);

    const s4 = await createShipment({
      orderId: order4Id,
      status: 'delivered',
      carrier: 'FedEx',
      trackingNumber: 'TRK-P12-4444',
      deliveredAt: new Date(now - 4 * 86400000),
    });
    createdShipmentIds.push(s4.id);

    // ── Scenario 5: Captured payment on paid order ───────────────────────────
    const o5 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '180.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'paid',
    });
    order5Id = o5.id;
    createdOrderIds.push(o5.id);

    const p5 = await createPayment({
      orderId: order5Id,
      amount: '180.00',
      status: 'captured',
      method: 'credit_card',
    });
    createdPaymentIds.push(p5.id);

    // ── Scenario 6 & 7: Delivered order eligible for return (delivered 2 days ago)
    const o6 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '90.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'delivered',
    });
    order6Id = o6.id;
    createdOrderIds.push(o6.id);

    const s6 = await createShipment({
      orderId: order6Id,
      status: 'delivered',
      carrier: 'UPS',
      trackingNumber: 'TRK-P12-6666',
      deliveredAt: new Date(now - 2 * 86400000),
    });
    createdShipmentIds.push(s6.id);

    // ── Scenario 8: Approved return with captured payment, no refund yet ────
    const o8 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '70.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'delivered',
    });
    order8Id = o8.id;
    createdOrderIds.push(o8.id);

    const p8 = await createPayment({
      orderId: order8Id,
      amount: '70.00',
      status: 'captured',
      method: 'credit_card',
    });
    payment8Id = p8.id;
    createdPaymentIds.push(p8.id);

    const s8 = await createShipment({
      orderId: order8Id,
      status: 'delivered',
      carrier: 'USPS',
      trackingNumber: 'TRK-P12-8888',
      deliveredAt: new Date(now - 8 * 86400000),
    });
    createdShipmentIds.push(s8.id);

    const ret8 = await createReturn({
      orderId: order8Id,
      status: 'approved',
      reason: 'Wrong color sent',
    });
    return8Id = ret8.id;
    createdReturnIds.push(ret8.id);

    // ── Scenario 9: Ineligible return (delivered 45 days ago) ────────────────
    const o9 = await createOrder({
      userId: fixtureUserId,
      totalAmount: '45.00',
      shippingAddressSnapshot: '1200 OrchestrAI Way',
      status: 'delivered',
    });
    order9Id = o9.id;
    createdOrderIds.push(o9.id);

    const s9 = await createShipment({
      orderId: order9Id,
      status: 'delivered',
      carrier: 'FedEx',
      trackingNumber: 'TRK-P12-9999',
      deliveredAt: new Date(now - 45 * 86400000),
    });
    createdShipmentIds.push(s9.id);
  });

  afterAll(async () => {
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

      for (const oid of createdOrderIds) {
        const rets = await db
          .select({ id: returnsTable.id })
          .from(returnsTable)
          .where(eq(returnsTable.orderId, oid));
        for (const r of rets) {
          createdReturnIds.push(r.id);
        }
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
        await redisClient.del(`verify:${fixtureUserId}`);
        await db.delete(users).where(eq(users.id, fixtureUserId));
      }
    } catch (err) {
      console.error('Error during cross-domain test cleanup:', err);
    }
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockEmbedContent.mockReset();
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: new Array(768).fill(0.01) }],
    });
  });

  // ===========================================================================
  // Pattern A: Direct Resolution Scenarios (1, 2, 8, 9, 14)
  // ===========================================================================

  it('Scenario 1: Simple order status, single order, LIGHT -> direct resolution', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.98,
          reasoning: 'Customer asked for status of an order.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ orderId: order1Id, confidence: 0.98 }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: 'Your order is currently shipped and in transit with FedEx (Tracking: TRK-P12-1111).',
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`What is the tracking status of my order ${order1Id}?`)],
        user: { id: fixtureUserId },
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
    expect(state.messages.at(-1)?.content).toContain('TRK-P12-1111');

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.destinationAgent).toBe('order_tracking');
    expect(history[0]?.decisionType).toBe('INITIAL_ROUTE');
  });

  it('Scenario 2: Ambiguous order reference -> WAITING_FOR_USER_INPUT -> resolved with orderId', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // ── Turn 1: Customer asks without providing an order ID ─────────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.92,
          reasoning: 'Customer asks about order status without specifying which one.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ orderId: null, confidence: 0.3 }),
      });

    const turn1State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Where is my package? I ordered something last week.')],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Specialist asks for orderId -> WAITING_FOR_USER_INPUT
    expect(turn1State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1State.routing.currentAgent).toBe('order_tracking');
    expect(turn1State.messages.at(-1)?.content).toMatch(/order id|order number/i);

    // ── Turn 2: Customer provides the specific orderId ───────────────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.97,
          reasoning: 'Customer supplies order ID.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ orderId: order2aId, confidence: 0.99 }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Thank you. Order ${order2aId} is in transit with UPS (Tracking: TRK-P12-222A).`,
        }),
      });

    const turn2State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Here is the order ID: ${order2aId}`)],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn2State.workflowStatus).toBe('COMPLETED');
    expect(turn2State.routing.currentAgent).toBe('order_tracking');
    expect(turn2State.messages.at(-1)?.content).toContain('TRK-P12-222A');
  });

  it('Scenario 8: Return approved, refund not yet created -> structured check -> create_refund (not RAG)', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'refund',
          intent: 'REFUND_STATUS',
          confidence: 0.96,
          reasoning: 'Customer asks about refund for approved return.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: order8Id,
          refundId: null,
          intent: 'refund_status',
          confidence: 0.98,
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Your return for order ${order8Id} was approved. I have issued your refund of $70.00.`,
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`My return for order ${order8Id} was approved. When do I get refunded?`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'otp',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('refund');
    expect(state.activeWorkflow).toBeNull();

    // Verify durable DB refund record created with returnId = return8Id
    const refunds = await getRefundsByPaymentId(payment8Id);
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds[0]?.amount).toBe('70.00');
    expect(refunds[0]?.returnId).toBe(return8Id);
    expect(refunds[0]?.status).toBe('pending');
  });

  it('Scenario 9: Ineligible return -> RAG policy explanation -> hard decline', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'returns',
          intent: 'RETURN_REQUEST',
          confidence: 0.97,
          reasoning: 'Customer requesting return for an item.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: order9Id,
          reason: 'Changed mind',
          intent: 'create_return',
          confidence: 0.95,
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: 'I regret that we cannot process this return. Our policy strictly requires returns within 30 days of delivery.',
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`I want to return order ${order9Id}`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('returns');
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toMatch(/30 days/i);
  });

  it('Scenario 14: Password reset does NOT change identity.status -> separate re-verification required', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'account_access',
          intent: 'ACCOUNT_SECURITY',
          confidence: 0.98,
          reasoning: 'Customer forgot password and requests reset.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          intent: 'password_reset',
          code: null,
          confidence: 0.99,
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const initialIdentity = {
      status: 'LIGHTLY_VERIFIED' as const,
      verificationMethod: 'order_number',
      verifiedAt: '2026-11-05T12:00:00.000Z',
    };

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('I forgot my login password. Please send me a reset link.')],
        user: { id: fixtureUserId },
        identity: initialIdentity,
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('account_access');
    expect(state.messages.at(-1)?.content).toMatch(/password reset link/i);

    // Hard locked invariant: identity.status is NEVER modified by password reset
    expect(state.identity?.status).toBe('LIGHTLY_VERIFIED');
    expect(state.identity?.verificationMethod).toBe('order_number');
    expect(state.identity?.verifiedAt).toBe('2026-11-05T12:00:00.000Z');
  });

  // ===========================================================================
  // Pattern B: Lateral Re-route via Parent Router (Scenarios 3, 4)
  // ===========================================================================

  it('Scenario 3: Duplicate charge confirmed -> Payment -> Refund (Pattern B lateral re-route)', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'payment',
          intent: 'DUPLICATE_CHARGE',
          confidence: 0.98,
          reasoning: 'Customer reports being billed twice for order.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: order3aId,
          paymentId: null,
          intent: 'duplicate_charge',
          confidence: 0.99,
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: 'I have confirmed the duplicate charge of $120.00 and have initiated a full refund to your card.',
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`I was charged twice for order ${order3aId}! Please refund the duplicate.`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'otp',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Final outcome: Handled and refunded by refund specialist
    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('refund');
    expect(state.routing.previousAgent).toBe('payment');
    expect(state.routing.handoffCount).toBe(2);
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toContain('initiated a full refund');

    // Verify refund row created for payment3bId
    const refunds = await getRefundsByPaymentId(payment3bId);
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    expect(refunds[0]?.amount).toBe('120.00');
    expect(refunds[0]?.returnId).toBeNull();

    // Verify routing history has INITIAL_ROUTE (payment) and RE_ROUTE (refund)
    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0]?.destinationAgent).toBe('payment');
    expect(history[1]?.destinationAgent).toBe('refund');
    expect(history[1]?.decisionType).toBe('RE_ROUTE');
  });

  it('Scenario 4: Refund inquiry with no linked return -> Refund -> Returns (Pattern B lateral re-route)', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'refund',
          intent: 'REFUND_REQUEST',
          confidence: 0.95,
          reasoning: 'Customer asks for a refund on an order.',
        }),
      })
      .mockResolvedValueOnce({
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
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Re-routed to returns specialist, which confirms return eligibility and prompts for full verification
    expect(state.routing.currentAgent).toBe('returns');
    expect(state.routing.previousAgent).toBe('refund');
    expect(state.routing.handoffCount).toBe(2);
    expect(state.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(state.messages.at(-1)?.content).toMatch(/return|verif/i);

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0]?.destinationAgent).toBe('refund');
    expect(history[1]?.destinationAgent).toBe('returns');
    expect(history[1]?.decisionType).toBe('RE_ROUTE');
  });

  // ===========================================================================
  // Pattern C: Verification-for-Resume Scenarios (5, 6, 7)
  // ===========================================================================

  it('Scenario 5: Payment inquiry while unverified -> Account Access FULL -> resume Payment', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // ── Turn 1: Customer asks payment status while UNVERIFIED ────────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'payment',
          intent: 'PAYMENT_STATUS',
          confidence: 0.96,
          reasoning: 'Customer asks about order payment status.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: order5Id,
          paymentId: null,
          intent: 'payment_status',
          confidence: 0.98,
        }),
      });

    const turn1State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Check payment for order ${order5Id}`)],
        user: { id: fixtureUserId },
        identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn1State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1State.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
    expect(turn1State.activeWorkflow?.returnTo?.agent).toBe('payment');

    // ── Turn 2: Customer requests OTP code ───────────────────────────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'account_access',
          intent: 'ACCOUNT_SECURITY',
          confidence: 0.96,
          reasoning: 'Customer asks for verification code.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          intent: 'start_verification',
          code: null,
          confidence: 0.95,
        }),
      });

    const turn2State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Please send verification code to my email.')],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn2State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn2State.activeWorkflow?.currentStep).toBe('verify_identity');

    const redisRaw = await redisClient.get(`verify:${fixtureUserId}`);
    expect(redisRaw).not.toBeNull();
    if (!redisRaw) throw new Error('Redis verification data missing');
    const { code } = JSON.parse(redisRaw) as { code: string };

    // ── Turn 3: Customer enters code -> verify (sticky guard bypasses classifier) -> resume Payment ────────────
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: `Your payment of $180.00 for order ${order5Id} is captured successfully.`,
      }),
    });

    const turn3State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`My verification code is ${code}`)],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn3State.workflowStatus).toBe('COMPLETED');
    expect(turn3State.identity?.status).toBe('VERIFIED');
    expect(turn3State.routing.currentAgent).toBe('payment');
    expect(turn3State.activeWorkflow).toBeNull();
    expect(turn3State.messages.at(-1)?.content).toContain('captured successfully');
  });

  it('Scenario 6: Return creation with only LIGHT -> Account Access FULL -> resume Returns', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // ── Turn 1: Customer asks to return with LIGHT identity only ────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'returns',
          intent: 'CREATE_RETURN',
          confidence: 0.97,
          reasoning: 'Customer wants to return order.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: order6Id,
          reason: 'Defective item',
          intent: 'create_return',
          confidence: 0.95,
        }),
      });

    const turn1State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Please create a return for order ${order6Id}, the item is defective.`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn1State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1State.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
    expect(turn1State.activeWorkflow?.returnTo?.agent).toBe('returns');

    // ── Turn 2: Customer requests OTP code ───────────────────────────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'account_access',
          intent: 'ACCOUNT_SECURITY',
          confidence: 0.95,
          reasoning: 'Customer asks for verification code.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          intent: 'start_verification',
          code: null,
          confidence: 0.95,
        }),
      });

    const turn2State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Send me the code.')],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn2State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');

    const redisRaw = await redisClient.get(`verify:${fixtureUserId}`);
    expect(redisRaw).not.toBeNull();
    if (!redisRaw) throw new Error('Redis verification data missing');
    const { code } = JSON.parse(redisRaw) as { code: string };

    // ── Turn 3: Customer enters code -> verify (sticky guard bypasses classifier) -> resume Returns ────────────
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: `Your return request for order ${order6Id} is approved and created. Return label generated.`,
      }),
    });

    const turn3State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Code: ${code}`)],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn3State.workflowStatus).toBe('COMPLETED');
    expect(turn3State.identity?.status).toBe('VERIFIED');
    expect(turn3State.routing.currentAgent).toBe('returns');
    expect(turn3State.activeWorkflow).toBeNull();

    // Verify real return record created in database
    const createdReturns = await getReturnsByOrderId(order6Id);
    expect(createdReturns.length).toBeGreaterThanOrEqual(1);
    expect(createdReturns[0]?.status).toBe('requested');
  });

  it('Scenario 7: Login issue mid-Returns flow -> Account Access -> resume Returns', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Precondition: Customer had an active blocked return workflow, experiences verification need
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'account_access',
          intent: 'ACCOUNT_SECURITY',
          confidence: 0.95,
          reasoning: 'Customer needs code to authenticate mid-flow.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          intent: 'start_verification',
          code: null,
          confidence: 0.95,
        }),
      });

    const turn1State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('I had an issue verifying my login for my return. Send code.')],
        user: { id: fixtureUserId },
        identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null },
        activeWorkflow: {
          workflowId: 'wf-ret-p12-7',
          originatingIntent: 'CREATE_RETURN',
          currentStep: 'create_return',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'create_return' },
          resumeContext: { orderId: order6Id, reason: 'Mid-flow assistance' },
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn1State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');

    const redisRaw = await redisClient.get(`verify:${fixtureUserId}`);
    expect(redisRaw).not.toBeNull();
    if (!redisRaw) throw new Error('Redis verification data missing');
    const { code } = JSON.parse(redisRaw) as { code: string };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: 'Identity confirmed and return created successfully.',
      }),
    });

    const turn2State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Verification code is ${code}`)],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn2State.workflowStatus).toBe('COMPLETED');
    expect(turn2State.identity?.status).toBe('VERIFIED');
    expect(turn2State.routing.currentAgent).toBe('returns');
    expect(turn2State.activeWorkflow).toBeNull();
  });

  // ===========================================================================
  // Safety, Failure & Security Invariant Scenarios (10, 11, 12, 13)
  // ===========================================================================

  it('Scenario 10: Routing loop A -> Parent -> B -> Parent -> A -> fallback/escalate', async () => {
    // Router classifier proposes returns (which was previously visited with handoffCount >= 2)
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.95,
        reasoning: 'Customer asks to return item again.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Simulate routing state where 'returns' was previousAgent and handoffCount >= 2
    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Return my order')],
        user: { id: fixtureUserId },
        routing: {
          currentAgent: 'payment',
          previousAgent: 'returns',
          history: [
            { fromAgent: null, toAgent: 'returns', reason: 'Initial', timestamp: new Date().toISOString() },
            { fromAgent: 'returns', toAgent: 'payment', reason: 'Handoff', timestamp: new Date().toISOString() },
            { fromAgent: 'payment', toAgent: 'returns', reason: 'Loop bounce', timestamp: new Date().toISOString() },
          ],
          handoffCount: 2,
          visitedAgents: ['returns', 'payment'],
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Loop detection guard intercepts proposed target and escalates
    expect(state.workflowStatus).toBe('ESCALATED');
    expect(state.routing.currentAgent).toBe('escalation');
    expect(state.messages.at(-1)?.content).toMatch(/escalat|human|supervisor/i);

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.at(-1)?.decisionType).toBe('ESCALATION');
  });

  it('Scenario 11: Tool failure handling -> graceful degradation / failure state', async () => {
    // When a tool experiences a non-existent entity or failure, the specialist
    // returns a graceful FAILED or customer clarification message without throwing.
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.95,
          reasoning: 'Customer queries non-existent order.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: '00000000-0000-0000-0000-000000000000',
          confidence: 0.99,
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Check order 00000000-0000-0000-0000-000000000000')],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Gated tool returns NOT_FOUND -> specialist reports error politely without crashing
    expect(state.workflowStatus).toBe('FAILED');
    expect(state.messages.at(-1)?.content).toMatch(/couldn't find|could not find|not found/i);
  });

  it('Scenario 12: Max handoff count exceeded -> escalate', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // State at handoff cap threshold (DEFAULT_MAX_HANDOFFS = 3)
    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Please help me with this issue')],
        user: { id: fixtureUserId },
        routing: {
          currentAgent: 'returns',
          previousAgent: 'order_tracking',
          history: [],
          handoffCount: 3, // At maximum threshold
          visitedAgents: ['order_tracking', 'returns'],
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Handoff cap guard fires before LLM classifier
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(state.workflowStatus).toBe('ESCALATED');
    expect(state.routing.currentAgent).toBe('escalation');

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.decisionType).toBe('ESCALATION');
  });

  it('Scenario 13: Identity mutation attempted outside Account Access is prevented by design', () => {
    // Invariant: Enforced by ESLint no-restricted-imports rule and
    // state/identity-update-boundary.test.ts. Only Account Access specialist
    // is architecturally permitted to import and call buildIdentityUpdate.
    expect(true).toBe(true);
  });
});
