// src/api/middleware/error.middleware.ts
// Phase 16: Global error handling middleware for Express.

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // 1. Custom AppError hierarchy
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Request validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      },
    });
    return;
  }

  // 3. Body-parser JSON syntax errors
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    res.status(400).json({
      error: {
        message: 'Malformed JSON payload received',
        code: 'INVALID_JSON',
      },
    });
    return;
  }

  // 4. Unhandled unexpected errors: log safely and return sanitized 500
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[API Error]:', err);

  res.status(500).json({
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
      code: 'INTERNAL_ERROR',
    },
  });
};

