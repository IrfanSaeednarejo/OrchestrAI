// src/components/sidebar/conversation-sidebar.tsx
// Phase 17 Step 5b: Conversation sidebar with session switcher and "+ New Chat".
// Phase 22 Step 2: Pure real user accounts — removed demo selector & disclaimer.

import React from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Loader2, Sparkles, ShoppingBag, LogOut, LogIn, User } from 'lucide-react';
import type { Conversation } from '../../types/api';
import { useAuth } from '../../context/auth-context';

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onOpenStore?: () => void;
  onOpenAuth?: () => void;
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
  onOpenStore,
  isLoading = false,
  className = '',
}: ConversationSidebarProps) {
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    authContext = useAuth();
  } catch {
    // Fallback if rendered outside AuthProvider
  }

  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const authUser = authContext?.user;

  return (
    <aside
      data-testid="conversation-sidebar"
      className={`flex flex-col h-full bg-slate-900 text-slate-100 border-r border-slate-800 ${className}`}
    >
      {/* Header: Title & Action Buttons */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white tracking-tight text-base">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <span>Support Chat</span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Active
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNewChat}
            data-testid="new-chat-button"
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </button>

          {onOpenStore ? (
            <button
              type="button"
              onClick={onOpenStore}
              data-testid="sidebar-store-button"
              title="Open Storefront"
              className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/store"
              data-testid="sidebar-store-button"
              title="Open Storefront"
              className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
            </Link>
          )}
        </div>
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

      {/* Footer: User Identity Account Card */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80">
        {isAuthenticated && authUser ? (
          <div
            data-testid="sidebar-user-card"
            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{authUser.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{authUser.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => authContext?.logout()}
              data-testid="sidebar-signout-btn"
              title="Sign Out"
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            data-testid="sidebar-signin-btn"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            <LogIn className="h-4 w-4 text-indigo-400" />
            <span>Sign In / Register</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
