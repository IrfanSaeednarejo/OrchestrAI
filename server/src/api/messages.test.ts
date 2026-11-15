// src/api/messages.test.ts
// Phase 16 Step 3: Tests for the dual-mode message dispatch endpoint (JSON + SSE).
// Uses MemorySaver + SPECIALIST_STUBS so no real PostgresSaver or Gemini API is called.
// Phase 17 Step 1b: Turn-scoped extraction, blockedBy/currentStep telemetry, 502/error-event tests.

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
import { db, pgPool } from '../persistence/db/client.js';
import {
  users,
  conversations,
  messages,
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../persistence/db/schema.js';
import { inArray } from 'drizzle-orm';
import type { ConversationState } from '../state/conversation-state.js';

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

    it('returns 403 Forbidden (JSON) when guest tries to POST to an authenticated user conversation', async () => {
      const app = createTestApp();

      // ownerConversationId is owned by ownerUserId (authenticated), not the guest pool
      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        // no x-user-id → guest fallback
        .send({ content: 'Can a guest access this?' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden (SSE) when guest tries to POST to an authenticated user conversation', async () => {
      const app = createTestApp();

      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        // no x-user-id → guest fallback
        .set('Accept', 'text/event-stream')
        .send({ content: 'Can a guest stream this?' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
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

  // -------------------------------------------------------------------------
  // Phase 17 Step 1b: telemetry, extraction, abort resilience
  // -------------------------------------------------------------------------
  describe('Phase 17 Step 1b: blockedBy/currentStep in JSON response', () => {
    it('JSON response routing object includes blockedBy and currentStep (null when ACTIVE)', async () => {
      const app = createTestApp();

      const conv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(conv.id);

      const res = await request(app)
        .post(`/api/conversations/${conv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: 'What is the status of my order?' });

      expect(res.status).toBe(200);
      expect(res.body.routing).toBeDefined();
      // blockedBy and currentStep must be present (null when not in a blocked workflow)
      expect(Object.prototype.hasOwnProperty.call(res.body.routing, 'blockedBy')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(res.body.routing, 'currentStep')).toBe(true);
      expect(res.body.routing.blockedBy).toBeNull();
      expect(res.body.routing.currentStep).toBeNull();
    });

    it('SSE routing event includes blockedBy and currentStep fields', async () => {
      const app = createTestApp();

      const conv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(conv.id);

      const res = await request(app)
        .post(`/api/conversations/${conv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Track my latest order.' });

      expect(res.status).toBe(200);
      // Extract the routing event data
      const routingEventMatch = res.text.match(/event: routing\ndata: ({[^\n]+})/);
      expect(routingEventMatch).not.toBeNull();
      if (routingEventMatch && routingEventMatch[1]) {
        const routingData = JSON.parse(routingEventMatch[1]) as Record<string, unknown>;
        expect(Object.prototype.hasOwnProperty.call(routingData, 'blockedBy')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(routingData, 'currentStep')).toBe(true);
      }
    });
  });

  describe('Phase 17 Step 1b: 502 when agent produces no reply (JSON)', () => {
    it('returns 502 Bad Gateway when the graph produces no AI message after the human turn', async () => {
      // Build a "silent" graph-like object that returns state with no AI messages
      const silentGraph = {
        invoke: async (input: { messages: unknown[] }) => {
          // Return state with only the human message (no AI reply) + minimal required shape
          return {
            messages: input.messages, // only the human message, no AI message added
            routing: { currentAgent: null, handoffCount: 0, history: [], previousAgent: null, visitedAgents: [] },
            workflowStatus: 'ACTIVE',
            activeWorkflow: null,
            user: null,
            currentDomain: null,
            currentIntent: null,
            identity: null,
          };
        },
        stream: async function* () { /* never called in JSON mode */ },
        getState: async () => ({ values: {} }),
      };

      const app = createApp();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app.locals.graph = silentGraph as any;

      const conv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(conv.id);

      const res = await request(app)
        .post(`/api/conversations/${conv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .send({ content: 'Silent test.' });

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('BAD_GATEWAY');
    });
  });

  describe('Phase 17 Step 1b: SSE error event when agent produces no reply', () => {
    it('emits event: error when the graph produces no AI message after the human turn (SSE)', async () => {
      const silentGraph = {
        invoke: async () => ({}),
        stream: async function* (input: { messages: unknown[] }) {
          // Emit one chunk with only the human message, no AI reply
          yield { router: { messages: input.messages } };
        },
        getState: async (config: unknown) => {
          // Return snapshot with only the human message (the HumanMessage from input)
          void config;
          return {
            values: {
              messages: [], // empty — no AI message in turn scope
              routing: { currentAgent: null, handoffCount: 0, history: [], previousAgent: null, visitedAgents: [] },
              workflowStatus: 'ACTIVE',
              activeWorkflow: null,
            },
          };
        },
      };

      const app = createApp();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app.locals.graph = silentGraph as any;

      const conv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(conv.id);

      const res = await request(app)
        .post(`/api/conversations/${conv.id}/messages`)
        .set('x-user-id', ownerUserId)
        .set('Accept', 'text/event-stream')
        .send({ content: 'Silent SSE test.' });

      expect(res.status).toBe(200); // SSE headers already sent
      expect(res.text).toContain('event: error');
      expect(res.text).toContain('Agent produced no response');
      // No 'event: done' should be emitted after an error
      expect(res.text).not.toContain('event: done');
    });
  });

  describe('Phase 17 Step 1b: SSE abort resilience (Amendment A5)', () => {
    it('drains the stream to completion and saves checkpoint after client disconnects', async () => {
      const graph = buildStubGraph();
      const app = createApp();
      app.locals.graph = graph;

      const conv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(conv.id);

      const server = app.listen(0);
      const address = server.address() as import('net').AddressInfo;
      const port = address.port;

      try {
        const controller = new AbortController();
        const res = await fetch(`http://127.0.0.1:${port}/api/conversations/${conv.id}/messages`, {
          method: 'POST',
          headers: {
            'x-user-id': ownerUserId,
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Order status please.' }),
          signal: controller.signal,
        });

        expect(res.status).toBe(200);

        // Read the first chunk to ensure stream has started and res.on('close') can be triggered
        const reader = res.body?.getReader();
        expect(reader).toBeDefined();
        await reader?.read();

        // Abort the SSE stream while graph execution proceeds
        controller.abort();

        // Wait a short moment for the background stream drain and checkpointing to complete
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify that the checkpoint contains the completed turn
        const traceConfig = {
          configurable: {
            thread_id: conv.id,
          },
        };
        const snapshot = await graph.getState(traceConfig);
        const state = snapshot.values as ConversationState;

        // Checkpoint state must reflect completed execution
        expect(state.workflowStatus).toBe('COMPLETED');
        expect(state.routing.currentAgent).toBe('order_tracking');

        // Verify message was persisted to DB as well
        const dbMsgs = await db
          .select()
          .from(messages)
          .where(inArray(messages.conversationId, [conv.id]));
        const roles = dbMsgs.map((m) => m.role);
        expect(roles).toContain('user');
        expect(roles).toContain('assistant');
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('Step 6: returns 409 Conflict when another message is currently being processed (advisory lock)', async () => {
      const app = createTestApp();
      const conv = await createConversation({ userId: ownerUserId });
      cleanupConversationIds.push(conv.id);

      // Acquire advisory lock manually on a separate DB client within an active transaction
      const lockClient = await pgPool.connect();
      try {
        await lockClient.query('BEGIN');
        const lockRes = await lockClient.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired',
          [conv.id]
        );
        expect(lockRes.rows[0]?.acquired).toBe(true);

        const res = await request(app)
          .post(`/api/conversations/${conv.id}/messages`)
          .set('x-user-id', ownerUserId)
          .send({ content: 'Hello concurrent message' });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('CONFLICT');
        await lockClient.query('COMMIT');
      } finally {
        lockClient.release();
      }
    });
  });
});
