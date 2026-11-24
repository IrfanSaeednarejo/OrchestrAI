/**
 * server/src/api/diag/retrieval-latency.ts
 *
 * Phase 36 Task 3b: Railway Diagnostic Route for Retrieval Latency.
 * Measures warm steady-state latency of Layer B single-CTE hybrid retrieval
 * directly from the deployed container to capture true cross-region latency
 * from Railway (us-east4) to Neon (us-east-2).
 *
 * Security:
 * - Header-gated: x-diag-token === process.env.ADMIN_DIAG_TOKEN
 * - Returns 404 (not 401) on missing, empty, or incorrect token to obscure route existence
 */

import { Router, Request, Response } from 'express';
import {
  searchHybridScopedCTE,
  type KnowledgeDomain,
} from '../../persistence/repositories/knowledge.repository.js';

export const diagRouter = Router();

diagRouter.get('/retrieval-latency', async (req: Request, res: Response) => {
  const token = req.headers['x-diag-token'];
  const adminDiagToken = process.env.ADMIN_DIAG_TOKEN;

  // Header gate: return 404 (not 401) on missing or wrong token
  if (!adminDiagToken || !token || token !== adminDiagToken) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  try {
    const query = typeof req.query.query === 'string' ? req.query.query : 'How long do I have to return an item?';
    const domain = (typeof req.query.domain === 'string' ? req.query.domain : 'orders') as KnowledgeDomain;
    const topic = typeof req.query.topic === 'string' ? req.query.topic : 'returns';
    const topK = 3;

    const syntheticEmbedding: number[] = new Array(768).fill(0).map((_, i) => {
      return Math.sin(i + 1) / Math.sqrt(768);
    });

    const totalRuns = 35;
    const warmupDiscardCount = 5;
    const allDurations: number[] = [];

    for (let i = 0; i < totalRuns; i++) {
      const start = performance.now();
      await searchHybridScopedCTE(syntheticEmbedding, query, domain, topic, topK);
      const duration = performance.now() - start;
      allDurations.push(Number(duration.toFixed(2)));
    }

    const warmRuns = allDurations.slice(warmupDiscardCount);
    const sortedRuns = [...warmRuns].sort((a, b) => a - b);

    const min = sortedRuns[0] ?? 0;
    const max = sortedRuns[sortedRuns.length - 1] ?? 0;
    const sum = sortedRuns.reduce((acc, v) => acc + v, 0);
    const mean = Number((sum / sortedRuns.length).toFixed(2));
    const p50 = sortedRuns[Math.floor(sortedRuns.length * 0.50)] ?? 0;
    const p95 = sortedRuns[Math.floor(sortedRuns.length * 0.95)] ?? 0;

    res.json({
      runs_ms: sortedRuns,
      min,
      p50,
      p95,
      max,
      mean,
      measurement_origin: 'railway-us-east4',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Retrieval measurement failed', details: message });
  }
});
