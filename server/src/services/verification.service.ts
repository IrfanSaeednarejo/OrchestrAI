import crypto from 'node:crypto';
import { redisClient, connectRedis } from '../persistence/redis/client.js';

export type VerificationCheckResult =
  | { success: true }
  | {
      success: false;
      reason:
        | 'INVALID_CODE'
        | 'CODE_EXPIRED'
        | 'MAX_ATTEMPTS_EXCEEDED'
        | 'VERIFICATION_SERVICE_UNAVAILABLE';
    };

const TTL_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 5;

interface VerificationData {
  code: string;
  attempts: number;
}

function getRedisKey(userId: string): string {
  return `verify:${userId}`;
}

function getLockoutKey(userId: string): string {
  return `verify:lockout:${userId}`;
}

export const verificationService = {
  async issueVerificationCode(
    userId: string
  ): Promise<{ code: string } | { error: 'VERIFICATION_SERVICE_UNAVAILABLE' | 'MAX_ATTEMPTS_EXCEEDED' }> {
    try {
      await connectRedis();

      // Check persistent lockout first
      const lockoutKey = getLockoutKey(userId);
      const isLockedOut = await redisClient.get(lockoutKey);
      if (isLockedOut) {
        return { error: 'MAX_ATTEMPTS_EXCEEDED' };
      }

      const key = getRedisKey(userId);
      let existingAttempts = 0;
      const rawData = await redisClient.get(key);
      if (rawData) {
        try {
          const parsed = JSON.parse(rawData) as VerificationData;
          if (parsed.attempts >= MAX_ATTEMPTS) {
            await redisClient.set(lockoutKey, '1', { EX: TTL_SECONDS });
            await redisClient.del(key);
            return { error: 'MAX_ATTEMPTS_EXCEEDED' };
          }
          existingAttempts = parsed.attempts;
        } catch {
          existingAttempts = 0;
        }
      }

      // Generate cryptographically secure 6-digit OTP
      const code = crypto.randomInt(100000, 1000000).toString();

      const data: VerificationData = { code, attempts: existingAttempts };

      await redisClient.set(key, JSON.stringify(data), {
        EX: TTL_SECONDS,
      });

      return { code };
    } catch {
      return { error: 'VERIFICATION_SERVICE_UNAVAILABLE' };
    }
  },

  async checkVerificationCode(
    userId: string,
    submittedCode: string
  ): Promise<VerificationCheckResult> {
    try {
      await connectRedis();

      // Check persistent lockout
      const lockoutKey = getLockoutKey(userId);
      const isLockedOut = await redisClient.get(lockoutKey);
      if (isLockedOut) {
        return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
      }

      const key = getRedisKey(userId);
      const rawData = await redisClient.get(key);

      if (!rawData) {
        return { success: false, reason: 'CODE_EXPIRED' };
      }

      const data = JSON.parse(rawData) as VerificationData;

      if (data.code === submittedCode) {
        // Success: delete the code and any lockout state
        await redisClient.del(key);
        await redisClient.del(lockoutKey);
        return { success: true };
      }

      // Invalid code: increment attempts
      data.attempts += 1;

      if (data.attempts >= MAX_ATTEMPTS) {
        // Forcibly invalidate and set lockout
        await redisClient.del(key);
        await redisClient.set(lockoutKey, '1', { EX: TTL_SECONDS });
        return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
      } else {
        // We must update the value in Redis, preserving the remaining TTL.
        await redisClient.set(key, JSON.stringify(data), { KEEPTTL: true });
        return { success: false, reason: 'INVALID_CODE' };
      }
    } catch {
      return { success: false, reason: 'VERIFICATION_SERVICE_UNAVAILABLE' };
    }
  },

  /**
   * Phase 17 Step 1c: Non-destructive OTP inspection for dev/demo purposes.
   * Returns only the verification code string, or null if expired/absent.
   */
  async peekVerificationCode(userId: string): Promise<string | null> {
    try {
      await connectRedis();
      const key = getRedisKey(userId);
      const rawData = await redisClient.get(key);
      if (!rawData) {
        return null;
      }
      const data = JSON.parse(rawData) as VerificationData;
      return typeof data.code === 'string' ? data.code : null;
    } catch {
      return null;
    }
  },
};
