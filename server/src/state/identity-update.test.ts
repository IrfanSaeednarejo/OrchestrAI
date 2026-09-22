import { describe, it, expect } from 'vitest';
import { buildIdentityUpdate } from './identity-update.js';

describe('buildIdentityUpdate', () => {
  it('UNVERIFIED + both fields null -> succeeds', () => {
    const result = buildIdentityUpdate({ status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null });
    expect(result).toEqual({
      identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null }
    });
  });

  it('UNVERIFIED + verificationMethod non-null -> throws', () => {
    expect(() => buildIdentityUpdate({ status: 'UNVERIFIED', verificationMethod: 'sms', verifiedAt: null })).toThrow();
  });

  it('UNVERIFIED + verifiedAt non-null -> throws', () => {
    expect(() => buildIdentityUpdate({ status: 'UNVERIFIED', verificationMethod: null, verifiedAt: '2023-01-01T00:00:00Z' })).toThrow();
  });

  it('LIGHTLY_VERIFIED + both fields set -> succeeds with values passed through unchanged', () => {
    const result = buildIdentityUpdate({ status: 'LIGHTLY_VERIFIED', verificationMethod: 'sms', verifiedAt: '2023-01-01T00:00:00Z' });
    expect(result).toEqual({
      identity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'sms', verifiedAt: '2023-01-01T00:00:00Z' }
    });
  });

  it('LIGHTLY_VERIFIED + verificationMethod null -> throws', () => {
    expect(() => buildIdentityUpdate({ status: 'LIGHTLY_VERIFIED', verificationMethod: null, verifiedAt: '2023-01-01T00:00:00Z' })).toThrow();
  });

  it('LIGHTLY_VERIFIED + verifiedAt null -> throws', () => {
    expect(() => buildIdentityUpdate({ status: 'LIGHTLY_VERIFIED', verificationMethod: 'sms', verifiedAt: null })).toThrow();
  });

  it('VERIFIED + both fields set -> succeeds', () => {
    const result = buildIdentityUpdate({ status: 'VERIFIED', verificationMethod: 'gov_id', verifiedAt: '2023-01-01T00:00:00Z' });
    expect(result).toEqual({
      identity: { status: 'VERIFIED', verificationMethod: 'gov_id', verifiedAt: '2023-01-01T00:00:00Z' }
    });
  });

  it('VERIFIED + both fields null -> throws', () => {
    expect(() => buildIdentityUpdate({ status: 'VERIFIED', verificationMethod: null, verifiedAt: null })).toThrow();
  });

  it('purity: two calls with the same valid input produce deeply equal results', () => {
    const input = { status: 'VERIFIED' as const, verificationMethod: 'gov_id', verifiedAt: '2023-01-01T00:00:00Z' };
    const result1 = buildIdentityUpdate(input);
    const result2 = buildIdentityUpdate(input);
    expect(result1).toEqual(result2);
  });
});
