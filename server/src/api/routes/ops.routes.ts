// src/api/routes/ops.routes.ts
// Phase 18 Step 1: Dev-gated Ops API routes.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../../shared/config.js';
import { asyncHandler } from '../utils/async-handler.js';
import { NotFoundError } from '../errors/app-error.js';
import {
  listOpsConversationsHandler,
  getOpsTraceHandler,
  getOpsEvalResultsHandler,
} from '../controllers/ops.controller.js';

export const opsRouter = Router();

function requireDemoEnabled(req: Request, _res: Response, next: NextFunction): void {
  const isEnabled =
    req.app?.locals?.enableDemoEndpoints !== undefined
      ? Boolean(req.app.locals.enableDemoEndpoints)
      : config.app.enableDemoEndpoints;

  if (!isEnabled || config.env === 'production') {
    throw new NotFoundError('Ops endpoints are not enabled');
  }
  next();
}

// All ops routes gated by demo flag
opsRouter.get('/conversations', requireDemoEnabled, asyncHandler(listOpsConversationsHandler));
opsRouter.get(
  '/conversations/:id/traces',
  requireDemoEnabled,
  asyncHandler(getOpsTraceHandler)
);
opsRouter.get('/eval-results', requireDemoEnabled, asyncHandler(getOpsEvalResultsHandler));

