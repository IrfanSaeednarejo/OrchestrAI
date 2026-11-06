// src/api/health.test.ts
// Phase 16: Unit & integration tests for health endpoint, error middleware, and auth middleware.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { connectRedis } from '../persistence/redis/client.js';
import { createUser } from '../persistence/repositories/marketplace.repository.js';
import { db } from '../persistence/db/client.js';
import { users } from '../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware, DEFAULT_GUEST_USER_ID } from './middleware/auth.middleware.js';
import { validateRequest } from './middleware/validation.middleware.js';
import { z } from 'zod';
import { asyncHandler } from './utils/async-handler.js';

describe('Phase 16 Step 1: Core App & Health Check', () => {
  const app = createApp();
  let testUserId: string;

  beforeAll(async () => {
    await connectRedis();
    const user = await createUser({
      name: 'API Health Test User',
      email: `api-health-${Date.now()}@example.com`,
      defaultAddress: '100 API Way',
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('GET /health returns 200 with healthy database and redis status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.database).toBe('up');
    expect(res.body.services.redis).toBe('up');
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns 404 with structured JSON for unknown routes', async () => {
    const res = await request(app).get('/unknown-api-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Route not found: GET /unknown-api-endpoint');
  });

  it('handles malformed JSON body with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"invalidJson": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  describe('Auth Middleware', () => {
    const testApp = createApp((appInstance) => {
      appInstance.get(
        '/test-auth',
        authMiddleware,
        asyncHandler(async (req, res) => {
          res.json({ user: req.user });
        })
      );
    });

    it('resolves valid x-user-id header to database user', async () => {
      const res = await request(testApp)
        .get('/test-auth')
        .set('x-user-id', testUserId);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(testUserId);
      expect(res.body.user.name).toBe('API Health Test User');
    });

    it('falls back to guest identity when x-user-id is omitted', async () => {
      const res = await request(testApp).get('/test-auth');

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(DEFAULT_GUEST_USER_ID);
      expect(res.body.user.isGuest).toBe(true);
    });

    it('returns 400 for malformed non-UUID x-user-id', async () => {
      const res = await request(testApp)
        .get('/test-auth')
        .set('x-user-id', 'not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('must be a valid UUID');
    });

    it('returns 404 for valid UUID x-user-id that does not exist in database', async () => {
      const nonExistentId = '11111111-1111-4111-8111-111111111111';
      const res = await request(testApp)
        .get('/test-auth')
        .set('x-user-id', nonExistentId);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Validation Middleware', () => {
    const testSchema = {
      body: z.object({
        message: z.string().min(1, 'Message is required'),
        count: z.number().int().positive().optional(),
      }),
    };

    const testApp = createApp((appInstance) => {
      appInstance.post(
        '/test-val',
        validateRequest(testSchema),
        asyncHandler(async (req, res) => {
          res.json({ success: true, body: req.body });
        })
      );
    });

    it('passes request when payload conforms to Zod schema', async () => {
      const res = await request(testApp)
        .post('/test-val')
        .send({ message: 'Hello OrchestrAI', count: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 with VALIDATION_ERROR when payload violates schema', async () => {
      const res = await request(testApp)
        .post('/test-val')
        .send({ message: '', count: -1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects payloads larger than 100kb with 413 PAYLOAD_TOO_LARGE', async () => {
      const largePayload = { message: 'x'.repeat(1024 * 105) };
      const res = await request(testApp)
        .post('/test-val')
        .send(largePayload);

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
});

