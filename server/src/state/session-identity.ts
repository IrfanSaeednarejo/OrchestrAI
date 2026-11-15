// src/state/session-identity.ts
// Phase 24 (Stabilization) Step 1a: Pure helper resolving session identity for graph turns.
// Bearer users receive LIGHTLY_VERIFIED with verificationMethod: 'session'.
// Guests and x-user-id callers receive UNVERIFIED.
// An existing VERIFIED identity is preserved only if verifiedAt is within 15-minute TTL.
// This helper NEVER emits a new VERIFIED identity.

import type { IdentityState } from './conversation-state.js';

export const VERIFIED_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type AuthMethod = 'bearer' | 'x-user-id' | 'guest';

export function resolveSessionIdentity(
  authMethod: AuthMethod | undefined,
  currentIdentity: IdentityState | null | undefined,
  now: Date = new Date(),
): IdentityState {
  // If already VERIFIED, check TTL
  if (currentIdentity?.status === 'VERIFIED') {
    if (currentIdentity.verifiedAt) {
      const verifiedTimestamp = new Date(currentIdentity.verifiedAt).getTime();
      if (!Number.isNaN(verifiedTimestamp) && now.getTime() - verifiedTimestamp < VERIFIED_TTL_MS) {
        return currentIdentity;
      }
    }
    // Expired VERIFIED drops to LIGHTLY_VERIFIED for bearer, or UNVERIFIED otherwise
    if (authMethod === 'bearer') {
      return {
        status: 'LIGHTLY_VERIFIED',
        verificationMethod: 'session',
        verifiedAt: now.toISOString(),
      };
    }
    return {
      status: 'UNVERIFIED',
      verificationMethod: null,
      verifiedAt: null,
    };
  }

  // Bearer users -> LIGHTLY_VERIFIED / session
  if (authMethod === 'bearer') {
    return {
      status: 'LIGHTLY_VERIFIED',
      verificationMethod: 'session',
      verifiedAt: now.toISOString(),
    };
  }

  // Guest / x-user-id / undefined -> UNVERIFIED
  return {
    status: 'UNVERIFIED',
    verificationMethod: null,
    verifiedAt: null,
  };
}

