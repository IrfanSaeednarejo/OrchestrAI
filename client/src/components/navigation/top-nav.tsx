'use client';

// src/components/navigation/top-nav.tsx
// Phase 18 Step 3: Global top navigation header.
// Phase 22 Step 2: Added Store, My Orders, active user profile, and Sign Out.

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, MessageSquare, Activity, ShoppingBag, Package, LogOut, LogIn, User } from 'lucide-react';
import { useAuth } from '../../context/auth-context';

interface TopNavProps {
  className?: string;
}

export function TopNav({ className = '' }: TopNavProps) {
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
      className={`h-14 border-b border-slate-800 bg-slate-900 text-slate-100 flex items-center justify-between px-4 md:px-6 shrink-0 ${className}`}
    >
      {/* Brand logo & Primary Navigation Links */}
      <div className="flex items-center gap-4 md:gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-white tracking-tight hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm md:text-base font-semibold tracking-tight">OrchestrAI</span>
        </Link>

        {/* Primary mode tabs */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            data-testid="nav-chat-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isChat
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Support Chat</span>
          </Link>

          <Link
            href="/store"
            data-testid="nav-store-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isStore
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Store</span>
          </Link>

          <Link
            href="/orders"
            data-testid="nav-orders-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isOrders
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>My Orders</span>
          </Link>

          <Link
            href="/ops"
            data-testid="nav-ops-link"
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isOps
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
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
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <User className="h-3 w-3" />
            </div>
            <span
              data-testid="nav-user-email"
              className="text-xs text-slate-200 font-medium max-w-[140px] truncate"
            >
              {authUser.name || authUser.email}
            </span>
            <button
              type="button"
              onClick={() => authContext?.logout()}
              data-testid="nav-logout-btn"
              title="Sign Out"
              className="text-slate-400 hover:text-rose-400 transition-colors ml-1"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            data-testid="nav-login-link"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign In</span>
          </Link>
        )}
      </div>
    </header>
  );
}
