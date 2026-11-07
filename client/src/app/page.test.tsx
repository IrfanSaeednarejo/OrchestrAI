// src/app/page.test.tsx
// Phase 17 Step 6b: Integration test for master HomePage customer chat.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from './page';
import * as apiClient from '../lib/api-client';
import { DEFAULT_GUEST_USER } from '../context/user-context';
import type { Conversation, Message } from '../types/api';

vi.mock('../lib/api-client', () => ({
  fetchDemoUsers: vi.fn(),
  fetchConversations: vi.fn(),
  fetchMessages: vi.fn(),
  fetchConversation: vi.fn(),
  createConversation: vi.fn(),
  streamMessage: vi.fn(),
  peekDevVerificationCode: vi.fn(),
}));

describe('HomePage Customer Chat Integration', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv-test-111',
      userId: DEFAULT_GUEST_USER.id,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    vi.mocked(apiClient.fetchDemoUsers).mockResolvedValue([DEFAULT_GUEST_USER]);
    vi.mocked(apiClient.fetchConversations).mockResolvedValue({
      conversations: mockConversations,
      pagination: { limit: 20, offset: 0, count: 1 },
    });
    vi.mocked(apiClient.fetchMessages).mockResolvedValue([]);
  });

  it('renders master chat layout including sidebar, header, and input', async () => {
    render(<HomePage />);

    expect(screen.getByTestId('conversation-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    expect(screen.getByTestId('chat-feed')).toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Chat conv-tes/i)).toBeInTheDocument();
    });
  });

  it('allows clicking conversation item in sidebar to load messages', async () => {
    const mockMessages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-test-111',
        role: 'user',
        content: 'I need help with my tracking number',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        conversationId: 'conv-test-111',
        role: 'assistant',
        content: 'Sure! Please provide your order ID.',
        timestamp: new Date().toISOString(),
        metadata: {
          specialist: 'order_tracking',
          workflowStatus: 'ACTIVE',
        },
      },
    ];

    vi.mocked(apiClient.fetchMessages).mockResolvedValue(mockMessages);

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId('conversation-item-conv-test-111')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('conversation-item-conv-test-111'));

    await waitFor(() => {
      expect(
        screen.getByText('I need help with my tracking number')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Sure! Please provide your order ID.')
      ).toBeInTheDocument();
    });
  });

  it('submits a new message through the stream pipeline', async () => {
    vi.mocked(apiClient.createConversation).mockResolvedValue({
      id: 'conv-new-222',
      userId: DEFAULT_GUEST_USER.id,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.mocked(apiClient.streamMessage).mockImplementation(
      async (convId, text, userId, callbacks) => {
        callbacks.onNode?.({ node: 'router', timestamp: new Date().toISOString() });
        callbacks.onMessage?.({ role: 'assistant', content: 'Hello from router' });
        callbacks.onDone?.({ success: true });
      }
    );

    render(<HomePage />);

    const textarea = screen.getByTestId('message-input');
    const sendButton = screen.getByTestId('send-button');

    fireEvent.change(textarea, { target: { value: 'Can I track package 999?' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(apiClient.streamMessage).toHaveBeenCalled();
    });
  });

  it('clicking "+ New Chat" disassociates active thread and clears the chat feed', async () => {
    const mockMessages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-test-111',
        role: 'user',
        content: 'Historical user message',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        conversationId: 'conv-test-111',
        role: 'assistant',
        content: 'Historical assistant message',
        timestamp: new Date().toISOString(),
      },
    ];

    vi.mocked(apiClient.fetchMessages).mockResolvedValue(mockMessages);

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId('conversation-item-conv-test-111')).toBeInTheDocument();
    });

    // Select the conversation
    fireEvent.click(screen.getByTestId('conversation-item-conv-test-111'));

    await waitFor(() => {
      expect(screen.getByText('Historical user message')).toBeInTheDocument();
      expect(screen.getByText('Historical assistant message')).toBeInTheDocument();
    });

    // Click "+ New Chat"
    const newChatBtn = screen.getByTestId('new-chat-button');
    fireEvent.click(newChatBtn);

    // Messages should immediately disappear and feed should be empty
    await waitFor(() => {
      expect(screen.queryByText('Historical user message')).not.toBeInTheDocument();
      expect(screen.queryByText('Historical assistant message')).not.toBeInTheDocument();
    });
  });
});


