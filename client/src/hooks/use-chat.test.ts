// src/hooks/use-chat.test.ts
// Phase 17 Step 6a: Tests for pure chatReducer, state derivation, and useChat hook.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  chatReducer,
  deriveStateFromMessages,
  initialChatState,
  useChat,
} from './use-chat';
import * as apiClient from '../lib/api-client';
import type { Message, Conversation } from '../types/api';

vi.mock('../lib/api-client', () => ({
  streamMessage: vi.fn(),
  fetchMessages: vi.fn(),
  createConversation: vi.fn(),
}));

describe('deriveStateFromMessages', () => {
  it('returns default values when messages are empty', () => {
    const derived = deriveStateFromMessages([]);
    expect(derived).toEqual({
      workflowStatus: 'ACTIVE',
      currentAgent: null,
      handoffCount: 0,
      blockedBy: null,
      currentStep: null,
      serviceOptions: null,
    });
  });

  it('derives values from the last assistant message metadata', () => {
    const messages: Message[] = [
      {
        id: '1',
        conversationId: 'c1',
        role: 'user',
        content: 'hello',
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        conversationId: 'c1',
        role: 'assistant',
        content: 'Hi! Let me transfer you.',
        timestamp: '2026-01-01T00:00:01Z',
        metadata: {
          specialist: 'order_tracking',
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          handoffCount: 1,
          blockedBy: 'VERIFICATION_FULL',
          currentStep: 'verify_identity',
        },
      },
    ];

    const derived = deriveStateFromMessages(messages);
    expect(derived).toEqual({
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      currentAgent: 'order_tracking',
      handoffCount: 1,
      blockedBy: 'VERIFICATION_FULL',
      currentStep: 'verify_identity',
      serviceOptions: null,
    });
  });

  it('derives serviceOptions from last assistant message metadata when present', () => {
    const options = [
      { label: 'Track an Order', message: 'I need to track my order' },
      { label: 'Request a Refund', message: 'I need help with a refund' },
    ];
    const messages: Message[] = [
      {
        id: '1',
        conversationId: 'c1',
        role: 'assistant',
        content: 'Hi! How can I help?',
        timestamp: '2026-01-01T00:00:00Z',
        metadata: {
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          options,
        },
      },
    ];

    const derived = deriveStateFromMessages(messages);
    expect(derived.serviceOptions).toEqual(options);
  });
});

