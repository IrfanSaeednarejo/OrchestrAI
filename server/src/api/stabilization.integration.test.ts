// src/api/stabilization.integration.test.ts
// Phase 23 Step 7: Multi-turn HTTP stabilization integration tests.
// Validates end-to-end HTTP customer journeys through Express:
//   1. Real Bearer auth registration -> login -> order tracking -> zero 502s, LIGHTLY_VERIFIED identity, grounded response.
//   2. Multi-turn return flow: LIGHT verification -> blocked by FULL -> OTP verification -> resume Returns -> return created -> activeWorkflow cleared.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { inArray } from 'drizzle-orm';
import { db } from '../persistence/db/client.js';
import { checkpointer } from '../persistence/checkpointer/client.js';
import { redisClient, connectRedis } from '../persistence/redis/client.js';
import { createApp } from './app.js';
import { buildParentGraph } from '../graphs/parent/parent-graph.js';
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
} from '../persistence/db/schema.js';
import {
  createOrder,
  createShipment,
  getReturnsByOrderId,
} from '../persistence/repositories/marketplace.repository.js';
import type { ConversationState } from '../state/conversation-state.js';

// ---------------------------------------------------------------------------
// Mock @google/genai — zero external network calls in test suite
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockEmbedContent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    embeddings: [{ values: new Array(768).fill(0.01) }],
  })
);

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent,
    };
  },
}));

