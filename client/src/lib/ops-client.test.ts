// src/lib/ops-client.test.ts
// Phase 18 Step 2: Unit tests for ops API client helpers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOpsConversations,
  fetchOpsTrace,
  fetchOpsEvalResults,
} from './ops-client';
import { ApiClientError } from './api-client';

describe('ops-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetchOpsConversations queries /api/ops/conversations and returns list', async () => {
    const mockData = {
      conversations: [
        {
          id: 'c-1',
          userId: 'u-1',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          user: { email: 'alice@example.com', name: 'Alice' },
          turnCount: 2,
        },
      ],
      pagination: { limit: 20, offset: 0 },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const res = await fetchOpsConversations(20, 0);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ops/conversations?limit=20&offset=0')
    );
    expect(res.conversations.length).toBe(1);
    expect(res.conversations[0].id).toBe('c-1');
  });

  it('fetchOpsTrace queries /api/ops/conversations/:id/traces and returns trace data', async () => {
    const mockTrace = {
      conversationId: 'c-1',
      conversation: {
        id: 'c-1',
        userId: 'u-1',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      messageCount: 3,
      handoffPath: ['order_tracking'],
      eventCount: 1,
      timeline: [
        {
          type: 'routing',
          timestamp: '2026-01-01T00:00:00Z',
          sourceAgent: null,
          destinationAgent: 'order_tracking',
          intent: 'ORDER_STATUS',
          decisionType: 'INITIAL_ROUTE',
          reason: 'Initial user query',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTrace,
    });

    const res = await fetchOpsTrace('c-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ops/conversations/c-1/traces')
    );
    expect(res.handoffPath).toContain('order_tracking');
    expect(res.timeline.length).toBe(1);
  });

  it('fetchOpsEvalResults queries /api/ops/eval-results and returns BenchmarkReport', async () => {
    const mockReport = {
      totalScenarios: 30,
      passedScenarios: 30,
      passRate: 1.0,
      byEvaluator: {},
      byDomain: {},
      scenarioResults: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ report: mockReport }),
    });

    const report = await fetchOpsEvalResults();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/ops/eval-results')
    );
    expect(report.totalScenarios).toBe(30);
    expect(report.passRate).toBe(1.0);
  });

  it('throws ApiClientError when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      }),
    });

    await expect(fetchOpsTrace('invalid-id')).rejects.toThrow(ApiClientError);
  });
});

