// src/services/token.service.ts
// Phase 21: Stateless HMAC-SHA256 session token generation and verification.
//
// Token format (URL-safe base64, dot-separated):
//   <base64url(payload)>.<base64url(signature)>
//
// Payload: JSON { userId: string, exp: number (Unix ms timestamp) }
// Signature: HMAC-SHA256 of the base64url payload using TOKEN_SECRET.
//
// NEVER log the raw token or the secret.

import { createHmac } from 'node:crypto';
import { config } from '../shared/config.js';

interface TokenPayload {
  userId: string;
  exp: number; // Unix ms timestamp
}

function toBase64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const b64 = pad ? padded + '='.repeat(4 - pad) : padded;
  return Buffer.from(b64, 'base64').toString('utf8');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', config.auth.tokenSecret)
    .update(payloadB64)
    .digest('base64url');
}

/** Creates a signed Bearer token for the given userId. Expires in config.auth.tokenExpiryMs. */
export function createToken(userId: string): string {
  const payload: TokenPayload = {
    userId,
    exp: Date.now() + config.auth.tokenExpiryMs,
  };
  const payloadB64 = toBase64url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies a Bearer token. Returns the payload if valid, null otherwise.
 * Never throws — invalid tokens return null silently.
 */
export function verifyToken(token: string): { userId: string } | null {
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) return null;

    const payloadB64 = token.slice(0, dotIdx);
    const receivedSig = token.slice(dotIdx + 1);

    // Constant-time signature comparison via re-signing
    const expectedSig = sign(payloadB64);
    if (receivedSig.length !== expectedSig.length) return null;

    // Compare byte-by-byte in constant time
    let diff = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      diff |= expectedSig.charCodeAt(i) ^ receivedSig.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const raw = fromBase64url(payloadB64);
    const payload = JSON.parse(raw) as TokenPayload;

    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() > payload.exp) return null;

    return { userId: payload.userId };
  } catch {
    return null;
  }
}

