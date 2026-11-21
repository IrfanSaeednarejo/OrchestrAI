// src/components/chat/chat-feed.tsx
// Phase 17 Step 5c: Chat message feed with plain-text user bubbles, OTP masking,
// safe markdown assistant bubbles, live node-progress, and auto-scroll.
// Phase 23: Render ServiceOptionBar beneath the last assistant message when options are present.
// Phase 30 Step 4: Dark theme redesign — canvas background, structured message cards,
//   semantic streaming indicators. All data-testids, OTP masking, and streaming logic preserved.

import React, { useEffect, useRef } from 'react';
import { Bot, User, Loader2 } from 'lucide-react';
import type { Message } from '../../types/api';
import type { ServiceOption } from '../../types/api';
import { MarkdownRenderer } from './markdown-renderer';
import { ServiceOptionBar } from './service-option-bar';

interface ChatFeedProps {
  messages: Message[];
  isStreaming?: boolean;
  streamingText?: string;
  currentNode?: string | null;
  currentActivity?: string | null;
  className?: string;
  serviceOptions?: ServiceOption[] | null;
  onOptionSelect?: (message: string) => void;
  isEscalated?: boolean;
}

export function ChatFeed({
  messages,
  isStreaming = false,
  streamingText = '',
  currentNode = null,
  currentActivity = null,
  className = '',
  serviceOptions = null,
  onOptionSelect,
  isEscalated = false,
}: ChatFeedProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or stream updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, currentNode, isStreaming]);

  // Check whether a user message qualifies for cosmetic OTP masking:
  // Must be exactly 6 digits AND the immediately preceding assistant message had non-null blockedBy
  const shouldMaskOtp = (index: number): boolean => {
    const current = messages[index];
    if (current.role !== 'user') return false;
    if (!/^\d{6}$/.test(current.content.trim())) return false;

    // Look backward for the closest assistant message
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const blockedBy = messages[i].metadata?.blockedBy;
        return Boolean(blockedBy);
      }
    }
    return false;
  };

  return (
    <div
      data-testid="chat-feed"
      ref={scrollContainerRef}
      className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-surface-canvas ${className}`}
    >
      {messages.length === 0 && !isStreaming ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-full min-h-[250px] text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-brand-deep border border-brand-mid flex items-center justify-center mb-1">
            <Bot className="h-7 w-7 text-brand-link" />
          </div>
          <h3 className="font-semibold text-content-primary text-sm">Welcome to OrchestrAI Support</h3>
          <p className="text-xs text-content-muted max-w-sm leading-relaxed">
            Ask about your order status, request a return or refund, update payment methods, or verify your account.
          </p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isOtpMasked = isUser && shouldMaskOtp(index);
          const displayContent = isOtpMasked ? '••••••' : msg.content;
          const isLastAssistant =
            !isUser && index === messages.length - 1;

          return (
            <div
              key={msg.id || `msg-${index}`}
              data-testid={`message-${msg.role}-${index}`}
              className={`flex items-end gap-3 ${
                isUser ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
                  isUser
                    ? 'bg-brand-primary text-white'
                    : 'bg-surface-elevated border border-edge-subtle text-brand-link'
                }`}
              >
                {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>

              {/* Message Bubble + optional service options */}
              <div className={`max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-message px-4 py-3 text-sm transition-all ${
                    isUser
                      ? 'bg-brand-deep border border-brand-mid text-content-primary rounded-br-sm font-sans whitespace-pre-wrap break-words'
                      : 'bg-surface border border-edge-subtle text-content-primary rounded-bl-sm'
                  }`}
                >
                  {isUser ? (
                    <span
                      data-testid={`user-message-text-${index}`}
                      title={isOtpMasked ? 'Code hidden for security' : undefined}
                      className={isOtpMasked ? 'font-mono tracking-widest text-base text-content-muted' : ''}
                    >
                      {displayContent}
                    </span>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>

                {/* Interactive service options — only shown after the last assistant message */}
                {isLastAssistant && serviceOptions && serviceOptions.length > 0 && onOptionSelect && (
                  <ServiceOptionBar
                    options={serviceOptions}
                    onSelect={onOptionSelect}
                    isStreaming={isStreaming}
                    isEscalated={isEscalated}
                  />
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Live Streaming Bubble */}
      {isStreaming && (
        <div
          data-testid="streaming-bubble"
          className="flex items-end gap-3 flex-row"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-surface-elevated border border-edge-subtle text-brand-link">
            <Bot className="h-3.5 w-3.5" />
          </div>

          <div className="max-w-[78%] rounded-message rounded-bl-sm px-4 py-3 text-sm bg-surface border border-edge-subtle text-content-primary space-y-2">
            {/* Live Activity Progress Pill */}
            {(currentActivity || currentNode) && (
              <div
                data-testid="node-progress-indicator"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-tag text-xs font-medium bg-status-active-bg text-status-active border border-brand-mid"
                style={{ backgroundColor: 'var(--status-active-bg)' }}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{currentActivity || `Working: ${currentNode?.replace(/_/g, ' ')}...`}</span>
              </div>
            )}

            {/* Content or typing indicator */}
            {streamingText ? (
              <div data-testid="streaming-text">
                <MarkdownRenderer content={streamingText} />
              </div>
            ) : !currentNode && !currentActivity ? (
              <div
                data-testid="typing-indicator"
                className="flex items-center gap-1.5 py-1 px-1 text-content-muted"
              >
                <span className="w-2 h-2 rounded-full bg-content-muted animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-content-muted animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-content-muted animate-bounce"
                  style={{ animationDelay: '0.3s' }}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div ref={bottomRef} data-testid="chat-feed-bottom" />
    </div>
  );
}
