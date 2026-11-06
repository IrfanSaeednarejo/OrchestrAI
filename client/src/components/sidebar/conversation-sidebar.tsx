// src/components/sidebar/conversation-sidebar.tsx
// Phase 17 Step 5b: Conversation sidebar with session switcher, "+ New Chat", and demo identity selector.

import React from 'react';
import { Plus, MessageSquare, User, Loader2, Sparkles } from 'lucide-react';
import type { Conversation } from '../../types/api';
import { useUser } from '../../context/user-context';

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  isLoading?: boolean;
  className?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  isLoading = false,
  className = '',
}: ConversationSidebarProps) {
  const { currentUser, users, switchUser } = useUser();

  return (
    <aside
      data-testid="conversation-sidebar"
      className={`flex flex-col h-full bg-slate-900 text-slate-100 border-r border-slate-800 ${className}`}
    >
      {/* Header: Title & New Chat */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white tracking-tight text-base">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <span>OrchestrAI</span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Support
          </span>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          data-testid="new-chat-button"
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Conversations
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            <span>Loading chats...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No active conversations. Start a new chat above.
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = conv.id === selectedId;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv.id)}
                data-testid={`conversation-item-${conv.id}`}
                className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-slate-800 text-white font-medium border border-slate-700'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium">
                    Chat {conv.id.substring(0, 8)}...
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                    <span className="capitalize">{conv.status}</span>
                    <span>{formatRelativeTime(conv.updatedAt || conv.createdAt)}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer: Demo Identity Switcher */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            Demo identity, not authentication
          </span>
        </div>

        <div className="relative">
          <label htmlFor="demo-user-selector" className="sr-only">
            Select Demo Identity
          </label>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200">
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            <select
              id="demo-user-selector"
              data-testid="demo-user-select"
              value={currentUser.id}
              onChange={(e) => switchUser(e.target.value)}
              className="bg-transparent text-slate-100 w-full focus:outline-none cursor-pointer text-xs"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">
                  {u.name} ({u.scenario})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 truncate">
          Active: <span className="text-slate-300 font-medium">{currentUser.email}</span>
        </div>
      </div>
    </aside>
  );
}
