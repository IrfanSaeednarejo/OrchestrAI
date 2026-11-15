// src/components/chat/chat-feed.test.tsx
// Phase 17 Step 5c: Tests for ChatFeed component.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatFeed } from './chat-feed';
import type { Message } from '../../types/api';

describe('ChatFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders welcome screen when message list is empty and not streaming', () => {
    render(<ChatFeed messages={[]} isStreaming={false} />);

    expect(screen.getByText(/Welcome to OrchestrAI Support/i)).toBeInTheDocument();
  });

  it('renders user and assistant messages properly', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Where is my order #12345?',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Your order **#12345** has shipped!',
        timestamp: new Date().toISOString(),
      },
    ];

    render(<ChatFeed messages={messages} />);

    expect(screen.getByText('Where is my order #12345?')).toBeInTheDocument();
    expect(screen.getByText('#12345')).toBeInTheDocument(); // Rendered in markdown bold
  });

  it('masks exactly 6-digit user message when preceding assistant has blockedBy', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'I have sent a 6-digit verification code to your email.',
        timestamp: new Date().toISOString(),
        metadata: {
          blockedBy: 'VERIFICATION_FULL',
          currentStep: 'verify_identity',
        },
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'user',
        content: '849201',
        timestamp: new Date().toISOString(),
      },
    ];

    render(<ChatFeed messages={messages} />);

    expect(screen.queryByText('849201')).not.toBeInTheDocument();
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  it('does NOT mask 6-digit user message if preceding assistant did not have blockedBy', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'What is your shipping zip code?',
        timestamp: new Date().toISOString(),
        metadata: {
          blockedBy: null,
        },
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'user',
        content: '941031',
        timestamp: new Date().toISOString(),
      },
    ];

    render(<ChatFeed messages={messages} />);

    expect(screen.getByText('941031')).toBeInTheDocument();
    expect(screen.queryByText('••••••')).not.toBeInTheDocument();
  });

  it('does NOT mask non-6-digit user message during verification', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Enter code:',
        timestamp: new Date().toISOString(),
        metadata: {
          blockedBy: 'VERIFICATION_FULL',
        },
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'user',
        content: 'I did not receive the code',
        timestamp: new Date().toISOString(),
      },
    ];

    render(<ChatFeed messages={messages} />);

    expect(screen.getByText('I did not receive the code')).toBeInTheDocument();
    expect(screen.queryByText('••••••')).not.toBeInTheDocument();
  });

  it('renders live node progress indicator when streaming with currentNode', () => {
    render(
      <ChatFeed
        messages={[]}
        isStreaming={true}
        currentNode="order_tracking"
      />
    );

    expect(screen.getByTestId('node-progress-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Working: order tracking\.\.\./i)).toBeInTheDocument();
  });

  it('renders typing indicator when streaming without currentNode or text', () => {
    render(
      <ChatFeed
        messages={[]}
        isStreaming={true}
        streamingText=""
        currentNode={null}
      />
    );

    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });

  it('renders streaming text when streamingText is provided', () => {
    render(
      <ChatFeed
        messages={[]}
        isStreaming={true}
        streamingText="Let me look up your order details right now."
        currentNode={null}
      />
    );

    expect(screen.getByTestId('streaming-text')).toBeInTheDocument();
    expect(
      screen.getByText('Let me look up your order details right now.')
    ).toBeInTheDocument();
  });

  it('renders service options beneath the last assistant message when present', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Hello! How can I assist you today?',
        timestamp: new Date().toISOString(),
      },
    ];

    const options = [
      { label: 'Track an Order', message: 'I need to track my order' },
      { label: 'Request a Return', message: 'I would like to request a return' },
    ];

    const onOptionSelect = vi.fn();

    render(
      <ChatFeed
        messages={messages}
        serviceOptions={options}
        onOptionSelect={onOptionSelect}
      />
    );

    expect(screen.getByTestId('service-option-bar')).toBeInTheDocument();
    expect(screen.getByText('Track an Order')).toBeInTheDocument();
    expect(screen.getByText('Request a Return')).toBeInTheDocument();
  });

  it('does NOT render service options when the last message is from user', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Hello!',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'user',
        content: 'I need help',
        timestamp: new Date().toISOString(),
      },
    ];

    const options = [
      { label: 'Track an Order', message: 'I need to track my order' },
    ];

    render(
      <ChatFeed
        messages={messages}
        serviceOptions={options}
        onOptionSelect={vi.fn()}
      />
    );

    expect(screen.queryByTestId('service-option-bar')).not.toBeInTheDocument();
  });
});