describe('chatReducer', () => {
  it('handles START_SEND', () => {
    const userMsg: Message = {
      id: 'u1',
      conversationId: 'c1',
      role: 'user',
      content: 'Hello',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const next = chatReducer(initialChatState, {
      type: 'START_SEND',
      payload: { userMessage: userMsg },
    });

    expect(next.messages).toEqual([userMsg]);
    expect(next.isStreaming).toBe(true);
    expect(next.streamingText).toBe('');
    expect(next.error).toBeNull();
  });

  it('START_SEND clears serviceOptions', () => {
    const stateWithOptions = {
      ...initialChatState,
      serviceOptions: [{ label: 'Track an Order', message: 'I need to track my order' }],
    };
    const userMsg: Message = {
      id: 'u1',
      conversationId: 'c1',
      role: 'user',
      content: 'I need to track my order',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const next = chatReducer(stateWithOptions, {
      type: 'START_SEND',
      payload: { userMessage: userMsg },
    });

    expect(next.serviceOptions).toBeNull();
  });

  it('handles STREAM_NODE', () => {
    const state = { ...initialChatState, isStreaming: true };
    const next = chatReducer(state, {
      type: 'STREAM_NODE',
      payload: { node: 'returns_specialist' },
    });
    expect(next.currentNode).toBe('returns_specialist');
  });

  it('handles STREAM_MESSAGE chunk accumulation', () => {
    const s1 = { ...initialChatState, isStreaming: true, streamingText: 'Hello' };
    const s2 = chatReducer(s1, {
      type: 'STREAM_MESSAGE',
      payload: { chunk: ' world!' },
    });
    expect(s2.streamingText).toBe('Hello world!');
  });

  it('handles STREAM_ROUTING updates', () => {
    const next = chatReducer(initialChatState, {
      type: 'STREAM_ROUTING',
      payload: {
        currentAgent: 'payment',
        handoffCount: 2,
        blockedBy: 'VERIFICATION_LIGHT',
        currentStep: null,
        workflowStatus: 'BLOCKED',
      },
    });

    expect(next.currentAgent).toBe('payment');
    expect(next.handoffCount).toBe(2);
    expect(next.blockedBy).toBe('VERIFICATION_LIGHT');
    expect(next.workflowStatus).toBe('BLOCKED');
  });

  it('STREAM_ROUTING captures service options when present', () => {
    const options = [
      { label: 'Track an Order', message: 'I need to track my order' },
      { label: 'Request a Refund', message: 'I need help with a refund' },
    ];
    const next = chatReducer(initialChatState, {
      type: 'STREAM_ROUTING',
      payload: {
        currentAgent: 'router',
        handoffCount: 0,
        blockedBy: null,
        currentStep: null,
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        options,
      },
    });

    expect(next.serviceOptions).toEqual(options);
  });

  it('STREAM_ROUTING sets serviceOptions to null when options field absent', () => {
    const stateWithOptions = {
      ...initialChatState,
      serviceOptions: [{ label: 'Track an Order', message: 'I need to track my order' }],
    };
    const next = chatReducer(stateWithOptions, {
      type: 'STREAM_ROUTING',
      payload: {
        currentAgent: 'order_tracking',
        handoffCount: 0,
        blockedBy: null,
        currentStep: null,
        workflowStatus: 'ACTIVE',
        // no options field
      },
    });

    expect(next.serviceOptions).toBeNull();
  });

  it('handles STREAM_DONE and appends assistant message', () => {
    const state = {
      ...initialChatState,
      conversationId: 'c1',
      isStreaming: true,
      streamingText: 'Your order has shipped.',
      currentAgent: 'order_tracking',
    };

    const next = chatReducer(state, { type: 'STREAM_DONE' });

    expect(next.isStreaming).toBe(false);
    expect(next.streamingText).toBe('');
    expect(next.messages.length).toBe(1);
    expect(next.messages[0].role).toBe('assistant');
    expect(next.messages[0].content).toBe('Your order has shipped.');
  });

  it('handles STREAM_ERROR and transitions to FAILED status', () => {
    const state = { ...initialChatState, isStreaming: true };
    const next = chatReducer(state, {
      type: 'STREAM_ERROR',
      payload: { error: 'Network socket closed unexpectedly' },
    });

    expect(next.isStreaming).toBe(false);
    expect(next.error).toBe('Network socket closed unexpectedly');
    expect(next.workflowStatus).toBe('FAILED');
  });
});

describe('useChat hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents double-sending message via synchronous isSendingRef', async () => {
    vi.mocked(apiClient.fetchMessages).mockResolvedValue([]);

    let resolveStream: () => void;
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    vi.mocked(apiClient.streamMessage).mockReturnValue(streamPromise);

    const { result } = renderHook(() => useChat('user-1', 'c-existing-1'));

    await act(async () => {
      // wait for initial loadConversation
    });

    let send1!: Promise<void>;
    let send2!: Promise<void>;

    act(() => {
      send1 = result.current.sendMessage('First call');
      send2 = result.current.sendMessage('Second call simultaneous');
    });

    // Synchronous ref guard should immediately reflect true and reject the 2nd invocation
    expect(result.current.isSendingRef.current).toBe(true);
    expect(apiClient.streamMessage).toHaveBeenCalledTimes(1);

    // Clean up stream
    await act(async () => {
      resolveStream!();
      await send1;
      await send2;
    });

    expect(result.current.isSendingRef.current).toBe(false);
  });

  it('does not send message when workflowStatus is ESCALATED', async () => {
    vi.mocked(apiClient.fetchMessages).mockResolvedValue([
      {
        id: 'esc-1',
        conversationId: 'c-esc',
        role: 'assistant',
        content: 'Transferring to a human specialist.',
        timestamp: '2026-01-01T00:00:00Z',
        metadata: {
          workflowStatus: 'ESCALATED',
        },
      },
    ]);

    const { result } = renderHook(() => useChat('user-1', 'c-esc'));

    await act(async () => {
      // await loadConversation
    });

    expect(result.current.state.workflowStatus).toBe('ESCALATED');

    await act(async () => {
      await result.current.sendMessage('Should not be sent');
    });

    expect(apiClient.streamMessage).not.toHaveBeenCalled();
    expect(apiClient.createConversation).not.toHaveBeenCalled();
  });

  it('resets conversation state to initialChatState when resetChat is called', async () => {
    vi.mocked(apiClient.fetchMessages).mockResolvedValue([
      {
        id: 'm1',
        conversationId: 'c1',
        role: 'assistant',
        content: 'Prior message',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ]);

    const { result } = renderHook(() => useChat('user-1', 'c1'));

    await act(async () => {
      // await loadConversation
    });

    expect(result.current.state.conversationId).toBe('c1');
    expect(result.current.state.messages.length).toBe(1);

    act(() => {
      result.current.resetChat();
    });

    expect(result.current.state.conversationId).toBeNull();
    expect(result.current.state.messages).toEqual([]);
    expect(result.current.state.currentAgent).toBeNull();
    expect(result.current.state.workflowStatus).toBe('ACTIVE');
  });

  it('wipes previous state and sets error when loadConversation fails (e.g. 403 Forbidden)', async () => {
    vi.mocked(apiClient.fetchMessages).mockRejectedValueOnce(
      new Error('Forbidden: ownership mismatch')
    );

    const { result } = renderHook(() => useChat('user-1', 'forbidden-conv'));

    await act(async () => {
      // await loadConversation
    });

    expect(result.current.state.conversationId).toBeNull();
    expect(result.current.state.messages).toEqual([]);
    expect(result.current.state.error).toBe('Forbidden: ownership mismatch');
    expect(result.current.state.workflowStatus).toBe('FAILED');
  });
});


