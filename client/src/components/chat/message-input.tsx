'use client';

// src/components/chat/message-input.tsx
// Phase 17 Step 5a: Message input bar with lock guards and auto-resize.

import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { WorkflowStatus } from '../../types/api';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  workflowStatus?: WorkflowStatus | null;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  isStreaming = false,
  workflowStatus,
  placeholder,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="border-t border-slate-200 bg-white p-3 md:p-4">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLocked}
          placeholder={activePlaceholder}
          rows={1}
          aria-label="Message input"
          className="flex-1 resize-none overflow-y-auto rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
          style={{ maxHeight: '160px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isLocked || !content.trim()}
          aria-label="Send message"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {isEscalated && (
        <p className="text-center text-xs text-amber-700 mt-2 font-medium">
          🔒 This session has been transferred to human support. Customer input is closed.
        </p>
      )}
    </div>
  );
}
