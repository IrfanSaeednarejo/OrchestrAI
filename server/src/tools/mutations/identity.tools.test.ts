import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { startIdentityVerification, verifyIdentity } from './identity.tools.js';

import { db } from '../../persistence/db/client.js';
import { users } from '../../persistence/db/schema.js';
import { createUser } from '../../persistence/repositories/marketplace.repository.js';
import { redisClient, connectRedis } from '../../persistence/redis/client.js';
import { eq } from 'drizzle-orm';

describe('identity.tools', () => {
  let userId: string;

  beforeAll(async () => {
    await connectRedis();
    const email = `identity-tools-${Date.now()}@example.com`;
    const user = await createUser({
      email,
      name: 'Identity Test User',
      defaultAddress: '123 Identity St',
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  afterEach(async () => {
    await redisClient.del(`verify:${userId}`);
  });

  describe('start_identity_verification', () => {
    it('happy path', async () => {
      const result = await startIdentityVerification({ userId });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toMatch(/^\d{6}$/);
      }
    });

    it('NOT_FOUND for missing user', async () => {
      const result = await startIdentityVerification({ userId: '00000000-0000-0000-0000-000000000000' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('INVALID_INPUT for malformed userId', async () => {
      const result = await startIdentityVerification({ userId: 'not-a-uuid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('verify_identity', () => {
    it('happy path', async () => {
      const startResult = await startIdentityVerification({ userId });
      expect(startResult.success).toBe(true);
      if (!startResult.success) return;

      const verifyResult = await verifyIdentity({ userId, code: startResult.data.code });
      expect(verifyResult.success).toBe(true);
      if (verifyResult.success) {
        expect(verifyResult.data.verified).toBe(true);
      }
    });

    it('INVALID_CODE', async () => {
      const startResult = await startIdentityVerification({ userId });
      expect(startResult.success).toBe(true);
      if (!startResult.success) return;

      const wrongCode = startResult.data.code === '000000' ? '111111' : '000000';
      const verifyResult = await verifyIdentity({ userId, code: wrongCode });
      expect(verifyResult.success).toBe(false);
      if (!verifyResult.success) {
        expect(verifyResult.error.code).toBe('INVALID_CODE');
      }
    });

    it('CODE_EXPIRED (no code issued)', async () => {
      const verifyResult = await verifyIdentity({ userId, code: '123456' });
      expect(verifyResult.success).toBe(false);
      if (!verifyResult.success) {
        expect(verifyResult.error.code).toBe('CODE_EXPIRED');
      }
    });

    it('MAX_ATTEMPTS_EXCEEDED (5 wrong attempts)', async () => {
      const startResult = await startIdentityVerification({ userId });
      expect(startResult.success).toBe(true);
      if (!startResult.success) return;

      const wrongCode = startResult.data.code === '000000' ? '111111' : '000000';
      
      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        await verifyIdentity({ userId, code: wrongCode });
      }

      // 5th wrong attempt
      const verifyResult = await verifyIdentity({ userId, code: wrongCode });
      expect(verifyResult.success).toBe(false);
      if (!verifyResult.success) {
        expect(verifyResult.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');
      }
    });

    it('INVALID_INPUT for malformed userId', async () => {
      const result = await verifyIdentity({ userId: 'not-a-uuid', code: '123456' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('INVALID_INPUT for malformed code', async () => {
      const result = await verifyIdentity({ userId, code: '12345' }); // 5 digits
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('NOT_FOUND for missing user', async () => {
      const result = await verifyIdentity({ userId: '00000000-0000-0000-0000-000000000000', code: '123456' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});
