'use client';

// src/components/navigation/top-nav.tsx
// Phase 18 Step 3: Global top navigation header for switching between Chat and Ops.

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, MessageSquare, Activity, ShieldCheck } from 'lucide-react';

interface TopNavProps {
  className?: string;
}

export function TopNav({ className = '' }: TopNavProps) {
  const pathname = usePathname();

  const isOps = pathname?.startsWith('/ops');
  const isChat = !isOps;

  return (
    <header
      data-testid="top-nav"
      className={`h-14 border-b border-slate-800 bg-slate-900 text-slate-100 flex items-center justify-between px-4 md:px-6 shrink-0 ${className}`}
    >
      {/* Brand logo */}
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-white tracking-tight hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm md:text-base font-semibold">OrchestrAI</span>
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
            <span>Customer Chat</span>
          </Link>

          <Link
            href="/ops"
            data-testid="nav-ops-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
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

      {/* Right side: dev badge */}
      <div className="flex items-center gap-2">
        <span
          data-testid="ops-mode-badge"
          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-950 text-indigo-300 border border-indigo-800"
        >
          <ShieldCheck className="h-3 w-3 text-indigo-400" />
          <span>Observability Console</span>
        </span>
      </div>
    </header>
  );
}

