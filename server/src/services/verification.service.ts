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

export const verificationService = {
  async issueVerificationCode(userId: string): Promise<{ code: string } | { error: 'VERIFICATION_SERVICE_UNAVAILABLE' }> {
    try {
      await connectRedis();
      // Generate a 6-digit numeric code, zero-padded
      const code = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, '0');

      const data: VerificationData = { code, attempts: 0 };
      const key = getRedisKey(userId);

      await redisClient.set(key, JSON.stringify(data), {
        EX: TTL_SECONDS,
      });

      return { code };
    } catch (_error) {
      return { error: 'VERIFICATION_SERVICE_UNAVAILABLE' };
    }
  },

  async checkVerificationCode(
    userId: string,
    submittedCode: string
  ): Promise<VerificationCheckResult> {
    try {
      await connectRedis();
      const key = getRedisKey(userId);
      const rawData = await redisClient.get(key);

      if (!rawData) {
        return { success: false, reason: 'CODE_EXPIRED' };
      }

      const data = JSON.parse(rawData) as VerificationData;

      if (data.code === submittedCode) {
        // Success: delete the code and return success
        await redisClient.del(key);
        return { success: true };
      }

      // Invalid code: increment attempts
      data.attempts += 1;

      if (data.attempts >= MAX_ATTEMPTS) {
        // Forcibly invalidate
        await redisClient.del(key);
        return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
      } else {
        // We must update the value in Redis, preserving the remaining TTL.
        // KEEPTTL is available in Redis 6+ which we use via EX/PX etc, but node-redis set() supports KEEPTTL.
        await redisClient.set(key, JSON.stringify(data), { KEEPTTL: true });
        return { success: false, reason: 'INVALID_CODE' };
      }
    } catch (_error) {
      return { success: false, reason: 'VERIFICATION_SERVICE_UNAVAILABLE' };
    }
  },
};
