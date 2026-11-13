// src/services/profile-verification.service.ts
// Phase 26 Step 1: Storage and verification service for customer profile updates.
// Enforces:
// - SHA-256 hashed 6-digit codes (raw codes never stored or logged)
// - 10-minute code validity (expiresAt ms) stored with 15-minute Redis key TTL (EX 900)
// - Atomic Lua verification: read-only on OK/EXPIRED/TOO_MANY_ATTEMPTS; writes only on INVALID
// - 60s resend cooldown (15s on send failure)
// - Resend resets attempts to 0
// - DEL cooldown key on successful verification
// - rawInput is never logged, serialized to API responses, or stored beyond transient Redis memory

import crypto from 'node:crypto';
import { redisClient, connectRedis } from '../persistence/redis/client.js';

export const VERIFICATION_TTL_SECONDS = 600; // 10 minutes
export const REDIS_STORAGE_TTL_SECONDS = 900; // 15 minutes (TTL > expiresAt to inspect expired status)
export const RESEND_COOLDOWN_SECONDS = 60; // 60 seconds standard cooldown
export const FAILURE_COOLDOWN_SECONDS = 15; // 15 seconds transient failure cooldown
export const MAX_ATTEMPTS = 5;

export interface PendingProfileUpdates {
  field: 'name' | 'defaultAddress' | 'both';
  name?: string;
  defaultAddress?: string;
  originalSnapshot: {
    name: string;
    defaultAddress: string;
  };
  rawInput?: {
    name?: string;
    defaultAddress?: string;
  };
}

export interface ProfileVerificationRecord {
  codeHash: string | null;
  expiresAt: number; // epoch ms
  attempts: number;
  maxAttempts: number;
  lastSentAt: number; // epoch ms
  deliveryStatus: 'sent' | 'failed';
  pendingUpdates: PendingProfileUpdates;
}

export type IssueCodeResult =
  | {
      success: true;
      data: {
        code: string;
        codeHash: string;
        expiresAt: number;
        resendAt: number;
        resendAfter: number;
      };
    }
  | {
      success: false;
      error: {
        code: 'RESEND_COOLDOWN';
        retryAfterSeconds: number;
        resendAt: number;
        message: string;
      };
    }
  | {
      success: false;
      error: {
        code: 'VERIFICATION_SERVICE_UNAVAILABLE';
        message: string;
      };
    };

export type VerifyCodeStatus =
  | 'OK'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'INVALID';

export type VerifyCodeResult =
  | {
      success: true;
      status: 'OK';
      data: {
        pendingUpdates: PendingProfileUpdates;
      };
    }
  | {
      success: false;
      status: 'INVALID';
      remainingAttempts: number;
      attempts: number;
      message: string;
    }
  | {
      success: false;
      status: 'EXPIRED';
      message: string;
    }
  | {
      success: false;
      status: 'TOO_MANY_ATTEMPTS';
      message: string;
    }
  | {
      success: false;
      status: 'NOT_FOUND' | 'INVALID_STATE';
      message: string;
    }
  | {
      success: false;
      status: 'SERVICE_UNAVAILABLE';
      error: {
        code: 'VERIFICATION_SERVICE_UNAVAILABLE';
        message: string;
      };
    };

export function getProfileVerifyKey(userId: string): string {
  return `profile:verify:${userId}`;
}

