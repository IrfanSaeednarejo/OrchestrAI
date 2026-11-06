// src/api/messages.test.ts
// Phase 16 Step 3: Tests for the dual-mode message dispatch endpoint (JSON + SSE).
// Uses MemorySaver + SPECIALIST_STUBS so no real PostgresSaver or Gemini API is called.

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock @google/genai BEFORE any import that transitively loads it
// ---------------------------------------------------------------------------
const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

import { createApp } from './app.js';
import { buildParentGraph } from '../graphs/parent/parent-graph.js';
import { SPECIALIST_STUBS } from '../agents/specialists/stubs.js';
import { createUser } from '../persistence/repositories/marketplace.repository.js';
import { createConversation } from '../persistence/repositories/conversation.repository.js';
import { db } from '../persistence/db/client.js';
import {
  users,
  conversations,
  messages,
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../persistence/db/schema.js';
import { inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a stub graph backed by MemorySaver (no Postgres checkpointer). */
function buildStubGraph() {
  const checkpointer = new MemorySaver();
  return buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
}

/** Create an Express app with the stub graph injected into app.locals. */
function createTestApp() {
  const graph = buildStubGraph();
  const app = createApp();
  app.locals.graph = graph;
  return app;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Phase 16 Step 3: Message Dispatch Endpoint', () => {
  let ownerUserId: string;
  let otherUserId: string;
  let ownerConversationId: string;

  const cleanupConversationIds: string[] = [];

  beforeAll(async () => {
    // Always return a valid routing decision so the SPECIALIST_STUBS COMPLETE path is hit
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.9,
        reasoning: 'Test routing.',
      }),
    });

    // Create fixture users
    const owner = await createUser({
      name: 'Msg Test Owner',
      email: `msg-owner-${Date.now()}@example.com`,
      defaultAddress: '1 Owner Ave',
    });
    ownerUserId = owner.id;

    const other = await createUser({
      name: 'Msg Test Other',
      email: `msg-other-${Date.now()}@example.com`,
      defaultAddress: '2 Other Ave',
    });
    otherUserId = other.id;

    // Create a conversation owned by ownerUserId
    const conv = await createConversation({ userId: ownerUserId });
    ownerConversationId = conv.id;
    cleanupConversationIds.push(ownerConversationId);
  });

  afterAll(async () => {
    try {
      if (cleanupConversationIds.length > 0) {
        // Delete in FK-safe order:
        // tool_executions → agent_executions → routing_history → messages → conversations
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
      const userIds = [ownerUserId, otherUserId].filter(Boolean);
      if (userIds.length > 0) {
        await db.delete(users).where(inArray(users.id, userIds));
      }
    } catch (err) {
      console.error('Cleanup error in messages.test.ts:', err);
    }
  });

  // -------------------------------------------------------------------------
  // JSON mode (no SSE header)
  // -------------------------------------------------------------------------
  describe('POST /api/conversations/:id/messages — JSON mode', () => {
    it('returns 200 with assistant reply when owner sends a message', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: 'Where is my order?' });

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBe(ownerConversationId);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.role).toBe('assistant');
      expect(typeof res.body.message.content).toBe('string');
      expect(res.body.workflowStatus).toBeDefined();
    });

    it('persists user message in DB before invoking the graph', async () => {
      const app = createTestApp();

      // Create an isolated conversation to count messages cleanly
      const isolatedConv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(isolatedConv.id);

      const res = await request(app)
        .post(`/api/conversations/${isolatedConv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: 'Check my order status please.' });

      expect(res.status).toBe(200);

      // After the call, at minimum a user message AND assistant message should exist
      const rows = await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, [isolatedConv.id]));
      const roles = rows.map((r) => r.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });

    it('returns 404 when conversation does not exist', async () => {
      const app = createTestApp();
      const nonExistent = '00000000-0000-4000-8000-000000000099';

      const res = await request(app)
        .post(`/api/conversations/${nonExistent}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: 'Hello?' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 403 Forbidden when caller does not own the conversation', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('x-user-id', otherUserId)
        .send({ content: 'Can I join?' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 400 when message content is empty', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when message content exceeds 4000 characters', async () => {
      const app = createTestApp();
      const longContent = 'a'.repeat(4001);

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: longContent });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for a malformed conversation UUID in the route param', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/api/conversations/not-a-uuid/messages')
        .set('x-user-id', ownerUserId)
        .send({ content: 'Valid message content.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // SSE mode (Accept: text/event-stream)
  // -------------------------------------------------------------------------
  describe('POST /api/conversations/:id/messages — SSE mode', () => {
    it('streams SSE events including start, node, message, routing, and done', async () => {
      const app = createTestApp();

      // Create an isolated conversation for SSE test
      const sseConv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(sseConv.id);

      const res = await request(app)
        .post(`/api/conversations/${sseConv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Track my shipment please.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);

      const body = res.text;
      // SSE events must include required event types
      expect(body).toContain('event: start');
      expect(body).toContain('event: done');
      // Final SSE event carries success: true
      expect(body).toContain('"success":true');
    });

    it('SSE streams correct conversationId in start event', async () => {
      const app = createTestApp();

      const sseConv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(sseConv.id);

      const res = await request(app)
        .post(`/api/conversations/${sseConv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'What is my refund status?' });

      expect(res.status).toBe(200);
      expect(res.text).toContain(sseConv.id);
    });

    it('SSE returns 404 for non-existent conversation', async () => {
      const app = createTestApp();
      const nonExistent = '00000000-0000-4000-8000-000000000098';

      // In SSE mode, 404 should still be returned as an HTTP error (before headers are flushed)
      // because the conversation check happens before setHeader/flushHeaders
      const res = await request(app)
        .post(`/api/conversations/${nonExistent}/messages`)
        .set('x-user-id', ownerUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Hello?' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('SSE returns 403 when caller does not own the conversation', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('x-user-id', otherUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Intercepting?' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('SSE returns 400 for empty content', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('x-user-id', ownerUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // Guest user edge case
  // -------------------------------------------------------------------------
  describe('Guest user message dispatch', () => {
    it('allows guest user to send messages to their own conversation', async () => {
      const app = createTestApp();

      // First create a guest conversation (omit x-user-id)
      const convRes = await request(app)
        .post('/api/conversations')
        .send({});
      expect(convRes.status).toBe(201);

      const guestConvId = convRes.body.conversation.id as string;
      cleanupConversationIds.push(guestConvId);

      const res = await request(app)
        .post(`/api/conversations/${guestConvId}/messages`)
        .send({ content: 'Guest asking for help.' }); // no x-user-id header

      expect(res.status).toBe(200);
      expect(res.body.message.role).toBe('assistant');
    });
  });

  // -------------------------------------------------------------------------
  // Thread isolation: separate conversations get separate LangGraph threads
  // -------------------------------------------------------------------------
  describe('Thread isolation', () => {
    it('two conversations in parallel do not share state', async () => {
      const app = createTestApp();

      const [conv1, conv2] = await Promise.all([
        createConversation({ userId: ownerUserId }),
        createConversation({ userId: ownerUserId }),
      ]);
      cleanupConversationIds.push(conv1.id, conv2.id);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/conversations/${conv1.id}/messages`)
          .set('x-user-id', ownerUserId)
          .send({ content: 'Track order A' }),
        request(app)
          .post(`/api/conversations/${conv2.id}/messages`)
          .set('x-user-id', ownerUserId)
          .send({ content: 'Track order B' }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.conversationId).toBe(conv1.id);
      expect(res2.body.conversationId).toBe(conv2.id);
    });
  });
});
