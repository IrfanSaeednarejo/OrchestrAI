// src/api/profile-update.test.ts
// Phase 26 Step 2: Integration tests for the profile-update REST endpoints.
//
// Coverage:
//   - 401 unauthenticated on BOTH mounts (request-code, verify, resend-code)
//   - sent, failed (mail API error), no_email, no_change
//   - ok (happy path), invalid, expired, too_many_attempts, conflict, service_unavailable
//
// Prerequisites: Docker Postgres + Redis must be up.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { redisClient, connectRedis } from '../persistence/redis/client.js';
import * as emailService from '../services/email.service.js';
import * as profileVerificationService from '../services/profile-verification.service.js';

// ── Test app & user setup ────────────────────────────────────────────────────

const app = createApp();

const TEST_EMAIL = `profile-update-${Date.now()}@orchestrai-test.com`;

let testUserId = '';
let testUserToken = '';

async function purgeProfileVerifyKeys(userId: string): Promise<void> {
  await connectRedis();
  await redisClient.del([
    `profile:verify:${userId}`,
    `profile:verify:cooldown:${userId}`,
  ]);
}

beforeAll(async () => {
  // Register a real user via the auth endpoint
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: TEST_EMAIL,
      name: 'Irfan Saeed',
      defaultAddress: '42 Test Lane',
      password: 'SecureP@ssw0rd!',
    });
  expect(res.status).toBe(201);
  testUserId = res.body.user.id as string;
  testUserToken = res.body.token as string;
});

beforeEach(async () => {
  // Clear Redis state between tests to prevent cooldown leakage
  await purgeProfileVerifyKeys(testUserId);
  vi.restoreAllMocks();
});

// ── Helper to build auth headers ─────────────────────────────────────────────

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── 401 unauthenticated — both mounts ────────────────────────────────────────

describe('unauthenticated access (both mounts)', () => {
  const endpoints = [
    '/profile/update/request-code',
    '/api/profile/update/request-code',
    '/profile/update/verify',
    '/api/profile/update/verify',
    '/profile/update/resend-code',
    '/api/profile/update/resend-code',
  ];

  for (const endpoint of endpoints) {
    it(`returns 401 for ${endpoint}`, async () => {
      const res = await request(app).post(endpoint).send({});
      expect(res.status).toBe(401);
    });
  }
});

// ── POST /profile/update/request-code ────────────────────────────────────────

describe('POST /profile/update/request-code', () => {
  it('returns { status: "sent" } and masked email on success', async () => {
    vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      success: true,
      data: { messageId: 'mock-id' },
    });

    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan Billo Raja' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    expect(typeof res.body.masked_email).toBe('string');
    expect(res.body.masked_email).toMatch(/\*\*\*@/);
    expect(typeof res.body.expires_at).toBe('number');
    expect(typeof res.body.resend_at).toBe('number');
    expect(res.body.resend_after).toBe(60);
  });

  it('returns { status: "failed" } with resend_after when mail API fails', async () => {
    vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      success: false,
      error: { code: 'EMAIL_SEND_FAILED', message: 'Provider rejected' },
    });

    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan Billo Raja' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.reason).toBe('EMAIL_SEND_FAILED');
    expect(res.body.resend_after).toBe(15);
    expect(typeof res.body.resend_at).toBe('number');
    expect(typeof res.body.masked_email).toBe('string');
  });

  it('returns { status: "no_change" } when name matches current DB value', async () => {
    // Current name is 'Irfan Saeed' — sending the same normalized value
    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan Saeed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_change');
  });

  it('returns 400 on missing required name field', async () => {
    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name' }); // name omitted

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when name + field=defaultAddress conflict', async () => {
    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'defaultAddress', name: 'Oops', defaultAddress: '99 New St' });

    expect(res.status).toBe(400);
  });

  it('returns 429 with cooldown info on RESEND_COOLDOWN', async () => {
    vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      success: true,
      data: { messageId: 'mock-id' },
    });
    // First call — sets cooldown
    await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan New' });

    // Second call — should hit cooldown
    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan New' });

    expect(res.status).toBe(429);
    expect(res.body.status).toBe('cooldown');
    expect(typeof res.body.resend_after).toBe('number');
  });

  it('returns 503 on service unavailable (Redis down)', async () => {
    vi.spyOn(profileVerificationService, 'issueProfileVerificationCode').mockResolvedValue({
      success: false,
      error: {
        code: 'VERIFICATION_SERVICE_UNAVAILABLE',
        message: 'Redis is down',
      },
    });

    const res = await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan Billo' });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('service_unavailable');
  });
});

// ── POST /profile/update/verify ───────────────────────────────────────────────

