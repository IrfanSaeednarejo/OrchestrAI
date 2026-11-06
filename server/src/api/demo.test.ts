// src/api/demo.test.ts
// Phase 17 Step 1c: Tests for dev-gated demo users and verification code peek endpoints.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { verificationService } from '../services/verification.service.js';
import { createUser } from '../persistence/repositories/marketplace.repository.js';
import { db } from '../persistence/db/client.js';
import { users } from '../persistence/db/schema.js';
import { inArray } from 'drizzle-orm';
import { DEFAULT_GUEST_USER_ID } from './middleware/auth.middleware.js';

describe('Phase 17 Step 1c: Dev-Gated Demo & Verification Endpoints', () => {
  const createdSeedUserIds: string[] = [];
  const testUserId = '00000000-0000-4000-a000-000000009999';

  beforeAll(async () => {
    // Ensure test seed user exists for testing demo-users resolution
    try {
      const u1 = await createUser({
        name: 'Alice Anderson',
        email: 'alice@example.com',
        defaultAddress: '123 Alpha St',
      });
      createdSeedUserIds.push(u1.id);
    } catch {
      // User might already exist in local DB seed, which is fine
    }
  });

  afterAll(async () => {
    try {
      if (createdSeedUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdSeedUserIds));
      }
    } catch (err) {
      console.error('Cleanup error in demo.test.ts:', err);
    }
  });

  // -------------------------------------------------------------------------
  // Gated off tests (flag disabled)
  // -------------------------------------------------------------------------
  describe('When demo endpoints are disabled', () => {
    const app = createApp((appInstance) => {
      appInstance.locals.enableDemoEndpoints = false;
    });

    it('GET /api/demo-users returns 404', async () => {
      const res = await request(app).get('/api/demo-users');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('GET /api/dev/verification-code returns 404', async () => {
      const res = await request(app).get(`/api/dev/verification-code?userId=${testUserId}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Enabled tests
  // -------------------------------------------------------------------------
  describe('When demo endpoints are enabled', () => {
    const app = createApp((appInstance) => {
      appInstance.locals.enableDemoEndpoints = true;
    });

    it('GET /api/demo-users returns guest user and existing seed users', async () => {
      const res = await request(app).get('/api/demo-users');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);

      const guest = res.body.users.find(
        (u: { id: string; isGuest: boolean }) => u.id === DEFAULT_GUEST_USER_ID
      );
      expect(guest).toBeDefined();
      expect(guest.isGuest).toBe(true);
      expect(guest.email).toBe('guest@orchestrai.internal');

      // Alice should be present if created
      const alice = res.body.users.find(
        (u: { email: string }) => u.email === 'alice@example.com'
      );
      if (alice) {
        expect(alice.name).toBe('Alice Anderson');
        expect(alice.isGuest).toBe(false);
      }
    });

    it('GET /api/dev/verification-code returns 400 when userId query parameter is missing', async () => {
      const res = await request(app).get('/api/dev/verification-code');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/dev/verification-code returns 400 when userId is not a valid UUID', async () => {
      const res = await request(app).get('/api/dev/verification-code?userId=not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/dev/verification-code returns null when no OTP has been issued', async () => {
      const unusedUserId = '00000000-0000-4000-a000-000000001234';
      const res = await request(app).get(`/api/dev/verification-code?userId=${unusedUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(unusedUserId);
      expect(res.body.code).toBeNull();
    });

    it('GET /api/dev/verification-code peeks the issued code non-destructively', async () => {
      const otpUserId = '00000000-0000-4000-a000-000000005555';

      // Issue code via verification service (600s TTL per verification.service.ts line 14)
      const issueResult = await verificationService.issueVerificationCode(otpUserId);
      expect('code' in issueResult).toBe(true);
      if ('code' in issueResult) {
        const expectedCode = issueResult.code;

        // Peek the code via dev endpoint
        const res1 = await request(app).get(`/api/dev/verification-code?userId=${otpUserId}`);
        expect(res1.status).toBe(200);
        expect(res1.body.userId).toBe(otpUserId);
        expect(res1.body.code).toBe(expectedCode);

        // Peek a second time: code must NOT be consumed or deleted by peeking
        const res2 = await request(app).get(`/api/dev/verification-code?userId=${otpUserId}`);
        expect(res2.status).toBe(200);
        expect(res2.body.code).toBe(expectedCode);

        // Verify that checking the code normally still succeeds and is what consumes it
        const checkResult = await verificationService.checkVerificationCode(otpUserId, expectedCode);
        expect(checkResult.success).toBe(true);

        // After successful verification, peek now returns null (code consumed)
        const res3 = await request(app).get(`/api/dev/verification-code?userId=${otpUserId}`);
        expect(res3.status).toBe(200);
        expect(res3.body.code).toBeNull();
      }
    });
  });
});
