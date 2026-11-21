'use client';

// src/components/chat/message-input.tsx
// Phase 17 Step 5a: Message input bar with lock guards and auto-resize.
// Phase 30 Step 5: Dark theme redesign — inset input, Crimson send button.
//   All aria-labels, data-testids, lock logic, and keyboard handling preserved.

import React, { useState, useRef, useEffect } from 'react';
import { Send, Lock } from 'lucide-react';
import type { WorkflowStatus } from '../../types/api';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  workflowStatus?: WorkflowStatus | null;
  placeholder?: string;
  initialValue?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  isStreaming = false,
  workflowStatus,
  placeholder,
  initialValue = '',
}: MessageInputProps) {
  const [content, setContent] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialValue) {
      setContent(initialValue);
    }
  }, [initialValue]);

  const isEscalated = workflowStatus === 'ESCALATED';
  const isLocked = disabled || isStreaming || isEscalated;

  const defaultPlaceholder = isEscalated
    ? 'Conversation escalated to human agent'
    : isStreaming
    ? 'Agent is thinking...'
    : 'Type your message... (Enter to send, Shift+Enter for new line)';

  const activePlaceholder = placeholder || defaultPlaceholder;

  // Auto-resize textarea height based on scrollHeight
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [content]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || isLocked) return;

    onSend(trimmed);
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-edge-subtle bg-surface-canvas px-4 py-3 md:px-6 md:py-4">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLocked}
          placeholder={activePlaceholder}
          rows={1}
          aria-label="Message input"
          data-testid="message-input"
          className="flex-1 resize-none overflow-y-auto rounded-control border border-edge-subtle bg-surface-inset px-3.5 py-2.5 text-sm text-content-primary placeholder-content-disabled shadow-sm focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-brand-focus disabled:bg-surface disabled:text-content-disabled disabled:cursor-not-allowed transition-colors"
          style={{ maxHeight: '160px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isLocked || !content.trim()}
          aria-label="Send message"
          data-testid="send-button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-primary text-white shadow-sm hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand-focus focus:ring-offset-1 focus:ring-offset-surface-canvas disabled:bg-surface disabled:text-content-disabled disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {isEscalated && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-content-muted mt-2 font-medium">
          <Lock className="h-3 w-3" />
          <span>This session has been transferred to human support. Customer input is closed.</span>
        </p>
      )}
    </div>
  );
}
