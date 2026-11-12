import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const { mockSendEmail } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
}));

vi.mock('../../services/email.service.js', () => ({
  sendEmail: mockSendEmail,
}));

import { startIdentityVerification, verifyIdentity, initiatePasswordReset } from './identity.tools.js';
import { db } from '../../persistence/db/client.js';
import { users } from '../../persistence/db/schema.js';
import { createUser } from '../../persistence/repositories/marketplace.repository.js';
import { redisClient, connectRedis } from '../../persistence/redis/client.js';
import { eq } from 'drizzle-orm';

describe('identity.tools', () => {
  let userId: string;

  async function getCodeFromRedis(uId: string): Promise<string> {
    const raw = await redisClient.get(`verify:${uId}`);
    if (!raw) throw new Error(`No verification code found in Redis for ${uId}`);
    const parsed = JSON.parse(raw);
    return parsed.code;
  }

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

  beforeEach(async () => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, data: { messageId: 'test-msg-id' } });
    if (userId) {
      await redisClient.del(`verify:${userId}`);
      await redisClient.del(`verify:cooldown:${userId}`);
      await redisClient.del(`verify:lockout:${userId}`);
    }
  });

  afterEach(async () => {
    if (userId) {
      await redisClient.del(`verify:${userId}`);
      await redisClient.del(`verify:cooldown:${userId}`);
      await redisClient.del(`verify:lockout:${userId}`);
    }
  });

  describe('start_identity_verification', () => {
    it('happy path: returns masked email metadata and sends email without revealing code', async () => {
      const result = await startIdentityVerification({ userId });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          sent: true,
          maskedEmail: expect.stringMatching(/^i\*\*\*@/),
          expiresInSeconds: 600,
        });
        expect((result.data as unknown as { code?: string }).code).toBeUndefined();
      }

      // Verify email service was invoked
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const call = mockSendEmail.mock.calls[0];
      expect(call).toBeDefined();
      const emailArgs = call ? call[0] : undefined;
      expect(emailArgs?.to).toContain('@example.com');
      expect(emailArgs?.subject).toBe('Your OrchestrAI verification code');

      // Verify the code exists in Redis directly
      const savedCode = await getCodeFromRedis(userId);
      expect(savedCode).toMatch(/^\d{6}$/);
      expect(emailArgs?.text).toContain(savedCode);
    });

    it('enforces 60-second cooldown on consecutive requests', async () => {
      const first = await startIdentityVerification({ userId });
      expect(first.success).toBe(true);

      const second = await startIdentityVerification({ userId });
      expect(second.success).toBe(false);
      if (!second.success) {
        expect(second.error.code).toBe('RESEND_COOLDOWN');
        expect(second.error.message).toMatch(/wait \d+ seconds/i);
      }
    });

    it('sendEmail failure revokes the code from Redis and returns failure', async () => {
      mockSendEmail.mockResolvedValueOnce({
        success: false,
        error: { code: 'EMAIL_SEND_FAILED', message: 'Provider rejected' },
      });

      const result = await startIdentityVerification({ userId });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      }

      // Code must be revoked from Redis
      const raw = await redisClient.get(`verify:${userId}`);
      expect(raw).toBeNull();
    });

    it('sendEmail timeout revokes the code from Redis and returns EMAIL_TIMEOUT', async () => {
      mockSendEmail.mockResolvedValueOnce({
        success: false,
        error: { code: 'EMAIL_TIMEOUT', message: 'Delivery timed out' },
      });

      const result = await startIdentityVerification({ userId });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_TIMEOUT');
      }

      const raw = await redisClient.get(`verify:${userId}`);
      expect(raw).toBeNull();
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

      const code = await getCodeFromRedis(userId);
      const verifyResult = await verifyIdentity({ userId, code });
      expect(verifyResult.success).toBe(true);
      if (verifyResult.success) {
        expect(verifyResult.data.verified).toBe(true);
      }
    });

    it('INVALID_CODE', async () => {
      const startResult = await startIdentityVerification({ userId });
      expect(startResult.success).toBe(true);
      if (!startResult.success) return;

      const code = await getCodeFromRedis(userId);
      const wrongCode = code === '000000' ? '111111' : '000000';
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

      const code = await getCodeFromRedis(userId);
      const wrongCode = code === '000000' ? '111111' : '000000';
      
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

  describe('initiate_password_reset', () => {
    it('returns { acknowledged: true } for a valid, existing user', async () => {
      const result = await initiatePasswordReset({ userId });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acknowledged).toBe(true);
      }
    });

    it('NOT_FOUND for a nonexistent userId', async () => {
      const result = await initiatePasswordReset({ userId: '00000000-0000-0000-0000-000000000000' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('INVALID_INPUT for a malformed userId', async () => {
      const result = await initiatePasswordReset({ userId: 'not-a-uuid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_INPUT');
      }
    });

    it('explicitly asserts the user\'s defaultAddress/name/email are unchanged in the DB', async () => {
      const { getUserById } = await import('../../persistence/repositories/marketplace.repository.js');
      
      const beforeUser = await getUserById(userId);
      expect(beforeUser).toBeDefined();

      const result = await initiatePasswordReset({ userId });
      expect(result.success).toBe(true);

      const afterUser = await getUserById(userId);
      expect(afterUser).toBeDefined();

      expect(afterUser?.email).toBe(beforeUser?.email);
      expect(afterUser?.name).toBe(beforeUser?.name);
      expect(afterUser?.defaultAddress).toBe(beforeUser?.defaultAddress);
      
      // Note: We also guarantee no ConversationState modification.
      // A static check confirms we didn't import anything from `../../state/conversation-state.js`
      // in the tools implementation file.
    });
  });
});
