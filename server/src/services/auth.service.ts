// src/services/auth.service.ts
// Phase 21: Cryptographic password hashing and verification using Node.js built-in
// crypto.scrypt — zero external dependencies.
//
// Hash format: "<saltHex>:<derivedKeyHex>"
//   salt    — 16 bytes (128 bits) random, generated fresh per password.
//   derived — 64 bytes (512 bits) scrypt output (N=16384, r=8, p=1).
//
// NEVER log a raw password, a hash, or a salt in isolation.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Hashes a plaintext password. Returns "<saltHex>:<keyHex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 * Returns false on any error (never throws).
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const [saltHex, keyHex] = storedHash.split(':');
    if (!saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const storedKey = Buffer.from(keyHex, 'hex');

    if (storedKey.length !== KEY_BYTES) return false;

    const derived = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
    return timingSafeEqual(storedKey, derived);
  } catch {
    return false;
  }
}

