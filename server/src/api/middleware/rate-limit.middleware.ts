// src/api/middleware/rate-limit.middleware.ts
// Phase 24 Step 2: Rate-limiting middleware using Redis fixed-window counter.
// Bypassed in test environment to prevent suite test throttling.

import type { Request, Response, NextFunction } from 'express';
import { redisClient, connectRedis } from '../../persistence/redis/client.js';
import { config } from '../../shared/config.js';

interface RateLimitOptions {
  windowSeconds?: number;
  maxRequests?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowSeconds = options.windowSeconds ?? 60;
  const maxRequests = options.maxRequests ?? 60;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (config.env === 'test') {
      return next();
    }

    const identifier = req.user?.id || req.ip || 'anonymous';
    const key = `ratelimit:${req.baseUrl || req.path}:${identifier}`;

    try {
      await connectRedis();
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        res.status(429).json({
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests, please try again later.',
          },
        });
        return;
      }

      next();
    } catch {
      // Graceful fallback: never fail legitimate users if Redis rate-limiting fails
      next();
    }
  };
}

