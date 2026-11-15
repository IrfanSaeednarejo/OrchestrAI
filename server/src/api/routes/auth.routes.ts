// src/api/routes/auth.routes.ts
// Phase 21: Authentication REST endpoints — register, login, logout, me.
//
// POST /api/auth/register — create a new user account with hashed password.
// POST /api/auth/login    — verify credentials, return session token.
// POST /api/auth/logout   — stateless; client drops its token (always 200).
// GET  /api/auth/me       — return the authenticated user's profile.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  getUserByEmail,
  createUser,
  getUserById,
} from '../../persistence/repositories/marketplace.repository.js';
import { hashPassword, verifyPassword } from '../../services/auth.service.js';
import { createToken } from '../../services/token.service.js';
import { authMiddleware, requireAuth } from '../middleware/auth.middleware.js';
import { ValidationError, ConflictError, UnauthorizedError } from '../errors/app-error.js';
import type { User } from '../../persistence/repositories/marketplace.repository.js';

export const authRouter = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  defaultAddress: z.string().min(1, 'Default address is required').max(300),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

const LoginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strips passwordHash from a user record before sending to client. */
function safeUser(user: User): Omit<User, 'passwordHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

// ── POST /api/auth/register ──────────────────────────────────────────────────

authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid registration data', parsed.error.flatten().fieldErrors);
      }

      const { email, name, defaultAddress, password } = parsed.data;

      // Check email uniqueness before hashing (cheap check first)
      const existing = await getUserByEmail(email);
      if (existing) {
        throw new ConflictError('An account with this email address already exists');
      }

      const passwordHash = await hashPassword(password);

      const user = await createUser({ email, name, defaultAddress, passwordHash });
      const token = createToken(user.id);

      res.status(201).json({ token, user: safeUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid login data', parsed.error.flatten().fieldErrors);
      }

      const { email, password } = parsed.data;

      // Intentionally vague error — do not reveal whether the email exists.
      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        // Still run a fake hash check to prevent timing-based email enumeration
        await hashPassword('dummy-timing-protection');
        throw new UnauthorizedError('Invalid email or password');
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const token = createToken(user.id);
      res.status(200).json({ token, user: safeUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  (_req: Request, res: Response): void => {
    // Stateless token: the client drops it. We always respond 200.
    res.status(200).json({ success: true });
  },
);

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

authRouter.get(
  '/me',
  authMiddleware,
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // req.user is set by authMiddleware; re-fetch for freshness.
      const userId = req.user?.id;
      if (!userId) {
        throw new UnauthorizedError('User account not found');
      }
      const freshUser = await getUserById(userId);
      if (!freshUser) {
        throw new UnauthorizedError('User account not found');
      }
      res.status(200).json({ user: safeUser(freshUser) });
    } catch (err) {
      next(err);
    }
  },
);
