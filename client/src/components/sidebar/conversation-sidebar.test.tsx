// src/components/sidebar/conversation-sidebar.test.tsx
// Phase 17 Step 5b / Phase 22 Step 2: Tests for ConversationSidebar component.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationSidebar } from './conversation-sidebar';
import { AuthProvider } from '../../context/auth-context';
import type { Conversation, AuthUser } from '../../types/api';

const mockUser: AuthUser = {
  id: 'user-alice-123',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  defaultAddress: '123 Test Lane',
};

const mockConversations: Conversation[] = [
  {
    id: 'conv-1111-aaaa',
    userId: mockUser.id,
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 'conv-2222-bbbb',
    userId: mockUser.id,
    status: 'escalated',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
];

describe('ConversationSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSidebar(
    props: Partial<React.ComponentProps<typeof ConversationSidebar>> = {},
    isAuth = true
  ) {
    const onSelect = vi.fn();
    const onNewChat = vi.fn();

    const utils = render(
      <AuthProvider
        initialToken={isAuth ? 'test-token' : null}
        initialUser={isAuth ? mockUser : null}
      >
        <ConversationSidebar
          conversations={mockConversations}
          selectedId={mockConversations[0].id}
          onSelect={onSelect}
          onNewChat={onNewChat}
          {...props}
        />
      </AuthProvider>
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

  it('displays authenticated user profile card and sign out button', () => {
    renderSidebar();

    expect(screen.getByTestId('sidebar-user-card')).toBeInTheDocument();
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-signout-btn')).toBeInTheDocument();
  });

  it('displays sign in button when unauthenticated', () => {
    renderSidebar({}, false);

    expect(screen.getByTestId('sidebar-signin-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-user-card')).not.toBeInTheDocument();
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
