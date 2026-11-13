// src/api/routes/profile-update.routes.ts
// Phase 26 Step 2: Profile-update verification endpoints.
//
// All three routes require a resolved authenticated user (Bearer token or x-user-id).
// Guest access is rejected by requireAuth.
//
// POST /profile/update/request-code  — issue + email a 6-digit code
// POST /profile/update/verify        — validate code + apply DB change
// POST /profile/update/resend-code   — re-issue code (cooldown enforced)

import { Router } from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth.middleware.js';
import {
  handleRequestCode,
  handleVerify,
  handleResendCode,
} from '../controllers/profile-update.controller.js';

export const profileUpdateRouter = Router();

profileUpdateRouter.use(authMiddleware, requireAuth);

profileUpdateRouter.post('/request-code', handleRequestCode);
profileUpdateRouter.post('/verify', handleVerify);
profileUpdateRouter.post('/resend-code', handleResendCode);
