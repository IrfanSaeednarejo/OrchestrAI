/**
 * server/src/api/diag/retrieval-latency.test.ts
 *
 * Phase 36 Task 3b: Tests for Railway Diagnostic Route (/api/diag/retrieval-latency).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

// Mock searchHybridScopedCTE so unit tests don't make 35 real network round-trips
vi.mock('../../persistence/repositories/knowledge.repository.js', () => ({
  searchHybridScopedCTE: vi.fn().mockImplementation(async () => {
    return [
      {
        id: 'mock-chunk-1',
        versionId: 'mock-v-1',
        domain: 'orders',
        topic: 'returns',
        sectionPath: 'Eligibility',
        content: 'Mock content',
        version: '1.0.0',
        effectiveDate: new Date(),
        distance: 0.1,
        rrfScore: 0.03,
        denseRank: 1,
        sparseRank: 1,
      },
    ];
  }),
}));

describe('Phase 36 Task 3b — Retrieval Latency Diagnostic Route', () => {
  const originalToken = process.env.ADMIN_DIAG_TOKEN;
  const TEST_TOKEN = 'test-secret-diag-token-1234567890';
  const app = createApp();

  beforeEach(() => {
    process.env.ADMIN_DIAG_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.ADMIN_DIAG_TOKEN = originalToken;
    } else {
      delete process.env.ADMIN_DIAG_TOKEN;
    }
  });

  it('returns 404 (not 401) when x-diag-token header is missing', async () => {
    const res = await request(app).get('/api/diag/retrieval-latency');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  it('returns 404 (not 401) when x-diag-token header is invalid', async () => {
    const res = await request(app)
      .get('/api/diag/retrieval-latency')
      .set('x-diag-token', 'wrong-token-value');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  it('returns 404 when ADMIN_DIAG_TOKEN environment variable is not configured', async () => {
    delete process.env.ADMIN_DIAG_TOKEN;
    const res = await request(app)
      .get('/api/diag/retrieval-latency')
      .set('x-diag-token', TEST_TOKEN);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  it('returns 200 with full response shape when valid x-diag-token is provided', async () => {
    const res = await request(app)
      .get('/api/diag/retrieval-latency')
      .set('x-diag-token', TEST_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('runs_ms');
    expect(Array.isArray(res.body.runs_ms)).toBe(true);
    expect(res.body.runs_ms).toHaveLength(30);

    // Verify runs_ms is sorted ascending
    const runs = res.body.runs_ms as number[];
    for (let i = 1; i < runs.length; i++) {
      const prev = runs[i - 1];
      const curr = runs[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }

    expect(res.body).toHaveProperty('min');
    expect(res.body).toHaveProperty('p50');
    expect(res.body).toHaveProperty('p95');
    expect(res.body).toHaveProperty('max');
    expect(res.body).toHaveProperty('mean');
    expect(res.body).toHaveProperty('measurement_origin', 'railway-us-east4');
  });

  it('is accessible via /diag/retrieval-latency as well', async () => {
    const res = await request(app)
      .get('/diag/retrieval-latency')
      .set('x-diag-token', TEST_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.measurement_origin).toBe('railway-us-east4');
  });
});
