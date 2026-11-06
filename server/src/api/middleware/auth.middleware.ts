// src/api/middleware/auth.middleware.ts
// Phase 16: Authentication middleware resolving caller identity via x-user-id header.

import type { Request, Response, NextFunction } from 'express';
import {
  getUserById,
  createUser,
  type User,
} from '../../persistence/repositories/marketplace.repository.js';
import { BadRequestError, NotFoundError } from '../errors/app-error.js';
import '../types.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';

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
  next: NextFunction
): Promise<void> {
  try {
    const rawUserId = req.headers['x-user-id'];

    if (rawUserId !== undefined) {
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

      if (!userId || !UUID_REGEX.test(userId)) {
        throw new BadRequestError('Invalid x-user-id header: must be a valid UUID');
      }

      const user = await getUserById(userId);
      if (!user) {
        throw new NotFoundError(`User with id "${userId}" not found`);
      }

      req.user = user;
      return next();
    }

    // Guest fallback when x-user-id is omitted
    const guestUser = await getOrCreateGuestUser();
    req.user = {
      ...guestUser,
      isGuest: true,
    };
    next();
  } catch (err) {
    next(err);
  }
}

