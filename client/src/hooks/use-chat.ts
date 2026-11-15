// src/hooks/use-chat.ts
// Phase 17 Step 6a: Pure chat state reducer, useChat hook, and synchronous double-send ref guard.

import { useReducer, useRef, useCallback, useEffect } from 'react';
import type { Message, WorkflowStatus } from '../types/api';
import type { SSERoutingEvent } from '../types/sse';
import {
  streamMessage,
  fetchMessages,
  createConversation,
} from '../lib/api-client';

export interface ChatState {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingText: string;
  currentNode: string | null;
  currentAgent: string | null;
  handoffCount: number;
  workflowStatus: WorkflowStatus;
  blockedBy: string | null;
  currentStep: string | null;
  error: string | null;
}

export type ChatAction =
  | {
      type: 'SET_CONVERSATION';
      payload: {
        conversationId: string;
        messages: Message[];
      };
    }
  | {
      type: 'START_SEND';
      payload: {
        userMessage: Message;
      };
    }
  | {
      type: 'STREAM_NODE';
      payload: {
        node: string;
      };
    }
  | {
      type: 'STREAM_MESSAGE';
      payload: {
        chunk: string;
      };
    }
  | {
      type: 'STREAM_ROUTING';
      payload: SSERoutingEvent;
    }
  | {
      type: 'STREAM_DONE';
      payload?: {
        finalAssistantMessage?: Message;
      };
    }
  | {
      type: 'STREAM_ERROR';
      payload: {
        error: string;
      };
    }
  | {
      type: 'RESET_STATE';
    };

export const initialChatState: ChatState = {
  conversationId: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  currentNode: null,
  currentAgent: null,
  handoffCount: 0,
  workflowStatus: 'ACTIVE',
  blockedBy: null,
  currentStep: null,
  error: null,
};

export function deriveStateFromMessages(messages: Message[]): {
  workflowStatus: WorkflowStatus;
  currentAgent: string | null;
  handoffCount: number;
  blockedBy: string | null;
  currentStep: string | null;
} {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const meta = lastAssistant?.metadata;

  return {
    workflowStatus: meta?.workflowStatus || 'ACTIVE',
    currentAgent: meta?.specialist || null,
    handoffCount: typeof meta?.handoffCount === 'number' ? meta.handoffCount : 0,
    blockedBy: meta?.blockedBy || null,
    currentStep: meta?.currentStep || null,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_CONVERSATION': {
      const derived = deriveStateFromMessages(action.payload.messages);
      return {
        ...state,
        conversationId: action.payload.conversationId,
        messages: action.payload.messages,
        isStreaming: false,
        streamingText: '',
        currentNode: null,
        error: null,
        ...derived,
      };
    }

    case 'START_SEND': {
      return {
        ...state,
        messages: [...state.messages, action.payload.userMessage],
        isStreaming: true,
        streamingText: '',
        currentNode: null,
        error: null,
      };
    }

    case 'STREAM_NODE': {
      return {
        ...state,
        currentNode: action.payload.node,
      };
    }

    case 'STREAM_MESSAGE': {
      return {
        ...state,
        streamingText: state.streamingText + action.payload.chunk,
      };
    }

    case 'STREAM_ROUTING': {
      const { currentAgent, handoffCount, blockedBy, currentStep, workflowStatus } =
        action.payload;
      return {
        ...state,
        currentAgent: currentAgent ?? state.currentAgent,
        handoffCount:
          typeof handoffCount === 'number' ? handoffCount : state.handoffCount,
        blockedBy: blockedBy ?? state.blockedBy,
        currentStep: currentStep ?? state.currentStep,
        workflowStatus: workflowStatus ?? state.workflowStatus,
      };
    }

    case 'STREAM_DONE': {
      const assistantMessage: Message = action.payload?.finalAssistantMessage || {
        id: `assistant-${Date.now()}`,
        conversationId: state.conversationId || '',
        role: 'assistant',
        content: state.streamingText,
        timestamp: new Date().toISOString(),
        metadata: {
          specialist: state.currentAgent,
          workflowStatus: state.workflowStatus,
          handoffCount: state.handoffCount,
          blockedBy: state.blockedBy,
          currentStep: state.currentStep,
        },
      };

      return {
        ...state,
        messages: [...state.messages, assistantMessage],
        isStreaming: false,
        streamingText: '',
        currentNode: null,
      };
    }

    case 'STREAM_ERROR': {
      return {
        ...state,
        isStreaming: false,
        streamingText: '',
        currentNode: null,
        error: action.payload.error,
        workflowStatus: 'FAILED',
      };
    }

    case 'RESET_STATE': {
      return initialChatState;
    }

    default:
      return state;
  }
}

export function useChat(userId: string, initialConversationId: string | null = null) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadConversation = useCallback(
    async (convId: string) => {
      try {
        const msgs = await fetchMessages(convId, userId);
        dispatch({
          type: 'SET_CONVERSATION',
          payload: { conversationId: convId, messages: msgs },
        });
      } catch (err) {
        dispatch({
          type: 'STREAM_ERROR',
          payload: {
            error:
              err instanceof Error ? err.message : 'Failed to load conversation',
          },
        });
      }
    },
    [userId]
  );

  useEffect(() => {
    if (initialConversationId) {
      loadConversation(initialConversationId);
    } else {
      dispatch({ type: 'RESET_STATE' });
    }
  }, [initialConversationId, loadConversation]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Synchronous double-send ref guard: rejects immediate concurrent invocations
      if (
        isSendingRef.current ||
        state.isStreaming ||
        state.workflowStatus === 'ESCALATED'
      ) {
        return;
      }
      isSendingRef.current = true;

      let convId = state.conversationId;

      try {
        // Create conversation if none exists
        if (!convId) {
          const newConv = await createConversation(userId);
          convId = newConv.id;
        }

        const userMsg: Message = {
          id: `user-${Date.now()}`,
          conversationId: convId,
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
        };

        dispatch({ type: 'START_SEND', payload: { userMessage: userMsg } });

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        await streamMessage(
          convId,
          trimmed,
          userId,
          {
            onNode: (data) => {
              dispatch({ type: 'STREAM_NODE', payload: { node: data.node } });
            },
            onMessage: (data) => {
              dispatch({ type: 'STREAM_MESSAGE', payload: { chunk: data.content } });
            },
            onRouting: (routing) => {
              dispatch({ type: 'STREAM_ROUTING', payload: routing });
            },
            onError: (err) => {
              dispatch({ type: 'STREAM_ERROR', payload: { error: err.message } });
            },
            onDone: () => {
              dispatch({ type: 'STREAM_DONE' });
              // Refresh messages to sync server IDs and authoritative state
              if (convId) {
                fetchMessages(convId, userId)
                  .then((msgs) => {
                    dispatch({
                      type: 'SET_CONVERSATION',
                      payload: { conversationId: convId as string, messages: msgs },
                    });
                  })
                  .catch(() => {
                    // Non-fatal if reload fails; optimistic assistant message already present
                  });
              }
            },
          },
          abortController.signal
        );
      } catch (err) {
        dispatch({
          type: 'STREAM_ERROR',
          payload: {
            error: err instanceof Error ? err.message : 'Unknown streaming error',
          },
        });
      } finally {
        isSendingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [state.conversationId, state.isStreaming, state.workflowStatus, userId]
  );

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    state,
    sendMessage,
    loadConversation,
    abortStream,
    isSendingRef,
  };
}

