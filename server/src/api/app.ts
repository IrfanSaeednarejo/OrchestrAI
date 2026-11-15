// src/api/app.ts
// Phase 16: Express application setup with middleware, routes, and global error handling.
// Phase 17 Step 1c: Mount dev-gated demo and verification routes outside x-user-id middleware.
// Phase 18 Step 1: Mount dev-gated ops routes.

import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.routes.js';
import { conversationRouter } from './routes/conversation.routes.js';
import { demoRouter } from './routes/demo.routes.js';
import { opsRouter } from './routes/ops.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { NotFoundError } from './errors/app-error.js';
import { config } from '../shared/config.js';
import './types.js';

export function createApp(
  configure?: (app: express.Application) => void
): express.Application {
  const app = express();

  // Global middleware
  app.use(cors({ origin: config.app.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  // Mount health check route (unauthenticated)
  app.use('/health', healthRouter);

  // Mount conversation API routes (authenticated via x-user-id)
  app.use('/api/conversations', conversationRouter);

  // Mount demo routes outside auth middleware (Phase 17 Step 1c)
  app.use('/api', demoRouter);

  // Mount ops routes outside auth middleware (Phase 18 Step 1)
  app.use('/api/ops', opsRouter);

  // Mount custom routes/handlers if provided
  if (configure) {
    configure(app);
  }

  // 404 Handler for undefined routes
  app.use((req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

export const app = createApp();
