import { describe, it, expect } from 'vitest';
import {
  resolveSessionIdentity,
  VERIFIED_TTL_MS,
  type AuthMethod,
} from './session-identity.js';
import type { IdentityState } from './conversation-state.js';

describe('resolveSessionIdentity', () => {
  const baseTime = new Date('2026-11-09T10:00:00.000Z');

  it('resolves bearer user with no existing identity as LIGHTLY_VERIFIED with session method', () => {
    const result = resolveSessionIdentity('bearer', null, baseTime);
    expect(result).toEqual({
      status: 'LIGHTLY_VERIFIED',
      verificationMethod: 'session',
      verifiedAt: baseTime.toISOString(),
    });
  });

  it('resolves guest user with no existing identity as UNVERIFIED', () => {
    const result = resolveSessionIdentity('guest', null, baseTime);
    expect(result).toEqual({
      status: 'UNVERIFIED',
      verificationMethod: null,
      verifiedAt: null,
    });
  });

  it('resolves x-user-id user with no existing identity as UNVERIFIED', () => {
    const result = resolveSessionIdentity('x-user-id', null, baseTime);
    expect(result).toEqual({
      status: 'UNVERIFIED',
      verificationMethod: null,
      verifiedAt: null,
    });
  });

  it('resolves undefined authMethod as UNVERIFIED', () => {
    const result = resolveSessionIdentity(undefined, null, baseTime);
    expect(result).toEqual({
      status: 'UNVERIFIED',
      verificationMethod: null,
      verifiedAt: null,
    });
  });

  it('preserves existing VERIFIED identity if within TTL', () => {
    const existing: IdentityState = {
      status: 'VERIFIED',
      verificationMethod: 'pin',
      verifiedAt: '2026-11-09T09:50:00.000Z', // 10 minutes ago (< 15 min TTL)
    };
    const result = resolveSessionIdentity('bearer', existing, baseTime);
    expect(result).toEqual(existing);
  });

  it('downgrades expired VERIFIED identity to LIGHTLY_VERIFIED for bearer callers', () => {
    const existing: IdentityState = {
      status: 'VERIFIED',
      verificationMethod: 'pin',
      verifiedAt: new Date(baseTime.getTime() - VERIFIED_TTL_MS - 1000).toISOString(), // 15 min 1s ago
    };
    const result = resolveSessionIdentity('bearer', existing, baseTime);
    expect(result).toEqual({
      status: 'LIGHTLY_VERIFIED',
      verificationMethod: 'session',
      verifiedAt: baseTime.toISOString(),
    });
  });

  it('downgrades expired VERIFIED identity to UNVERIFIED for non-bearer callers', () => {
    const existing: IdentityState = {
      status: 'VERIFIED',
      verificationMethod: 'pin',
      verifiedAt: new Date(baseTime.getTime() - VERIFIED_TTL_MS - 1000).toISOString(),
    };
    const resultGuest = resolveSessionIdentity('guest', existing, baseTime);
    expect(resultGuest).toEqual({
      status: 'UNVERIFIED',
      verificationMethod: null,
      verifiedAt: null,
    });

    const resultXUserId = resolveSessionIdentity('x-user-id', existing, baseTime);
    expect(resultXUserId).toEqual({
      status: 'UNVERIFIED',
      verificationMethod: null,
      verifiedAt: null,
    });
  });

  it('never emits a new VERIFIED status even for bearer caller', () => {
    const inputs: Array<[AuthMethod | undefined, IdentityState | null]> = [
      ['bearer', null],
      ['bearer', { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null }],
      [
        'bearer',
        { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number', verifiedAt: baseTime.toISOString() },
      ],
      ['x-user-id', null],
      ['guest', null],
    ];

    for (const [authMethod, identity] of inputs) {
      const res = resolveSessionIdentity(authMethod, identity, baseTime);
      expect(res.status).not.toBe('VERIFIED');
    }
  });
});

