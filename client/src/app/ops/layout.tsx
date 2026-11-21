'use client';

// src/app/ops/layout.tsx
// Phase 34: Shared Ops layout with top-nav, ops sub-navigation, and Midnight Burgundy theme.

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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface-canvas text-content-primary">
      {/* Global Top Nav */}
      <TopNav />

      {/* Sub-header navigation for Ops */}
      <div
        data-testid="ops-subnav"
        className="h-12 border-b border-edge-subtle bg-surface-sidebar px-6 flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-1.5">
          <Link
            href="/ops"
            data-testid="subnav-conversations-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isConversations
                ? 'bg-surface text-brand-link border border-edge-subtle font-semibold shadow-xs'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-inset border border-transparent'
            }`}
          >
            <Table className="h-3.5 w-3.5" />
            <span>Conversations</span>
          </Link>

          <Link
            href="/ops/evals"
            data-testid="subnav-evals-link"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isEvals
                ? 'bg-surface text-brand-link border border-edge-subtle font-semibold shadow-xs'
                : 'text-content-muted hover:text-content-primary hover:bg-surface-inset border border-transparent'
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            <span>Evaluation Benchmark</span>
          </Link>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-content-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
          <span>
            System Environment:{' '}
            <span className="text-status-success font-semibold">Dev / Local</span>
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto bg-surface-canvas">
        {children}
      </main>
    </div>
  );
}
