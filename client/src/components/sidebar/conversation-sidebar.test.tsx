// src/components/sidebar/conversation-sidebar.test.tsx
// Phase 17 Step 5b: Tests for ConversationSidebar component.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationSidebar } from './conversation-sidebar';
import { UserProvider, DEFAULT_GUEST_USER } from '../../context/user-context';
import type { Conversation, DemoUser } from '../../types/api';

const mockDemoUsers: DemoUser[] = [
  DEFAULT_GUEST_USER,
  {
    id: '11111111-1111-4111-a111-111111111111',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    scenario: 'Scenario 1 & 5',
    isGuest: false,
  },
  {
    id: '22222222-2222-4222-a222-222222222222',
    name: 'Bob Smith',
    email: 'bob@example.com',
    scenario: 'Scenario 2',
    isGuest: false,
  },
];

const mockConversations: Conversation[] = [
  {
    id: 'conv-1111-aaaa',
    userId: DEFAULT_GUEST_USER.id,
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'conv-2222-bbbb',
    userId: DEFAULT_GUEST_USER.id,
    status: 'escalated',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
];

describe('ConversationSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSidebar(props: Partial<React.ComponentProps<typeof ConversationSidebar>> = {}) {
    const onSelect = vi.fn();
    const onNewChat = vi.fn();

    const utils = render(
      <UserProvider initialUsers={mockDemoUsers} initialUser={DEFAULT_GUEST_USER}>
        <ConversationSidebar
          conversations={mockConversations}
          selectedId={mockConversations[0].id}
          onSelect={onSelect}
          onNewChat={onNewChat}
          {...props}
        />
      </UserProvider>
    );

    return { ...utils, onSelect, onNewChat };
  }

  it('renders conversations list and highlights active selection', () => {
    renderSidebar();

    expect(screen.getByText(/Chat conv-111/i)).toBeInTheDocument();
    expect(screen.getByText(/Chat conv-222/i)).toBeInTheDocument();

    const activeItem = screen.getByTestId('conversation-item-conv-1111-aaaa');
    expect(activeItem).toHaveClass('bg-slate-800');
  });

  it('calls onSelect when a conversation item is clicked', () => {
    const { onSelect } = renderSidebar();

    fireEvent.click(screen.getByTestId('conversation-item-conv-2222-bbbb'));
    expect(onSelect).toHaveBeenCalledWith('conv-2222-bbbb');
  });

  it('calls onNewChat when "+ New Chat" button is clicked', () => {
    const { onNewChat } = renderSidebar();

    fireEvent.click(screen.getByTestId('new-chat-button'));
    expect(onNewChat).toHaveBeenCalled();
  });

  it('displays mandatory demo identity disclaimer', () => {
    renderSidebar();

    expect(
      screen.getByText(/demo identity, not authentication/i)
    ).toBeInTheDocument();
  });

  it('allows switching demo identities via select dropdown', () => {
    renderSidebar();

    const select = screen.getByTestId('demo-user-select') as HTMLSelectElement;
    expect(select.value).toBe(DEFAULT_GUEST_USER.id);

    fireEvent.change(select, { target: { value: mockDemoUsers[1].id } });
    expect(select.value).toBe(mockDemoUsers[1].id);
    expect(screen.getByText(/Active:/i)).toHaveTextContent('alice@example.com');
  });

  it('shows empty state message when no conversations exist', () => {
    renderSidebar({ conversations: [] });

    expect(
      screen.getByText(/No active conversations\. Start a new chat above\./i)
    ).toBeInTheDocument();
  });

  it('shows loading indicator when isLoading is true', () => {
    renderSidebar({ isLoading: true });

    expect(screen.getByText(/Loading chats\.\.\./i)).toBeInTheDocument();
  });
});

