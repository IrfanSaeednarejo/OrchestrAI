// src/api/api.integration.test.ts
// Phase 16 Step 4: Full API integration test.
// Tests the complete conversation lifecycle: create → send → list → history → traces.
// Uses real Postgres + Redis + MemorySaver (no PostgresSaver) + mocked @google/genai.

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

function buildStubGraph() {
  const checkpointer = new MemorySaver();
  return buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
}

function createTestApp() {
  const app = createApp();
  app.locals.graph = buildStubGraph();
  return app;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Phase 16 Step 4: Full API Integration', () => {
  let userId: string;
  let otherUserId: string;
  const cleanupConversationIds: string[] = [];

  beforeAll(async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.9,
        reasoning: 'Integration test routing.',
      }),
    });

    const user = await createUser({
      name: 'Integration Test User',
      email: `int-test-${Date.now()}@example.com`,
      defaultAddress: '1 Integration Ave',
    });
    userId = user.id;

    const other = await createUser({
      name: 'Integration Other User',
      email: `int-other-${Date.now()}@example.com`,
      defaultAddress: '2 Other Ave',
    });
    otherUserId = other.id;
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

      const userIds = [userId, otherUserId].filter(Boolean);
      if (userIds.length > 0) {
        await db.delete(users).where(inArray(users.id, userIds));
      }
    } catch (err) {
      console.error('Cleanup error in api.integration.test.ts:', err);
    }
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------
  describe('Health check', () => {
    it('GET /health returns 200 with db and redis status', async () => {
      const app = createTestApp();
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.services.database).toBe('up');
      expect(res.body.services.redis).toBe('up');
    });
  });

  // -------------------------------------------------------------------------
  // Complete conversation lifecycle
  // -------------------------------------------------------------------------
  describe('Full conversation lifecycle', () => {
    let conversationId: string;

    it('step 1: POST /api/conversations creates a new conversation', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userId)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.conversation.userId).toBe(userId);
      expect(res.body.conversation.status).toBe('active');

      conversationId = res.body.conversation.id as string;
      cleanupConversationIds.push(conversationId);
    });

    it('step 2: GET /api/conversations lists the new conversation', async () => {
      const app = createTestApp();

      const res = await request(app)
        .get('/api/conversations')
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.conversations)).toBe(true);
      const found = (res.body.conversations as { id: string }[]).find(
        (c) => c.id === conversationId
      );
      expect(found).toBeDefined();
    });

    it('step 3: GET /api/conversations/:id returns conversation detail', async () => {
      const app = createTestApp();

      const res = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe(conversationId);
    });

    it('step 4: POST /api/conversations/:id/messages dispatches and returns assistant reply', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('x-user-id', userId)
        .send({ content: 'What is the status of my order?' });

      expect(res.status).toBe(200);
      expect(res.body.message.role).toBe('assistant');
      expect(typeof res.body.message.content).toBe('string');
      expect(res.body.workflowStatus).toBeDefined();
    });

    it('step 5: GET /api/conversations/:id/messages returns persisted messages', async () => {
      const app = createTestApp();

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      // Both user and assistant messages should have been persisted
      const roles = (res.body.messages as { role: string }[]).map((m) => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });

    it('step 6: GET /api/conversations/:id/traces returns trace timeline', async () => {
      const app = createTestApp();

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/traces`)
        .set('x-user-id', userId);

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBe(conversationId);
      expect(typeof res.body.eventCount).toBe('number');
      expect(Array.isArray(res.body.timeline)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-conversation access control
  // -------------------------------------------------------------------------
  describe('Cross-conversation access control', () => {
    let ownedConvId: string;

    beforeAll(async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userId)
        .send({});
      ownedConvId = res.body.conversation.id as string;
      cleanupConversationIds.push(ownedConvId);
    });

    it('GET /api/conversations/:id returns 403 when other user tries to access', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get(`/api/conversations/${ownedConvId}`)
        .set('x-user-id', otherUserId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/conversations/:id/traces returns 403 when other user tries to access', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get(`/api/conversations/${ownedConvId}/traces`)
        .set('x-user-id', otherUserId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/conversations/:id/messages returns 403 when other user tries to send', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post(`/api/conversations/${ownedConvId}/messages`)
        .set('x-user-id', otherUserId)
        .send({ content: 'Unauthorized send.' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // -------------------------------------------------------------------------
  // SSE streaming in integration context
  // -------------------------------------------------------------------------
  describe('SSE streaming integration', () => {
    it('POST /api/conversations/:id/messages SSE streams events and closes cleanly', async () => {
      const app = createTestApp();

      // Create a fresh conversation for SSE
      const convRes = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userId)
        .send({});
      expect(convRes.status).toBe(201);
      const sseConvId = convRes.body.conversation.id as string;
      cleanupConversationIds.push(sseConvId);

      const res = await request(app)
        .post(`/api/conversations/${sseConvId}/messages`)
        .set('x-user-id', userId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Tell me about my recent orders.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(res.text).toContain('event: start');
      expect(res.text).toContain('event: done');
      expect(res.text).toContain('"success":true');
    });
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------
  describe('Error handling', () => {
    it('GET /health returns 404 for unknown routes', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID in conversation ID param', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/conversations/not-valid-uuid')
        .set('x-user-id', userId);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for bad JSON body', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userId)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('returns 400 for invalid x-user-id header', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/conversations')
        .set('x-user-id', 'not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 404 when x-user-id refers to non-existent user', async () => {
      const app = createTestApp();
      const nonExistentId = crypto.randomUUID();
      const res = await request(app)
        .get('/api/conversations')
        .set('x-user-id', nonExistentId);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

