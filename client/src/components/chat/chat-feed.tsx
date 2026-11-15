// src/components/chat/chat-feed.tsx
// Phase 17 Step 5c: Chat message feed with plain-text user bubbles, OTP masking,
// safe markdown assistant bubbles, live node-progress, and auto-scroll.

import React, { useEffect, useRef } from 'react';
import { Bot, User, Loader2 } from 'lucide-react';
import type { Message } from '../../types/api';
import { MarkdownRenderer } from './markdown-renderer';

interface ChatFeedProps {
  messages: Message[];
  isStreaming?: boolean;
  streamingText?: string;
  currentNode?: string | null;
  className?: string;
}

export function ChatFeed({
  messages,
  isStreaming = false,
  streamingText = '',
  currentNode = null,
  className = '',
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
      className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50 ${className}`}
    >
      {messages.length === 0 && !isStreaming ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[250px] text-center text-slate-500 space-y-2">
          <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-2">
            <Bot className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-slate-800 text-sm">Welcome to OrchestrAI Support</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Ask about your order status, request a return or refund, update payment methods, or verify your account.
          </p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isOtpMasked = isUser && shouldMaskOtp(index);
          const displayContent = isOtpMasked ? '••••••' : msg.content;

          return (
            <div
              key={msg.id || `msg-${index}`}
              data-testid={`message-${msg.role}-${index}`}
              className={`flex items-start gap-3 ${
                isUser ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium shadow-sm ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-200 text-indigo-600'
                }`}
              >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-all ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-sm font-sans whitespace-pre-wrap break-words'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                }`}
              >
                {isUser ? (
                  <span
                    data-testid={`user-message-text-${index}`}
                    title={isOtpMasked ? 'Code hidden for security' : undefined}
                    className={isOtpMasked ? 'font-mono tracking-widest text-base' : ''}
                  >
                    {displayContent}
                  </span>
                ) : (
                  <MarkdownRenderer content={msg.content} />
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
          className="flex items-start gap-3 flex-row"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white border border-slate-200 text-indigo-600 shadow-sm">
            <Bot className="h-4 w-4" />
          </div>

          <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm bg-white border border-slate-200 text-slate-800 shadow-sm space-y-2">
            {/* Live Node Progress Pill */}
            {currentNode && (
              <div
                data-testid="node-progress-indicator"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse"
              >
                <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                <span>Working: {currentNode.replace(/_/g, ' ')}...</span>
              </div>
            )}

            {/* Content or typing indicator */}
            {streamingText ? (
              <div data-testid="streaming-text">
                <MarkdownRenderer content={streamingText} />
              </div>
            ) : !currentNode ? (
              <div
                data-testid="typing-indicator"
                className="flex items-center gap-1.5 py-1 px-1 text-slate-400"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
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