describe('Phase 23 Step 7: Stabilization HTTP Integration Tests', () => {
  const app = createApp();
  const parentGraph = buildParentGraph(checkpointer);
  app.locals.graph = parentGraph;

  const cleanupUserIds: string[] = [];
  const cleanupOrderIds: string[] = [];
  const cleanupShipmentIds: string[] = [];
  const cleanupConversationIds: string[] = [];
  const cleanupReturnIds: string[] = [];

  beforeAll(async () => {
    await connectRedis();
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  afterAll(async () => {
    try {
      if (cleanupConversationIds.length > 0) {
        const agentExecRows = await db
          .select({ id: agentExecutions.id })
          .from(agentExecutions)
          .where(inArray(agentExecutions.conversationId, cleanupConversationIds));
        const agentExecIds = agentExecRows.map((r) => r.id);

        if (agentExecIds.length > 0) {
          await db
            .delete(toolExecutions)
            .where(inArray(toolExecutions.agentExecutionId, agentExecIds));
        }

        await db
          .delete(agentExecutions)
          .where(inArray(agentExecutions.conversationId, cleanupConversationIds));
        await db
          .delete(routingHistory)
          .where(inArray(routingHistory.conversationId, cleanupConversationIds));
        await db
          .delete(messages)
          .where(inArray(messages.conversationId, cleanupConversationIds));
        await db
          .delete(conversations)
          .where(inArray(conversations.id, cleanupConversationIds));
      }

      if (cleanupReturnIds.length > 0) {
        await db.delete(returnsTable).where(inArray(returnsTable.id, cleanupReturnIds));
      }

      if (cleanupShipmentIds.length > 0) {
        await db.delete(shipments).where(inArray(shipments.id, cleanupShipmentIds));
      }

      if (cleanupOrderIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, cleanupOrderIds));
      }

      if (cleanupUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, cleanupUserIds));
      }
    } catch (err) {
      console.error('Cleanup error in stabilization.integration.test.ts:', err);
    }
  });

  it('Journey 1: Bearer token user asks order status -> LIGHTLY_VERIFIED identity, zero 502s, grounded tracking response', async () => {
    const email = `bearer-test-${Date.now()}@orchestrai-test.com`;
    const password = 'StrongPassword123!';
    const name = 'Bearer Customer';

    // 1. Register a new user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password,
        name,
        defaultAddress: '100 Sunset Blvd',
      })
      .expect(201);

    expect(regRes.body).toHaveProperty('token');
    const token = regRes.body.token as string;
    const userId = regRes.body.user.id as string;
    cleanupUserIds.push(userId);

    // 2. Login to obtain session token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginRes.body.token).toBeDefined();

    // 3. Create an order and shipment for this user
    const order = await createOrder({
      userId,
      totalAmount: '149.99',
      shippingAddressSnapshot: '100 Sunset Blvd',
      status: 'shipped',
    });
    cleanupOrderIds.push(order.id);

    const shipment = await createShipment({
      orderId: order.id,
      status: 'in_transit',
      carrier: 'FedEx',
      trackingNumber: 'TRK-STAB-9999',
      estimatedDelivery: new Date(Date.now() + 2 * 86400000),
    });
    cleanupShipmentIds.push(shipment.id);

    // 4. Create conversation with Bearer token
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const conversationId = convRes.body.conversation.id as string;
    cleanupConversationIds.push(conversationId);
    expect(convRes.body.conversation.userId).toBe(userId);

    // 5. Setup LLM mocks for order status workflow (classifier + grounded response)
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.98,
          reasoning: 'Customer asks for tracking status.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Your order is currently shipped and in transit with FedEx (Tracking: TRK-STAB-9999).`,
        }),
      });

    // 6. Send message asking for order status
    const msgRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: `Where is my order ${order.id}?` })
      .expect(200);

    expect(msgRes.status).toBe(200);
    expect(msgRes.body.message.content).toContain('TRK-STAB-9999');
    expect(msgRes.body.routing.currentAgent).toBe('order_tracking');

    // 7. Verify checkpoint identity was seeded to LIGHTLY_VERIFIED
    const snapshot = await parentGraph.getState({
      configurable: { thread_id: conversationId },
    });
    const state = snapshot.values as ConversationState;
    expect(state.identity?.status).toBe('LIGHTLY_VERIFIED');
    expect(state.identity?.verificationMethod).toBe('session');
  }, 45_000);

  it('Journey 2: Multi-turn return flow -> blocked by FULL -> OTP verification -> resume Returns -> return created', async () => {
    const email = `return-test-${Date.now()}@orchestrai-test.com`;
    const password = 'StrongPassword123!';
    const name = 'Return Customer';

    // 1. Register & login
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password,
        name,
        defaultAddress: '200 Ocean Ave',
      })
      .expect(201);

    const token = regRes.body.token as string;
    const userId = regRes.body.user.id as string;
    cleanupUserIds.push(userId);

    // 2. Create delivered order (delivered 2 days ago, eligible for return)
    const order = await createOrder({
      userId,
      totalAmount: '89.50',
      shippingAddressSnapshot: '200 Ocean Ave',
      status: 'delivered',
    });
    cleanupOrderIds.push(order.id);

    const shipment = await createShipment({
      orderId: order.id,
      status: 'delivered',
      carrier: 'UPS',
      trackingNumber: 'TRK-RET-1234',
      deliveredAt: new Date(Date.now() - 2 * 86400000),
    });
    cleanupShipmentIds.push(shipment.id);

    // 3. Create conversation
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const conversationId = convRes.body.conversation.id as string;
    cleanupConversationIds.push(conversationId);

    // ── Turn 1: Customer requests return creation ───────────────────────────
    // Bearer token gives LIGHTLY_VERIFIED, but create_return requires FULL.
    // Specialist blocks with Pattern C (WAITING_FOR_USER_INPUT).
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'returns',
          intent: 'CREATE_RETURN',
          confidence: 0.98,
          reasoning: 'Customer wants to return order.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: order.id,
          reason: 'Defective zipper',
          intent: 'create_return',
          confidence: 0.95,
        }),
      });

    const turn1Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: `I need to return order ${order.id}. The zipper is defective.` })
      .expect(200);

    expect(turn1Res.body.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1Res.body.routing.blockedBy).toBe('VERIFICATION_FULL');
    expect(turn1Res.body.message.content).toMatch(/verif/i);

    // ── Turn 2: Customer requests OTP verification code ────────────────────
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'account_access',
          intent: 'ACCOUNT_SECURITY',
          confidence: 0.96,
          reasoning: 'Customer requests verification code.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          intent: 'start_verification',
          code: null,
          confidence: 0.95,
        }),
      });

    const turn2Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Please send a verification code to my email.' })
      .expect(200);

    expect(turn2Res.body.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn2Res.body.routing.currentStep).toBe('verify_identity');

    // Retrieve the OTP stored in Redis
    const redisRaw = await redisClient.get(`verify:${userId}`);
    expect(redisRaw).not.toBeNull();
    if (!redisRaw) throw new Error('Expected verification code in Redis');
    const { code } = JSON.parse(redisRaw) as { code: string };

    // ── Turn 3: Customer provides OTP code -> verify -> resume Returns ──────
    // Account access verifies OTP -> promotes identity to VERIFIED (FULL).
    // Sticky guard triggers resume to Returns -> Returns creates return record.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: `Your return request for order ${order.id} has been approved and created. Return label generated.`,
      }),
    });

    const turn3Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: `The code is ${code}` })
      .expect(200);

    expect(turn3Res.body.workflowStatus).toBe('COMPLETED');
    expect(turn3Res.body.routing.currentAgent).toBe('returns');
    expect(turn3Res.body.routing.blockedBy).toBeNull();
    expect(turn3Res.body.message.content).toContain('approved and created');

    // Verify DB return record was actually created
    const createdReturns = await getReturnsByOrderId(order.id);
    expect(createdReturns.length).toBeGreaterThan(0);
    const firstReturn = createdReturns[0];
    expect(firstReturn?.orderId).toBe(order.id);
    if (firstReturn) {
      cleanupReturnIds.push(firstReturn.id);
    }
  }, 60_000);
});

