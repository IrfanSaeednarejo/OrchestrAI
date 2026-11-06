// src/api/app.ts
// Phase 16: Express application setup with middleware, routes, and global error handling.

import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { NotFoundError } from './errors/app-error.js';
import './types.js';

export function createApp(
  configure?: (app: express.Application) => void
): express.Application {
  const app = express();

  // Global middleware
  app.use(cors());
  app.use(express.json());

  // Mount health check route (unauthenticated)
  app.use('/health', healthRouter);

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

