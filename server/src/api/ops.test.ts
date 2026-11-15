// src/api/ops.test.ts
// Phase 18 Step 1: Tests for dev-gated Ops API endpoints.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from '../persistence/db/client.js';
import { conversations, users, routingHistory, agentExecutions } from '../persistence/db/schema.js';
import { inArray } from 'drizzle-orm';
import { createConversation } from '../persistence/repositories/conversation.repository.js';
import { createRoutingHistoryEntry } from '../persistence/repositories/orchestration.repository.js';

// ---------------------------------------------------------------------------
// Mock eval runner to avoid running the full benchmark in ops tests
// ---------------------------------------------------------------------------
vi.mock('../evaluation/runner/eval-runner.js', () => ({
  runBenchmark: vi.fn().mockResolvedValue({
    totalScenarios: 1,
    passedScenarios: 1,
    passRate: 1.0,
    byEvaluator: {},
    byDomain: {},
    scenarioResults: [],
  }),
}));

describe('Phase 18 Step 1: Ops API Endpoints', () => {
  const TEST_PREFIX = 'ops-test-';
  const createdConvIds: string[] = [];
  const createdUserIds: string[] = [];
  let testConvId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user
    const u = await db
      .insert(users)
      .values({ name: 'Ops Test User', email: `${TEST_PREFIX}user@example.com`, defaultAddress: '1 Test St' })
      .returning();
    const insertedUser = u[0];
    if (!insertedUser) throw new Error('Failed to insert test user');
    testUserId = insertedUser.id;
    createdUserIds.push(testUserId);

    // Create a test conversation
    const conv = await createConversation({ userId: testUserId, status: 'active' });
    testConvId = conv.id;
    createdConvIds.push(testConvId);

    // Add a routing history entry
    await createRoutingHistoryEntry({
      conversationId: testConvId,
      sourceAgent: null,
      destinationAgent: 'order_tracking',
      intent: 'ORDER_STATUS',
      decisionType: 'INITIAL_ROUTE',
      reason: 'Classified as order tracking',
      timestamp: new Date(),
    });
  });

  afterAll(async () => {
    if (createdConvIds.length > 0) {
      await db.delete(agentExecutions).where(inArray(agentExecutions.conversationId, createdConvIds));
      await db.delete(routingHistory).where(inArray(routingHistory.conversationId, createdConvIds));
      await db.delete(conversations).where(inArray(conversations.id, createdConvIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  // -------------------------------------------------------------------------
  // Gated off
  // -------------------------------------------------------------------------
  describe('When ops endpoints are disabled', () => {
    const app = createApp((a) => { a.locals.enableDemoEndpoints = false; });

    it('GET /api/ops/conversations returns 404', async () => {
      const res = await request(app).get('/api/ops/conversations');
      expect(res.status).toBe(404);
    });

    it('GET /api/ops/conversations/:id/traces returns 404', async () => {
      const res = await request(app).get(`/api/ops/conversations/${testConvId}/traces`);
      expect(res.status).toBe(404);
    });

    it('GET /api/ops/eval-results returns 404', async () => {
      const res = await request(app).get('/api/ops/eval-results');
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Enabled
  // -------------------------------------------------------------------------
  describe('When ops endpoints are enabled', () => {
    const app = createApp((a) => { a.locals.enableDemoEndpoints = true; });

    it('GET /api/ops/conversations returns paginated conversation list with user metadata', async () => {
      const res = await request(app).get('/api/ops/conversations?limit=10&offset=0');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.conversations)).toBe(true);

      const found = res.body.conversations.find(
        (c: { id: string }) => c.id === testConvId
      );
      expect(found).toBeDefined();
      expect(found.user.email).toBe(`${TEST_PREFIX}user@example.com`);
      expect(typeof found.turnCount).toBe('number');
    });

    it('GET /api/ops/conversations rejects invalid pagination', async () => {
      const res = await request(app).get('/api/ops/conversations?limit=0&offset=-1');
      expect(res.status).toBe(400);
    });

    it('GET /api/ops/conversations/:id/traces returns timeline with handoff path', async () => {
      const res = await request(app).get(`/api/ops/conversations/${testConvId}/traces`);

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBe(testConvId);
      expect(Array.isArray(res.body.timeline)).toBe(true);
      expect(Array.isArray(res.body.handoffPath)).toBe(true);
      expect(res.body.handoffPath).toContain('order_tracking');
    });

    it('GET /api/ops/conversations/:id/traces returns 404 for unknown conversation', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000099';
      const res = await request(app).get(`/api/ops/conversations/${fakeId}/traces`);
      expect(res.status).toBe(404);
    });

    it('GET /api/ops/eval-results returns BenchmarkReport shape', async () => {
      const res = await request(app).get('/api/ops/eval-results');

      expect(res.status).toBe(200);
      expect(typeof res.body.report.totalScenarios).toBe('number');
      expect(typeof res.body.report.passRate).toBe('number');
    });
  });
});
