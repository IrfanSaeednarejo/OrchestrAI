// src/app/ops/traces/[id]/page.test.tsx
// Phase 18 Step 5: Tests for OpsTraceInspectorPage.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OpsTraceInspectorPage from './page';
import * as opsClient from '../../../../lib/ops-client';
import { useParams } from 'next/navigation';
import type { OpsTraceResponse } from '../../../../types/ops';

vi.mock('../../../../lib/ops-client', () => ({
  fetchOpsTrace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
}));

const mockTraceData: OpsTraceResponse = {
  conversationId: 'conv-test-999',
  conversation: {
    id: 'conv-test-999',
    userId: 'user-1',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:05:00Z',
  },
  messageCount: 4,
  handoffPath: ['order_tracking'],
  eventCount: 2,
  timeline: [
    {
      type: 'routing',
      timestamp: '2026-01-01T00:00:00Z',
      sourceAgent: null,
      destinationAgent: 'order_tracking',
      intent: 'ORDER_STATUS',
      decisionType: 'INITIAL_ROUTE',
      reason: 'User asks for order',
    },
    {
      type: 'agent',
      timestamp: '2026-01-01T00:00:01Z',
      agent: 'order_tracking',
      status: 'success',
      duration: 250,
      error: null,
      tools: [],
    },
  ],
};

describe('OpsTraceInspectorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ id: 'conv-test-999' });
  });

  it('loads and displays trace details, trajectory, and event timeline', async () => {
    vi.mocked(opsClient.fetchOpsTrace).mockResolvedValue(mockTraceData);

    render(<OpsTraceInspectorPage />);

    expect(screen.getByText('conv-test-999')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('4 messages')).toBeInTheDocument();
      expect(screen.getByText('2 trace events')).toBeInTheDocument();
      expect(screen.getByTestId('handoff-breadcrumbs')).toBeInTheDocument();
      expect(screen.getByTestId('trace-timeline')).toBeInTheDocument();
      expect(screen.getByText('INITIAL_ROUTE')).toBeInTheDocument();
    });
  });

  it('renders error banner when trace API call fails', async () => {
    vi.mocked(opsClient.fetchOpsTrace).mockRejectedValue(new Error('Conversation not found'));

    render(<OpsTraceInspectorPage />);

    await waitFor(() => {
      expect(screen.getByTestId('trace-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/Conversation not found/i)).toBeInTheDocument();
    });
  });
});

