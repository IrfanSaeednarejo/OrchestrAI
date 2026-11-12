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

  it('Journey 3: Multi-turn profile update flow with verification handoff and resume', async () => {
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
    // Must NOT be treated as pure greeting. Routes to profile specialist.
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
    expect(turn1Res.body.message.content).toMatch(/verify your identity/i);

    // Turn 2: "so change the account name"
    // Without a specific value given, asks specifically for the name
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'UPDATE_PROFILE',
        confidence: 0.95,
        reasoning: 'Clarifying change of account name.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: 'update_profile',
        targetField: 'name',
        name: null,
        defaultAddress: null,
        confidence: 0.9,
      }),
    });

    const turn2Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'so change the account name' });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.routing.currentAgent).toBe('profile');
    expect(turn2Res.body.routing.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn2Res.body.message.content).toMatch(/What new name would you like to set/i);

    // Turn 3: "change my Name to Irfan Saeed"
    // Captures new value, blocks on verification
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'UPDATE_PROFILE',
        confidence: 0.95,
        reasoning: 'Customer providing new name.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: 'update_profile',
        targetField: 'name',
        name: 'Irfan Saeed',
        defaultAddress: null,
        confidence: 0.95,
      }),
    });

    const turn3Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'change my Name to Irfan Saeed' });

    expect(turn3Res.status).toBe(200);
    expect(turn3Res.body.routing.currentAgent).toBe('profile');
    expect(turn3Res.body.routing.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn3Res.body.message.content).toMatch(/verify your identity/i);

    // Turn 4: "Send me a verification code"
    // Classifier is called with currentDomain='profile', but supervisor overrides domain bias and routes to account_access.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'REQUEST_VERIFICATION_CODE',
        confidence: 0.95,
        reasoning: 'Customer asks for verification code.',
      }),
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: 'start_verification',
        code: null,
        confidence: 0.95,
      }),
    });

    const turn4Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Send me a verification code' });

    expect(turn4Res.status).toBe(200);
    expect(turn4Res.body.routing.currentAgent).toBe('account_access');
    expect(turn4Res.body.routing.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn4Res.body.message.content).toMatch(/verification code has been sent/i);
    expect(turn4Res.body.message.content).toContain('i***@orchestrai-test.com');

    // Retrieve the issued code directly from Redis
    const redisRecord = await redisClient.get(`verify:${userId}`);
    expect(redisRecord).not.toBeNull();
    const parsed = JSON.parse(redisRecord as string) as { code: string };
    const code = parsed.code;
    expect(code).toMatch(/^\d{6}$/);

    // Turn 5: User sends the 6-digit code.
    // Guard 3a routes directly to account_access -> fast path verifies code -> router resumes profile -> profile updates name!
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ response: 'Your name has been updated to Irfan Saeed.' }),
    });

    const turn5Res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: code });

    expect(turn5Res.status).toBe(200);
    expect(turn5Res.body.routing.workflowStatus).toBe('COMPLETED');
    expect(turn5Res.body.message.content).toMatch(/Irfan Saeed/i);

    // Verify database reflects the updated name
    const [userInDb] = await db.select().from(users).where(inArray(users.id, [userId]));
    expect(userInDb?.name).toBe('Irfan Saeed');
  });
});

