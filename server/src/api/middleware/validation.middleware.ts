// src/api/middleware/validation.middleware.ts
// Phase 16: Request validation middleware using Zod schemas.

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

export interface ValidationSchema {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validateRequest(schema: ValidationSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schema.params) {
        req.params = schema.params.parse(req.params) as typeof req.params;
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query) as typeof req.query;
      }
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

