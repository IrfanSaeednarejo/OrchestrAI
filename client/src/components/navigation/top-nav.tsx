'use client';

// src/components/navigation/top-nav.tsx
// Phase 18 Step 3: Global top navigation header.
// Phase 22 Step 2: Added Store, My Orders, active user profile, and Sign Out.
// Phase 30 Step 2: Redesigned to Midnight Burgundy / Imperial Crimson design system.

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Activity, ShoppingBag, Package, LogOut, LogIn, User, Menu } from 'lucide-react';
import { useAuth } from '../../context/auth-context';

interface TopNavProps {
  className?: string;
  onMenuToggle?: () => void;
}

export function TopNav({ className = '', onMenuToggle }: TopNavProps) {
  const pathname = usePathname();
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    authContext = useAuth();
  } catch {
    // Fallback if rendered outside AuthProvider
  }

  const isChat = pathname === '/';
  const isStore = pathname?.startsWith('/store');
  const isOrders = pathname?.startsWith('/orders');
  const isOps = pathname?.startsWith('/ops');

  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const authUser = authContext?.user;

  return (
    <header
      data-testid="top-nav"
      className={`h-14 border-b border-edge-subtle bg-surface-sidebar text-content-primary flex items-center justify-between px-4 md:px-6 shrink-0 ${className}`}
    >
      {/* Left: Brand + Mobile Menu + Nav Links */}
      <div className="flex items-center gap-3 md:gap-5">
        {/* Mobile menu toggle — visible below lg */}
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            data-testid="mobile-menu-toggle"
            aria-label="Toggle sidebar"
            className="lg:hidden inline-flex items-center justify-center p-1.5 rounded-control text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-content-primary tracking-tight hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 rounded-lg bg-brand-primary flex items-center justify-center text-white shadow-sm">
            <span className="text-xs font-bold">O</span>
          </div>
          <span className="text-sm md:text-base font-semibold tracking-tight">OrchestrAI</span>
        </Link>

        {/* Primary mode tabs */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            data-testid="nav-chat-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium transition-colors ${
              isChat
                ? 'bg-surface-hover text-content-primary shadow-sm'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-hover/50'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Support Chat</span>
          </Link>

          <Link
            href="/store"
            data-testid="nav-store-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium transition-colors ${
              isStore
                ? 'bg-surface-hover text-content-primary shadow-sm'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-hover/50'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Store</span>
          </Link>

          <Link
            href="/orders"
            data-testid="nav-orders-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium transition-colors ${
              isOrders
                ? 'bg-surface-hover text-content-primary shadow-sm'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-hover/50'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">My Orders</span>
          </Link>

          <Link
            href="/ops"
            data-testid="nav-ops-link"
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium transition-colors ${
              isOps
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-hover/50'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Platform Ops</span>
          </Link>
        </nav>
      </div>

      {/* Right side: Authenticated User Pill / Sign In button */}
      <div className="flex items-center gap-2">
        {isAuthenticated && authUser ? (
          <div className="flex items-center gap-2 bg-surface-elevated border border-edge-subtle rounded-lg px-2.5 py-1">
            <div className="w-5 h-5 rounded-full bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-brand-link">
              <User className="h-3 w-3" />
            </div>
            <span
              data-testid="nav-user-email"
              className="text-xs text-content-secondary font-medium max-w-[140px] truncate"
            >
              {authUser.name || authUser.email}
            </span>
            <button
              type="button"
              onClick={() => authContext?.logout()}
              data-testid="nav-logout-btn"
              title="Sign Out"
              className="text-content-muted hover:text-status-error transition-colors ml-1"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            data-testid="nav-login-link"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-primary hover:bg-brand-hover text-white transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign In</span>
          </Link>
        )}
      </div>
    </header>
  );
}
