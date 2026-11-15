// src/api/routes/health.routes.ts
// Phase 16: Health check endpoint reporting PostgreSQL, Redis, and API status.

import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../persistence/db/client.js';
import { redisClient, connectRedis } from '../../persistence/redis/client.js';
import { asyncHandler } from '../utils/async-handler.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    let dbStatus: 'up' | 'down';
    let redisStatus: 'up' | 'down';

    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }

    try {
      if (!redisClient.isOpen) {
        await connectRedis();
      }
      const ping = await redisClient.ping();
      redisStatus = ping === 'PONG' ? 'up' : 'down';
    } catch {
      redisStatus = 'down';
    }

    const isHealthy = dbStatus === 'up' && redisStatus === 'up';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

