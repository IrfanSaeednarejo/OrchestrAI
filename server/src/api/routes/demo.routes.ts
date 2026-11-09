// src/api/routes/demo.routes.ts
// Phase 17 Step 1c: Dev-gated demo identity and verification inspection routes.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../../shared/config.js';
import { getUserByEmail } from '../../persistence/repositories/marketplace.repository.js';
import { DEFAULT_GUEST_USER_ID } from '../middleware/auth.middleware.js';
import { verificationService } from '../../services/verification.service.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';

export const demoRouter = Router();

// Middleware: Route-level gate for demo endpoints
function requireDemoEnabled(req: Request, _res: Response, next: NextFunction): void {
  const isEnabled =
    req.app?.locals?.enableDemoEndpoints !== undefined
      ? Boolean(req.app.locals.enableDemoEndpoints)
      : config.app.enableDemoEndpoints;

  if (!isEnabled || config.env === 'production') {
    throw new NotFoundError('Demo endpoints are not enabled');
  }
  next();
}

const SEED_CONFIGS = [
  {
    email: 'alice@example.com',
    scenario: 'Scenario 1 (Order Tracking) & Scenario 5 (Unverified -> OTP Verification)',
  },
  {
    email: 'bob@example.com',
    scenario: 'Scenario 2 (Ambiguous Order Disambiguation)',
  },
  {
    email: 'charlie@example.com',
    scenario: 'Scenario 3 (Duplicate Payment Charge -> Refund)',
  },
  {
    email: 'dave@example.com',
    scenario: 'Scenario 6 (Return creation) & Scenario 7 (Returns login issue)',
  },
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

demoRouter.get(
  '/demo-users',
  requireDemoEnabled,
  asyncHandler(async (_req: Request, res: Response) => {
    const usersList = [];

    // Add guest user first
    usersList.push({
      id: DEFAULT_GUEST_USER_ID,
      name: 'Guest User',
      email: 'guest@orchestrai.internal',
      scenario: 'Unauthenticated / Guest access',
      isGuest: true,
    });

    // Query each seed user by email dynamically
    for (const item of SEED_CONFIGS) {
      const user = await getUserByEmail(item.email);
      if (user) {
        usersList.push({
          id: user.id,
          name: user.name,
          email: user.email,
          scenario: item.scenario,
          isGuest: false,
        });
      }
    }

    res.status(200).json({ users: usersList });
  })
);

demoRouter.get(
  '/dev/verification-code',
  requireDemoEnabled,
  asyncHandler(async (req: Request, res: Response) => {
    const rawUserId = req.query.userId;
    if (!rawUserId || typeof rawUserId !== 'string' || !UUID_REGEX.test(rawUserId)) {
      throw new ValidationError('Valid userId UUID query parameter is required');
    }

    const code = await verificationService.peekVerificationCode(rawUserId);
    res.status(200).json({
      userId: rawUserId,
      code,
    });
  })
);
