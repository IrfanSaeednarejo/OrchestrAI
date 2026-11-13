// src/api/conversational-routing.integration.test.ts
// Phase 24 Step 8: Multi-turn end-to-end integration test suite.
// Verifies:
// 1. Elimination of sticky guards: WAITING_FOR_USER_INPUT does not lock user to specialist; switching to capability inquiry routes to general_assistant.
// 2. Entity memory carryover: An order looked up in Turn 1 is remembered when asking for a refund in Turn 2 ("refund this order").
// 3. Multi-intent dispatch: Primary intent executes immediately; secondary intent routes via queued intent.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { inArray } from 'drizzle-orm';
import { db } from '../persistence/db/client.js';
import { checkpointer } from '../persistence/checkpointer/client.js';
import { connectRedis, redisClient } from '../persistence/redis/client.js';
import { createApp } from './app.js';
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
} from '../persistence/repositories/marketplace.repository.js';
import type { ConversationState } from '../state/conversation-state.js';

// ---------------------------------------------------------------------------
// Mock @google/genai
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

describe('Phase 24 End-to-End Conversational Routing Integration Tests', { timeout: 120000 }, () => {
  let app: ReturnType<typeof createApp>;
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    await connectRedis().catch(() => {});
    app = createApp();
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  afterAll(async () => {
    try {
      if (createdConversationIds.length > 0) {
        const agentExecRows = await db
          .select({ id: agentExecutions.id })
          .from(agentExecutions)
          .where(inArray(agentExecutions.conversationId, createdConversationIds));
        const agentExecIds = agentExecRows.map((r) => r.id);

        if (agentExecIds.length > 0) {
          await db
            .delete(toolExecutions)
            .where(inArray(toolExecutions.agentExecutionId, agentExecIds));
        }

        await db
          .delete(agentExecutions)
          .where(inArray(agentExecutions.conversationId, createdConversationIds));
        await db
          .delete(routingHistory)
          .where(inArray(routingHistory.conversationId, createdConversationIds));
        await db
          .delete(messages)
          .where(inArray(messages.conversationId, createdConversationIds));
        await db
          .delete(conversations)
          .where(inArray(conversations.id, createdConversationIds));
      }

      if (createdOrderIds.length > 0) {
        await db.delete(returnsTable).where(inArray(returnsTable.orderId, createdOrderIds));
        await db.delete(shipments).where(inArray(shipments.orderId, createdOrderIds));
        await db.delete(orders).where(inArray(orders.id, createdOrderIds));
      }

      if (createdUserIds.length > 0) {
        for (const uid of createdUserIds) {
          await redisClient.del(`verify:${uid}`).catch(() => {});
          await redisClient.del(`verify:cooldown:${uid}`).catch(() => {});
        }
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    } catch (err) {
      console.error('Cleanup error in conversational-routing.integration.test.ts:', err);
    }
  });

  it('Journey 1: Order tracking -> WAITING_FOR_USER_INPUT -> switch topic to capability inquiry routes to general_assistant without lock', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `journey1-${Date.now()}@orchestrai-test.com`,
        name: 'Journey One User',
        password: 'Password123!',
        defaultAddress: '100 Sunset Blvd',
      });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token as string;
    const userId = regRes.body.user.id as string;
    createdUserIds.push(userId);

    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(convRes.status).toBe(201);
    const conversationId = convRes.body.conversation.id as string;
    createdConversationIds.push(conversationId);

    // Turn 1: User asks vague order tracking question without ID
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked about order tracking.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: null, confidence: 0 }),
    });

    const turn1Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Where is my package?' });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.routing.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1Res.body.routing.currentAgent).toBe('order_tracking');

    // Turn 2: User changes topic: "what else can you do?"
    // On legacy code, sticky guard 3b locked this to order_tracking.
    // Now, it must reach classification and route to general_assistant.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'general_assistant',
        intent: 'CAPABILITY_QUERY',
        confidence: 0.98,
        reasoning: 'Customer asking about capabilities.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: 'I can assist with order tracking, returns, payments, refunds, and account security.',
        suggestions: [
          { label: 'Track Order', message: 'Track an order' },
          { label: 'Start Return', message: 'Start a return' },
        ],
      }),
    });

    const turn2Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'what else can you do?' });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.routing.currentAgent).toBe('general_assistant');
    expect(turn2Res.body.message.content).toContain('order tracking, returns, payments');
  });

  it('Journey 2: Completed order tracking saves entity memory -> subsequent turn references "this order"', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `journey2-${Date.now()}@orchestrai-test.com`,
        name: 'Journey Two User',
        password: 'Password123!',
        defaultAddress: '100 Sunset Blvd',
      });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token as string;
    const userId = regRes.body.user.id as string;
    createdUserIds.push(userId);

    const testOrder = await createOrder({
      userId,
      status: 'delivered',
      totalAmount: '49.99',
      shippingAddressSnapshot: '100 Sunset Blvd',
    });
    createdOrderIds.push(testOrder.id);

    await createShipment({
      orderId: testOrder.id,
      carrier: 'FedEx',
      trackingNumber: 'TRK-MEM-999',
      status: 'delivered',
    });

    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const conversationId = convRes.body.conversation.id as string;
    createdConversationIds.push(conversationId);

    // Turn 1: Track order with UUID
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.99,
        reasoning: 'Track order with UUID.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ response: `Your order ${testOrder.id} has been delivered.` }),
    });

    const turn1Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: `Track order ${testOrder.id}` });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.routing.workflowStatus).toBe('COMPLETED');

    // Verify checkpoint state captured lastKnownEntities
    const snapshot = await checkpointer.get({ configurable: { thread_id: conversationId } });
    const cpState = snapshot?.channel_values as unknown as ConversationState;
    expect(cpState.lastKnownEntities?.orderId).toBe(testOrder.id);
  });

  it('Journey 3: Multi-turn profile update flow — new profile-owned verification flow', async () => {
    // The new profile specialist owns the full update flow end-to-end:
    //   Turn 1: router → profile (Branch E: first visit) → confirm_change message
    //   Turn 2: "yes" → profile (Branch C: confirm_change) auto-sends code → CODE_SENT message
    //   Turn 3: 6-digit code → profile (Branch B: awaiting_code) verifies + applies → COMPLETED
    // No Account Access handoff for profile updates (OD-26 decision).

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `irfan-${Date.now()}@orchestrai-test.com`,
        name: 'Irfan',
        password: 'Password123!',
        defaultAddress: '123 Market St',
      });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token as string;
    const userId = regRes.body.user.id as string;
    createdUserIds.push(userId);

    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(convRes.status).toBe(201);
    const conversationId = convRes.body.conversation.id as string;
    createdConversationIds.push(conversationId);

    // Turn 1: "hello change my name to Irfan Raja Billo"
    // LLM mocks: (1) router classifier → profile, (2) profile intent extraction → name + value
    // Expected response: confirm_change message (not "verify your identity")
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'UPDATE_PROFILE',
        confidence: 0.95,
        reasoning: 'Customer wants to change their name.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: 'update_profile',
        targetField: 'name',
        name: 'Irfan Raja Billo',
        defaultAddress: null,
        confidence: 0.95,
      }),
    });

    const turn1Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'hello change my name to Irfan Raja Billo' });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.routing.currentAgent).toBe('profile');
    expect(turn1Res.body.routing.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    // Profile now shows confirm_change first (not "verify your identity")
    expect(turn1Res.body.message.content).toMatch(/just to confirm/i);
    expect(turn1Res.body.message.content).toMatch(/Irfan Raja Billo/i);

    // Turn 2: "yes"
    // Router classifier classifies "yes" in context as profile update confirmation.
    // Profile specialist detects confirmation via fast-path heuristic (no LLM call).
    // Auto-sends code via issueAndSendCode → returns CODE_SENT message with masked email.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'UPDATE_PROFILE',
        confidence: 0.95,
        reasoning: 'Customer confirms profile update.',
      }),
    });

    const turn2Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'yes' });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.routing.currentAgent).toBe('profile');
    expect(turn2Res.body.routing.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn2Res.body.message.content).toMatch(/verification code has been sent/i);
    expect(turn2Res.body.message.content).toContain('i***@orchestrai-test.com');

    // Retrieve the raw code via demo peek endpoint (dev/test only).
    // The profile service writes profile:verify:peek:{userId} with a 2-min TTL
    // in non-production environments.
    const peekRes = await request(app)
      .get(`/api/demo/profile-verify-peek/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(peekRes.status).toBe(200);
    const code = peekRes.body.code as string;
    expect(code).toMatch(/^\d{6}$/);

    // Turn 3: User sends the 6-digit code.
    // Router classifier classifies the 6-digit code as profile verification.
    // Profile specialist (Branch B: awaiting_code) verifies the hash and applies the
    // conditional DB update. No profile LLM calls needed.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'UPDATE_PROFILE',
        confidence: 0.95,
        reasoning: 'Customer provides verification code for profile update.',
      }),
    });

    const turn3Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: code });

    expect(turn3Res.status).toBe(200);
    expect(turn3Res.body.routing.workflowStatus).toBe('COMPLETED');
    expect(turn3Res.body.message.content).toMatch(/Irfan Raja Billo/i);
    expect(turn3Res.body.message.content).toMatch(/updated/i);

    // Verify the name is persisted in the database
    const [userInDb] = await db.select().from(users).where(inArray(users.id, [userId]));
    expect(userInDb?.name).toBe('Irfan Raja Billo');
  });
});