export function getProfileCooldownKey(userId: string): string {
  return `profile:verify:cooldown:${userId}`;
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

/**
 * Lua script for atomic verification:
 * - Checks record existence
 * - Checks state validity (deliveryStatus !== failed && codeHash !== null)
 * - Checks now < expiresAt
 * - Checks attempts < maxAttempts
 * - If codeHash matches: returns OK without modifying state (caller will commit DB and DEL key)
 * - If mismatch: increments attempts atomically and returns INVALID with remainingAttempts
 * - EXPIRED and TOO_MANY_ATTEMPTS are strictly read-only checks; INVALID is the ONLY write branch.
 */
const LUA_VERIFY_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local inputHash = ARGV[2]
local maxAttempts = tonumber(ARGV[3])

local raw = redis.call('GET', key)
if not raw then
  return cjson.encode({ status = 'NOT_FOUND' })
end

local data = cjson.decode(raw)
if not data.codeHash or data.deliveryStatus == 'failed' then
  return cjson.encode({ status = 'INVALID_STATE' })
end

if now >= tonumber(data.expiresAt) then
  return cjson.encode({ status = 'EXPIRED' })
end

if tonumber(data.attempts) >= maxAttempts then
  return cjson.encode({ status = 'TOO_MANY_ATTEMPTS' })
end

if data.codeHash == inputHash then
  return cjson.encode({ status = 'OK', record = data })
else
  data.attempts = tonumber(data.attempts) + 1
  local ttl = redis.call('TTL', key)
  if ttl > 0 then
    redis.call('SET', key, cjson.encode(data), 'EX', ttl)
  end
  local remaining = maxAttempts - data.attempts
  if remaining < 0 then remaining = 0 end
  return cjson.encode({ status = 'INVALID', attempts = data.attempts, remainingAttempts = remaining })
end
`;

/**
 * Issues a new 6-digit verification code stored hashed in Redis with TTL.
 * Resets attempts to 0 per policy (OD-26c).
 */
export async function issueProfileVerificationCode(
  userId: string,
  pendingUpdates: PendingProfileUpdates
): Promise<IssueCodeResult> {
  try {
    await connectRedis();

    const cooldownKey = getProfileCooldownKey(userId);
    const cooldownAcquired = await redisClient.set(cooldownKey, '1', {
      EX: RESEND_COOLDOWN_SECONDS,
      NX: true,
    });

    if (!cooldownAcquired) {
      const ttl = await redisClient.ttl(cooldownKey);
      const retryAfterSeconds = Math.max(1, ttl);
      return {
        success: false,
        error: {
          code: 'RESEND_COOLDOWN',
          retryAfterSeconds,
          resendAt: Date.now() + retryAfterSeconds * 1000,
          message: `Please wait ${retryAfterSeconds} seconds before requesting a new verification code.`,
        },
      };
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashVerificationCode(code);
    const now = Date.now();
    const expiresAt = now + VERIFICATION_TTL_SECONDS * 1000;
    const resendAt = now + RESEND_COOLDOWN_SECONDS * 1000;

    const record: ProfileVerificationRecord = {
      codeHash,
      expiresAt,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: now,
      deliveryStatus: 'sent',
      pendingUpdates,
    };

    const key = getProfileVerifyKey(userId);
    await redisClient.set(key, JSON.stringify(record), {
      EX: REDIS_STORAGE_TTL_SECONDS,
    });

    // Dev/test only: write raw code to a short-lived peek key so integration
    // tests can retrieve it without storing it in the main record or logs.
    // Never executed in production (config.env === 'production' is excluded).
    if (process.env['NODE_ENV'] !== 'production') {
      await redisClient.set(
        `profile:verify:peek:${userId}`,
        code,
        { EX: 120 } // 2-minute TTL — enough for a test run, never persists
      );
    }

    return {
      success: true,
      data: {
        code,
        codeHash,
        expiresAt,
        resendAt,
        resendAfter: RESEND_COOLDOWN_SECONDS,
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'VERIFICATION_SERVICE_UNAVAILABLE',
        message: 'Verification service is temporarily unavailable. Please try again shortly.',
      },
    };
  }
}

/**
 * Dev/test only: peek at the raw verification code stored by the latest
 * issueProfileVerificationCode call. Returns null in production or when no
 * code is pending. Used exclusively by the demo route and integration tests.
 */
export async function peekProfileVerificationCode(userId: string): Promise<string | null> {
  if (process.env['NODE_ENV'] === 'production') return null;
  try {
    await connectRedis();
    return await redisClient.get(`profile:verify:peek:${userId}`);
  } catch {
    return null;
  }
}

/**
 * Records an email delivery failure:
 * - Updates deliveryStatus to 'failed'
 * - Nulls out codeHash so an undelivered code cannot be used
 * - Replaces cooldown with a shorter 15s failure cooldown (OD-26d)
 */
export async function recordDeliveryFailure(userId: string): Promise<void> {
  try {
    await connectRedis();
    const key = getProfileVerifyKey(userId);
    const raw = await redisClient.get(key);
    if (raw) {
      const parsed = JSON.parse(raw) as ProfileVerificationRecord;
      parsed.deliveryStatus = 'failed';
      parsed.codeHash = null;
      const ttl = await redisClient.ttl(key);
      await redisClient.set(key, JSON.stringify(parsed), {
        EX: ttl > 0 ? ttl : REDIS_STORAGE_TTL_SECONDS,
      });
    }

    const cooldownKey = getProfileCooldownKey(userId);
    await redisClient.set(cooldownKey, '1', {
      EX: FAILURE_COOLDOWN_SECONDS,
    });
  } catch {
    // Non-fatal logging or error swallowing to prevent cascading failure
  }
}

/**
 * Validates the 6-digit code atomically using the Redis Lua script.
 */
export async function verifyProfileVerificationCode(
  userId: string,
  code: string
): Promise<VerifyCodeResult> {
  try {
    await connectRedis();
    const key = getProfileVerifyKey(userId);
    const inputHash = hashVerificationCode(code);
    const now = Date.now();

    const luaRaw = await redisClient.eval(LUA_VERIFY_SCRIPT, {
      keys: [key],
      arguments: [now.toString(), inputHash, MAX_ATTEMPTS.toString()],
    });

    if (typeof luaRaw !== 'string') {
      return {
        success: false,
        status: 'SERVICE_UNAVAILABLE',
        error: {
          code: 'VERIFICATION_SERVICE_UNAVAILABLE',
          message: 'Verification service returned invalid response format.',
        },
      };
    }

    const parsed = JSON.parse(luaRaw) as {
      status: VerifyCodeStatus;
      record?: ProfileVerificationRecord;
      attempts?: number;
      remainingAttempts?: number;
    };

    if (parsed.status === 'OK' && parsed.record) {
      return {
        success: true,
        status: 'OK',
        data: {
          pendingUpdates: parsed.record.pendingUpdates,
        },
      };
    }

    if (parsed.status === 'INVALID') {
      return {
        success: false,
        status: 'INVALID',
        attempts: parsed.attempts ?? 1,
        remainingAttempts: parsed.remainingAttempts ?? (MAX_ATTEMPTS - (parsed.attempts ?? 1)),
        message: `Invalid verification code. You have ${parsed.remainingAttempts ?? 0} attempt(s) remaining.`,
      };
    }

    if (parsed.status === 'TOO_MANY_ATTEMPTS') {
      return {
        success: false,
        status: 'TOO_MANY_ATTEMPTS',
        message:
          'Too many failed verification attempts. Your previous code has been invalidated. Please click "Resend code" to generate a fresh code or contact support.',
      };
    }

    if (parsed.status === 'EXPIRED') {
      return {
        success: false,
        status: 'EXPIRED',
        message: 'Your verification code has expired. Please request a new code.',
      };
    }

    return {
      success: false,
      status: parsed.status as 'NOT_FOUND' | 'INVALID_STATE',
      message: 'No active verification code found. Please request a code first.',
    };
  } catch {
    return {
      success: false,
      status: 'SERVICE_UNAVAILABLE',
      error: {
        code: 'VERIFICATION_SERVICE_UNAVAILABLE',
        message: 'Verification service is temporarily unavailable. Please try again shortly.',
      },
    };
  }
}

/**
 * Clears verification state and removes active cooldown upon successful verification.
 */
export async function clearProfileVerification(userId: string): Promise<void> {
  try {
    await connectRedis();
    const key = getProfileVerifyKey(userId);
    const cooldownKey = getProfileCooldownKey(userId);
    await redisClient.del([key, cooldownKey]);
  } catch {
    // Non-fatal cleanup
  }
}

/**
 * Resends a code for an existing pending update if not on cooldown.
 * Resets attempts to 0.
 */
export async function resendProfileVerificationCode(
  userId: string
): Promise<IssueCodeResult> {
  try {
    await connectRedis();
    const key = getProfileVerifyKey(userId);
    const raw = await redisClient.get(key);
    if (!raw) {
      return {
        success: false,
        error: {
          code: 'VERIFICATION_SERVICE_UNAVAILABLE',
          message: 'No active profile update request found. Please start a new profile update.',
        },
      };
    }

    const parsed = JSON.parse(raw) as ProfileVerificationRecord;
    return await issueProfileVerificationCode(userId, parsed.pendingUpdates);
  } catch {
    return {
      success: false,
      error: {
        code: 'VERIFICATION_SERVICE_UNAVAILABLE',
        message: 'Verification service is temporarily unavailable. Please try again shortly.',
      },
    };
  }
}

