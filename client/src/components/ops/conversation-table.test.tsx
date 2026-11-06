// src/components/ops/conversation-table.test.tsx
// Phase 18 Step 4: Tests for ConversationTable component.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationTable } from './conversation-table';
import type { OpsConversation } from '../../types/ops';

const mockConversations: OpsConversation[] = [
  {
    id: '11111111-aaaa-4111-a111-111111111111',
    userId: 'u-1',
    status: 'active',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:05:00Z',
    user: { email: 'alice@example.com', name: 'Alice Johnson' },
    turnCount: 2,
  },
  {
    id: '22222222-bbbb-4222-a222-222222222222',
    userId: 'u-2',
    status: 'escalated',
    createdAt: '2026-01-01T11:00:00Z',
    updatedAt: '2026-01-01T11:15:00Z',
    user: { email: 'bob@example.com', name: 'Bob Smith' },
    turnCount: 4,
  },
];

describe('ConversationTable', () => {
  it('renders conversations and status badges correctly', () => {
    const onRefresh = vi.fn();
    render(
      <ConversationTable
        conversations={mockConversations}
        isLoading={false}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByTestId('status-active')).toBeInTheDocument();
    expect(screen.getByTestId('status-escalated')).toBeInTheDocument();
  });

  it('filters rows when typing in the search box', () => {
    render(
      <ConversationTable
        conversations={mockConversations}
        isLoading={false}
        onRefresh={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
  });

  it('filters rows when selecting a status in dropdown', () => {
    render(
      <ConversationTable
        conversations={mockConversations}
        isLoading={false}
        onRefresh={vi.fn()}
      />
    );

    const select = screen.getByTestId('status-filter-select');
    fireEvent.change(select, { target: { value: 'escalated' } });

    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
  });

  it('shows no results message when filter matches nothing', () => {
    render(
      <ConversationTable
        conversations={mockConversations}
        isLoading={false}
        onRefresh={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByTestId('no-results-row')).toBeInTheDocument();
  });

  it('triggers onRefresh when clicking refresh button', () => {
    const onRefresh = vi.fn();
    render(
      <ConversationTable
        conversations={mockConversations}
        isLoading={false}
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByTestId('refresh-button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders inspect link with trace route', () => {
    render(
      <ConversationTable
        conversations={mockConversations}
        isLoading={false}
        onRefresh={vi.fn()}
      />
    );

    const link = screen.getByTestId('inspect-btn-11111111-aaaa-4111-a111-111111111111');
    expect(link).toHaveAttribute('href', '/ops/traces/11111111-aaaa-4111-a111-111111111111');
  });
});