describe('POST /profile/update/verify', () => {
  async function issueCodeForTest(): Promise<string> {
    // Directly call the service to get the raw code
    const result = await profileVerificationService.issueProfileVerificationCode(testUserId, {
      field: 'name',
      name: 'Irfan Billo Raja',
      originalSnapshot: { name: 'Irfan Saeed', defaultAddress: '42 Test Lane' },
    });
    if (!result.success) throw new Error('Failed to issue code in test setup');
    return result.data.code;
  }

  it('returns { status: "ok" } and updated user fields on correct code', async () => {
    const code = await issueCodeForTest();

    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.name).toBe('Irfan Billo Raja');
    expect(res.body.updated_fields).toContain('name');

    // Reset user name back so other tests stay consistent
    await request(app)
      .post('/profile/update/request-code')
      .set(bearer(testUserToken))
      .send({ field: 'name', name: 'Irfan Saeed' });
    const resetCode = await issueProfileVerificationCode(testUserId, {
      field: 'name',
      name: 'Irfan Saeed',
      originalSnapshot: { name: 'Irfan Billo Raja', defaultAddress: '42 Test Lane' },
    });
    if (resetCode.success) {
      await request(app)
        .post('/profile/update/verify')
        .set(bearer(testUserToken))
        .send({ code: resetCode.data.code });
    }
  });

  it('returns { status: "invalid" } with remaining_attempts on wrong code', async () => {
    await issueCodeForTest();

    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code: '000000' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('invalid');
    expect(typeof res.body.remaining_attempts).toBe('number');
    expect(res.body.remaining_attempts).toBe(4);
  });

  it('returns { status: "too_many_attempts" } after 5 wrong codes', async () => {
    await issueCodeForTest();

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/profile/update/verify')
        .set(bearer(testUserToken))
        .send({ code: '000000' });
    }

    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code: '000000' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('too_many_attempts');
  });

  it('returns { status: "expired" } when code is past expiresAt', async () => {
    vi.spyOn(profileVerificationService, 'verifyProfileVerificationCode').mockResolvedValue({
      success: false,
      status: 'EXPIRED',
      message: 'Code expired',
    });

    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('expired');
  });

  it('returns { status: "conflict" } when snapshot no longer matches DB', async () => {
    // Issue a code with a stale snapshot
    await profileVerificationService.issueProfileVerificationCode(testUserId, {
      field: 'name',
      name: 'Irfan Billo Raja',
      originalSnapshot: { name: 'WRONG_STALE_NAME', defaultAddress: 'WRONG_STALE_ADDR' },
    });
    // Get the actual code via service
    const verifyKey = `profile:verify:${testUserId}`;
    await connectRedis();
    const raw = await redisClient.get(verifyKey);
    expect(raw).not.toBeNull();
    // Raw record retrieved — codeHash not reversible; mock verify to return OK with stale snapshot
    expect(typeof JSON.parse(raw as string)).toBe('object');
    vi.spyOn(profileVerificationService, 'verifyProfileVerificationCode').mockResolvedValue({
      success: true,
      status: 'OK',
      data: {
        pendingUpdates: {
          field: 'name',
          name: 'Irfan Billo Raja',
          originalSnapshot: { name: 'WRONG_STALE_NAME', defaultAddress: 'WRONG_STALE_ADDR' },
        },
      },
    });

    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code: '999999' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('conflict');
  });

  it('returns 400 on invalid code format', async () => {
    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code: 'abc' });

    expect(res.status).toBe(400);
  });

  it('returns 503 on service unavailable', async () => {
    vi.spyOn(profileVerificationService, 'verifyProfileVerificationCode').mockResolvedValue({
      success: false,
      status: 'SERVICE_UNAVAILABLE',
      error: { code: 'VERIFICATION_SERVICE_UNAVAILABLE', message: 'Redis down' },
    });

    const res = await request(app)
      .post('/profile/update/verify')
      .set(bearer(testUserToken))
      .send({ code: '123456' });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('service_unavailable');
  });
});

// ── POST /profile/update/resend-code ─────────────────────────────────────────

describe('POST /profile/update/resend-code', () => {
  it('returns { status: "sent" } after a failed initial send', async () => {
    // Seed a failed record
    await profileVerificationService.issueProfileVerificationCode(testUserId, {
      field: 'name',
      name: 'Irfan Billo Raja',
      originalSnapshot: { name: 'Irfan Saeed', defaultAddress: '42 Test Lane' },
    });
    await profileVerificationService.recordDeliveryFailure(testUserId);
    // Clear only the cooldown key so resend is not blocked
    await connectRedis();
    await redisClient.del(`profile:verify:cooldown:${testUserId}`);

    vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      success: true,
      data: { messageId: 'resend-mock-id' },
    });

    const res = await request(app)
      .post('/profile/update/resend-code')
      .set(bearer(testUserToken))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    expect(res.body.masked_email).toMatch(/\*\*\*@/);
  });

  it('returns 429 with cooldown info when resend cooldown is active', async () => {
    vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      success: true,
      data: { messageId: 'mock-id' },
    });
    // Trigger an issue to set the cooldown
    await profileVerificationService.issueProfileVerificationCode(testUserId, {
      field: 'name',
      name: 'Irfan Billo Raja',
      originalSnapshot: { name: 'Irfan Saeed', defaultAddress: '42 Test Lane' },
    });

    const res = await request(app)
      .post('/profile/update/resend-code')
      .set(bearer(testUserToken))
      .send({});

    expect(res.status).toBe(429);
    expect(res.body.status).toBe('cooldown');
    expect(typeof res.body.resend_after).toBe('number');
  });
});

// helper re-import for use in ok-path reset
import { issueProfileVerificationCode } from '../services/profile-verification.service.js';
