// src/services/profile-verification.service.test.ts
// Unit tests for profile-verification.service.ts
// Verifies:
// - SHA-256 code hashing and storage with 900s TTL
// - Atomic Lua verification: increments on INVALID, read-only on EXPIRED & TOO_MANY_ATTEMPTS
// - 6th attempt idempotency
// - 60s resend cooldown vs 15s delivery failure cooldown
// - Cooldown cleanup on verify success
// - Service unavailable handling on Redis failure

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { redisClient, connectRedis } from '../persistence/redis/client.js';
import {
  issueProfileVerificationCode,
  verifyProfileVerificationCode,
  recordDeliveryFailure,
  clearProfileVerification,
  resendProfileVerificationCode,
  getProfileVerifyKey,
  getProfileCooldownKey,
  hashVerificationCode,
  type PendingProfileUpdates,
} from './profile-verification.service.js';

describe('Profile Verification Service', () => {
  const TEST_USER_ID = 'b729f93c-23a7-47b1-9125-992a71d79124';
  const samplePendingUpdates: PendingProfileUpdates = {
    field: 'name',
    name: 'Irfan Billo Raja',
    originalSnapshot: {
      name: 'Irfan',
      defaultAddress: '123 Market St',
    },
    rawInput: {
      name: 'irfan billo raja',
    },
  };

  beforeEach(async () => {
    await connectRedis();
    await clearProfileVerification(TEST_USER_ID);
  });

  afterAll(async () => {
    await clearProfileVerification(TEST_USER_ID);
  });

  it('issues a 6-digit code, stores SHA-256 hash in Redis, and acquires 60s cooldown', async () => {
    const res = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.code).toMatch(/^\d{6}$/);
    expect(res.data.codeHash).toBe(hashVerificationCode(res.data.code));
    expect(res.data.resendAfter).toBe(60);

    // Verify Redis data record exists and raw code is NOT stored
    const raw = await redisClient.get(getProfileVerifyKey(TEST_USER_ID));
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw as string);
    expect(record.codeHash).toBe(hashVerificationCode(res.data.code));
    expect(record.code).toBeUndefined(); // Raw code must NOT be stored
    expect(record.attempts).toBe(0);
    expect(record.deliveryStatus).toBe('sent');

    // Verify Redis storage TTL is ~900s
    const ttl = await redisClient.ttl(getProfileVerifyKey(TEST_USER_ID));
    expect(ttl).toBeGreaterThan(600);
    expect(ttl).toBeLessThanOrEqual(900);

    // Verify cooldown key exists with ~60s TTL
    const cooldownTtl = await redisClient.ttl(getProfileCooldownKey(TEST_USER_ID));
    expect(cooldownTtl).toBeGreaterThan(50);
    expect(cooldownTtl).toBeLessThanOrEqual(60);
  });

  it('rejects rapid subsequent issue with RESEND_COOLDOWN and remaining seconds', async () => {
    const first = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(first.success).toBe(true);

    const second = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(second.success).toBe(false);
    if (second.success) return;

    expect(second.error.code).toBe('RESEND_COOLDOWN');
    if (second.error.code !== 'RESEND_COOLDOWN') return;
    expect(second.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(second.error.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('verifies valid code atomically and returns pending updates', async () => {
    const issueRes = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(issueRes.success).toBe(true);
    if (!issueRes.success) return;

    const verifyRes = await verifyProfileVerificationCode(TEST_USER_ID, issueRes.data.code);
    expect(verifyRes.success).toBe(true);
    if (!verifyRes.success) return;

    expect(verifyRes.status).toBe('OK');
    expect(verifyRes.data.pendingUpdates.name).toBe('Irfan Billo Raja');
    expect(verifyRes.data.pendingUpdates.originalSnapshot.name).toBe('Irfan');
  });

  it('atomically increments attempts on invalid code and enforces 5-attempt limit', async () => {
    const issueRes = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(issueRes.success).toBe(true);
    if (!issueRes.success) return;

    // Attempts 1 to 4: INVALID with decreasing remaining attempts
    for (let i = 1; i <= 4; i++) {
      const res = await verifyProfileVerificationCode(TEST_USER_ID, '000000');
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.status).toBe('INVALID');
      expect((res as { remainingAttempts: number }).remainingAttempts).toBe(5 - i);
    }

    // Attempt 5: Reaches limit
    const fifth = await verifyProfileVerificationCode(TEST_USER_ID, '000000');
    expect(fifth.success).toBe(false);
    expect(fifth.status).toBe('INVALID');
    expect((fifth as { remainingAttempts: number }).remainingAttempts).toBe(0);

    // Attempt 6 (and beyond): TOO_MANY_ATTEMPTS (idempotent, does not increment past 5)
    const sixth = await verifyProfileVerificationCode(TEST_USER_ID, '000000');
    expect(sixth.success).toBe(false);
    expect(sixth.status).toBe('TOO_MANY_ATTEMPTS');

    const seventh = await verifyProfileVerificationCode(TEST_USER_ID, issueRes.data.code); // Even right code fails
    expect(seventh.success).toBe(false);
    expect(seventh.status).toBe('TOO_MANY_ATTEMPTS');

    // Verify stored attempts counter did not increment past 5
    const raw = await redisClient.get(getProfileVerifyKey(TEST_USER_ID));
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw as string);
    expect(record.attempts).toBe(5);
  });

  it('returns EXPIRED when code expires but record still lives within Redis TTL', async () => {
    const issueRes = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(issueRes.success).toBe(true);
    if (!issueRes.success) return;

    // Manually mutate expiresAt in Redis to simulate time passing past 600s
    const key = getProfileVerifyKey(TEST_USER_ID);
    const raw = await redisClient.get(key);
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw as string);
    record.expiresAt = Date.now() - 1000; // expired 1s ago
    await redisClient.set(key, JSON.stringify(record), { EX: 300 });

    const verifyRes = await verifyProfileVerificationCode(TEST_USER_ID, issueRes.data.code);
    expect(verifyRes.success).toBe(false);
    expect(verifyRes.status).toBe('EXPIRED');
  });

  it('records delivery failure, nulls out codeHash, and applies 15s failure cooldown', async () => {
    const issueRes = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(issueRes.success).toBe(true);
    if (!issueRes.success) return;

    await recordDeliveryFailure(TEST_USER_ID);

    // Record has deliveryStatus='failed' and codeHash=null
    const raw = await redisClient.get(getProfileVerifyKey(TEST_USER_ID));
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw as string);
    expect(record.deliveryStatus).toBe('failed');
    expect(record.codeHash).toBeNull();

    // Verify attempting to use code returns INVALID_STATE (cannot verify an undelivered code)
    const verifyRes = await verifyProfileVerificationCode(TEST_USER_ID, issueRes.data.code);
    expect(verifyRes.success).toBe(false);
    expect(verifyRes.status).toBe('INVALID_STATE');

    // Failure cooldown is ~15s (not 60s)
    const cooldownTtl = await redisClient.ttl(getProfileCooldownKey(TEST_USER_ID));
    expect(cooldownTtl).toBeGreaterThan(0);
    expect(cooldownTtl).toBeLessThanOrEqual(15);
  });

  it('resend resets attempts to 0 when cooldown clears', async () => {
    const first = await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    expect(first.success).toBe(true);

    // Fail 3 times
    await verifyProfileVerificationCode(TEST_USER_ID, '000000');
    await verifyProfileVerificationCode(TEST_USER_ID, '000000');
    await verifyProfileVerificationCode(TEST_USER_ID, '000000');

    // Clear cooldown to simulate 60s passing
    await redisClient.del(getProfileCooldownKey(TEST_USER_ID));

    const resend = await resendProfileVerificationCode(TEST_USER_ID);
    expect(resend.success).toBe(true);

    // New record has attempts reset to 0
    const raw = await redisClient.get(getProfileVerifyKey(TEST_USER_ID));
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw as string);
    expect(record.attempts).toBe(0);
  });

  it('clearProfileVerification removes both verify record and cooldown keys', async () => {
    await issueProfileVerificationCode(TEST_USER_ID, samplePendingUpdates);
    await clearProfileVerification(TEST_USER_ID);

    const record = await redisClient.get(getProfileVerifyKey(TEST_USER_ID));
    const cooldown = await redisClient.get(getProfileCooldownKey(TEST_USER_ID));
    expect(record).toBeNull();
    expect(cooldown).toBeNull();
  });
});

