// src/api/middleware/auth.middleware.ts
// Phase 16: Authentication middleware resolving caller identity via x-user-id header.
// Phase 21: Added Bearer token resolution (priority over x-user-id for real users).
//
// Resolution order:
//   1. Authorization: Bearer <token>  — real registered users (Phase 21)
//   2. x-user-id: <uuid>              — benchmark / evaluation runners (Phase 16, preserved)
//   3. Guest fallback                 — anonymous visitors

import type { Request, Response, NextFunction } from 'express';
import {
  getUserById,
  createUser,
  type User,
} from '../../persistence/repositories/marketplace.repository.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors/app-error.js';
import { verifyToken } from '../../services/token.service.js';
import { config } from '../../shared/config.js';
import '../types.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_GUEST_USER_ID = '00000000-0000-4000-a000-000000000001';

export async function getOrCreateGuestUser(): Promise<User> {
  const existing = await getUserById(DEFAULT_GUEST_USER_ID);
  if (existing) {
    return existing;
  }

  try {
    return await createUser({
      id: DEFAULT_GUEST_USER_ID,
      name: 'Guest User',
      email: 'guest@orchestrai.internal',
      defaultAddress: '100 Guest St',
    });
  } catch {
    const fallback = await getUserById(DEFAULT_GUEST_USER_ID);
    if (fallback) {
      return fallback;
    }
    throw new Error('Failed to resolve guest user');
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // ── Priority 1: Bearer token (real users, Phase 21) ──────────────────────
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);
      if (!payload) {
        throw new UnauthorizedError('Invalid or expired session token');
      }
      const user = await getUserById(payload.userId);
      if (!user) {
        throw new UnauthorizedError('User account not found');
      }
      req.user = user;
      req.authMethod = 'bearer';
      return next();
    }

    // ── Priority 2: x-user-id header (benchmark runners, Phase 16) ───────────
    const rawUserId = req.headers['x-user-id'];
    if (rawUserId !== undefined) {
      if (config.env === 'production') {
        throw new UnauthorizedError('x-user-id header authentication is disabled in production');
      }

      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

      if (!userId || !UUID_REGEX.test(userId)) {
        throw new BadRequestError('Invalid x-user-id header: must be a valid UUID');
      }

      const user = await getUserById(userId);
      if (!user) {
        throw new NotFoundError(`User with id "${userId}" not found`);
      }

      req.user = user;
      req.authMethod = 'x-user-id';
      return next();
    }

    // ── Priority 3: Guest fallback (anonymous visitors) ───────────────────────
    if (config.env === 'production') {
      throw new UnauthorizedError('Authentication required');
    }

    const guestUser = await getOrCreateGuestUser();
    req.user = {
      ...guestUser,
      isGuest: true,
    };
    req.authMethod = 'guest';
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Strict auth guard — requires a resolved non-guest user.
 * Routes that need a confirmed identity (e.g. /api/auth/me, /api/orders) use this.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user || (req.user as User & { isGuest?: boolean }).isGuest === true) {
      throw new UnauthorizedError('Authentication required');
    }
    next();
  } catch (err) {
    next(err);
  }
}
