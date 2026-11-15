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
        const parsed = schema.params.parse(req.params);
        Object.assign(req.params, parsed);
      }
      if (schema.query) {
        const parsed = schema.query.parse(req.query);
        Object.assign(req.query, parsed);
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

