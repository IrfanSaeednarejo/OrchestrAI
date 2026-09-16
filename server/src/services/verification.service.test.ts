import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { verificationService } from './verification.service.js';
import { redisClient, connectRedis } from '../persistence/redis/client.js';

describe('verification.service', () => {
  const testUserId = 'test-verification-user-id';

  beforeAll(async () => {
    await connectRedis();
  });

  afterEach(async () => {
    await redisClient.del(`verify:${testUserId}`);
  });

  it('issueVerificationCode returns a 6-digit numeric string', async () => {
    const result = await verificationService.issueVerificationCode(testUserId);
    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toMatch(/^\d{6}$/);
    }
  });

  it('checkVerificationCode succeeds with correct code, and code is gone afterward', async () => {
    const issueResult = await verificationService.issueVerificationCode(testUserId);
    expect('code' in issueResult).toBe(true);
    if (!('code' in issueResult)) return;

    const check1 = await verificationService.checkVerificationCode(testUserId, issueResult.code);
    expect(check1).toEqual({ success: true });

    // A second check should now return CODE_EXPIRED
    const check2 = await verificationService.checkVerificationCode(testUserId, issueResult.code);
    expect(check2).toEqual({ success: false, reason: 'CODE_EXPIRED' });
  });

  it('checkVerificationCode returns INVALID_CODE for a wrong code', async () => {
    const issueResult = await verificationService.issueVerificationCode(testUserId);
    expect('code' in issueResult).toBe(true);
    if (!('code' in issueResult)) return;

    const wrongCode = issueResult.code === '000000' ? '111111' : '000000';
    const check = await verificationService.checkVerificationCode(testUserId, wrongCode);
    expect(check).toEqual({ success: false, reason: 'INVALID_CODE' });

    // The code should still be in Redis, just once
    const checkAgain = await verificationService.checkVerificationCode(testUserId, issueResult.code);
    expect(checkAgain).toEqual({ success: true });
  });

  it('checkVerificationCode returns CODE_EXPIRED when no code was issued', async () => {
    const check = await verificationService.checkVerificationCode(testUserId, '123456');
    expect(check).toEqual({ success: false, reason: 'CODE_EXPIRED' });
  });

  it('5 consecutive wrong attempts returns MAX_ATTEMPTS_EXCEEDED and force-deletes code', async () => {
    const issueResult = await verificationService.issueVerificationCode(testUserId);
    expect('code' in issueResult).toBe(true);
    if (!('code' in issueResult)) return;

    const wrongCode = issueResult.code === '000000' ? '111111' : '000000';

    // 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      const check = await verificationService.checkVerificationCode(testUserId, wrongCode);
      expect(check).toEqual({ success: false, reason: 'INVALID_CODE' });
    }

    // 5th wrong attempt
    const check5 = await verificationService.checkVerificationCode(testUserId, wrongCode);
    expect(check5).toEqual({ success: false, reason: 'MAX_ATTEMPTS_EXCEEDED' });

    // Now even the correct code should be expired
    const checkRight = await verificationService.checkVerificationCode(testUserId, issueResult.code);
    expect(checkRight).toEqual({ success: false, reason: 'CODE_EXPIRED' });
  });

  it('calling issueVerificationCode again overwrites and resets attempts', async () => {
    const issue1 = await verificationService.issueVerificationCode(testUserId);
    expect('code' in issue1).toBe(true);
    if (!('code' in issue1)) return;

    const wrongCode = issue1.code === '000000' ? '111111' : '000000';
    // 3 wrong attempts
    for (let i = 0; i < 3; i++) {
      await verificationService.checkVerificationCode(testUserId, wrongCode);
    }

    // Re-issue
    const issue2 = await verificationService.issueVerificationCode(testUserId);
    expect('code' in issue2).toBe(true);
    if (!('code' in issue2)) return;

    // Check with new wrong code (should not hit max attempts yet)
    const newWrongCode = issue2.code === '000000' ? '111111' : '000000';
    const check1 = await verificationService.checkVerificationCode(testUserId, newWrongCode);
    expect(check1).toEqual({ success: false, reason: 'INVALID_CODE' }); // Only 1 attempt on the new code
    
    // Check old code, should fail
    const checkOld = await verificationService.checkVerificationCode(testUserId, issue1.code);
    expect(checkOld).toEqual({ success: false, reason: 'INVALID_CODE' });
  });
});
