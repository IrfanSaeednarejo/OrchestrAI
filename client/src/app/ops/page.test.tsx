// src/app/ops/page.test.tsx
// Phase 18 Step 4: Tests for OpsConversationsPage.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OpsConversationsPage from './page';
import * as opsClient from '../../lib/ops-client';
import type { OpsConversation } from '../../types/ops';

vi.mock('../../lib/ops-client', () => ({
  fetchOpsConversations: vi.fn(),
}));

const mockConversations: OpsConversation[] = [
  {
    id: 'conv-1234',
    userId: 'user-1',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    user: { email: 'alice@example.com', name: 'Alice Johnson' },
    turnCount: 3,
  },
  {
    id: 'conv-5678',
    userId: 'user-2',
    status: 'escalated',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    user: { email: 'bob@example.com', name: 'Bob Smith' },
    turnCount: 5,
  },
];

describe('OpsConversationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders metrics cards and conversation table', async () => {
    vi.mocked(opsClient.fetchOpsConversations).mockResolvedValue({
      conversations: mockConversations,
      pagination: { limit: 50, offset: 0 },
    });

    render(<OpsConversationsPage />);

    expect(screen.getByText(/Conversation Explorer/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('metric-total')).toHaveTextContent('2');
      expect(screen.getByTestId('metric-active')).toHaveTextContent('1');
      expect(screen.getByTestId('metric-escalated')).toHaveTextContent('1');
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });
  });

  it('renders error banner when API call fails', async () => {
    vi.mocked(opsClient.fetchOpsConversations).mockRejectedValue(
      new Error('Internal server error')
    );

    render(<OpsConversationsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('ops-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/Internal server error/i)).toBeInTheDocument();
    });
  });
});

