'use client';

// src/app/ops/layout.tsx
// Phase 18 Step 3: Shared Ops layout with top-nav and ops sub-navigation.

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TopNav } from '../../components/navigation/top-nav';
import { Table, Award } from 'lucide-react';

export default function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isEvals = pathname?.startsWith('/ops/evals');
  const isConversations = !isEvals;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Global Top Nav */}
      <TopNav />

      {/* Sub-header navigation for Ops */}
      <div
        data-testid="ops-subnav"
        className="h-12 border-b border-slate-800 bg-slate-950 px-6 flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-1">
          <Link
            href="/ops"
            data-testid="subnav-conversations-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isConversations
                ? 'bg-slate-800 text-indigo-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="h-3.5 w-3.5" />
            <span>Conversations</span>
          </Link>

          <Link
            href="/ops/evals"
            data-testid="subnav-evals-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isEvals
                ? 'bg-slate-800 text-indigo-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            <span>Evaluation Benchmark</span>
          </Link>
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          System Environment: <span className="text-emerald-400">Dev / Local</span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto bg-slate-950">
        {children}
      </main>
    </div>
  );
}
