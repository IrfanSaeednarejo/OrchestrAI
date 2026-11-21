// src/components/sidebar/conversation-sidebar.tsx
// Phase 17 Step 5b: Conversation sidebar with session switcher and "+ New Chat".
// Phase 22 Step 2: Pure real user accounts — removed demo selector & disclaimer.
// Phase 30 Step 3: Midnight Burgundy design system + mobile off-canvas drawer.

import React from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Loader2, ShoppingBag, LogOut, LogIn, User, X } from 'lucide-react';
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
  /** Mobile drawer mode: when true, sidebar renders as a fixed overlay */
  isMobileOpen?: boolean;
  /** Close the mobile drawer */
  onMobileClose?: () => void;
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

function SidebarContent({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  onOpenStore,
  isLoading = false,
  onMobileClose,
}: Omit<ConversationSidebarProps, 'className' | 'isMobileOpen' | 'onOpenAuth'> & { onMobileClose?: () => void }) {
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
    <>
      {/* Header: Title & Action Buttons */}
      <div className="p-4 border-b border-edge-subtle space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-content-primary tracking-tight text-base">
            <div className="w-5 h-5 rounded bg-brand-primary/20 flex items-center justify-center">
              <MessageSquare className="h-3 w-3 text-brand-link" />
            </div>
            <span>Conversations</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-brand-deep text-brand-link border border-brand-mid rounded px-1.5 py-0.5">
              Active
            </span>
            {/* Mobile close button */}
            {onMobileClose && (
              <button
                type="button"
                onClick={onMobileClose}
                data-testid="sidebar-close-btn"
                aria-label="Close sidebar"
                className="lg:hidden p-1 rounded-control text-content-muted hover:text-content-primary hover:bg-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNewChat}
            data-testid="new-chat-button"
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-focus focus:ring-offset-2 focus:ring-offset-surface-sidebar"
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
              className="flex items-center justify-center p-2 rounded-control bg-surface-elevated hover:bg-surface-hover text-brand-link border border-edge-subtle transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/store"
              data-testid="sidebar-store-button"
              title="Open Storefront"
              className="flex items-center justify-center p-2 rounded-control bg-surface-elevated hover:bg-surface-hover text-brand-link border border-edge-subtle transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div className="px-2 pb-1 text-[11px] font-semibold text-content-muted uppercase tracking-wider">
          Recent
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-content-muted text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand-link" />
            <span>Loading chats...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-content-disabled">
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
                className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-control text-sm transition-colors ${
                  isSelected
                    ? 'bg-surface-hover text-content-primary font-medium border border-edge-subtle'
                    : 'text-content-secondary hover:bg-surface-hover/60 hover:text-content-primary'
                }`}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-content-muted" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium">
                    Chat {conv.id.substring(0, 8)}...
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-content-muted mt-0.5">
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
      <div className="p-3 border-t border-edge-subtle bg-surface-inset">
        {isAuthenticated && authUser ? (
          <div
            data-testid="sidebar-user-card"
            className="p-2.5 rounded-control bg-surface-sidebar border border-edge-subtle flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 rounded-full bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center text-brand-link shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-content-primary truncate">{authUser.name}</div>
                <div className="text-[11px] text-content-muted truncate">{authUser.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => authContext?.logout()}
              data-testid="sidebar-signout-btn"
              title="Sign Out"
              className="p-1.5 rounded-control text-content-muted hover:text-status-error hover:bg-surface-hover transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            data-testid="sidebar-signin-btn"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-control bg-surface-elevated hover:bg-surface-hover text-content-secondary text-xs font-medium border border-edge-subtle transition-colors"
          >
            <LogIn className="h-4 w-4 text-brand-link" />
            <span>Sign In / Register</span>
          </Link>
        )}
      </div>
    </>
  );
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  onOpenStore,
  isLoading = false,
  className = '',
  isMobileOpen = false,
  onMobileClose,
}: ConversationSidebarProps) {
  return (
    <>
      {/* Desktop sidebar — hidden below lg */}
      <aside
        data-testid="conversation-sidebar"
        className={`hidden lg:flex flex-col h-full bg-surface-sidebar text-content-primary border-r border-edge-subtle ${className}`}
      >
        <SidebarContent
          conversations={conversations}
          selectedId={selectedId}
          onSelect={onSelect}
          onNewChat={onNewChat}
          onOpenStore={onOpenStore}
          isLoading={isLoading}
        />
      </aside>

      {/* Mobile drawer — visible below lg when open */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex" data-testid="mobile-sidebar-overlay">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside
            className="relative flex flex-col w-80 max-w-[85vw] h-full bg-surface-sidebar text-content-primary border-r border-edge-subtle shadow-2xl z-50"
          >
            <SidebarContent
              conversations={conversations}
              selectedId={selectedId}
              onSelect={(id) => {
                onSelect(id);
                onMobileClose?.();
              }}
              onNewChat={() => {
                onNewChat();
                onMobileClose?.();
              }}
              onOpenStore={onOpenStore}
              isLoading={isLoading}
              onMobileClose={onMobileClose}
            />
          </aside>
        </div>
      )}
    </>
  );
}
