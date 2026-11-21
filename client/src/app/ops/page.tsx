'use client';

// src/app/ops/page.tsx
// Phase 34: Platform/Ops Conversation Explorer page with Midnight Burgundy theme.

import React, { useState, useEffect, useCallback } from 'react';
import { fetchOpsConversations } from '../../lib/ops-client';
import type { OpsConversation } from '../../types/ops';
import { ConversationTable } from '../../components/ops/conversation-table';
import { MessageSquare, AlertTriangle, Radio, ShieldAlert } from 'lucide-react';

export default function OpsConversationsPage() {
  const [conversations, setConversations] = useState<OpsConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchOpsConversations(50, 0);
      setConversations(res.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Metrics summary
  const totalCount = conversations.length;
  const activeCount = conversations.filter((c) => c.status === 'active').length;
  const escalatedCount = conversations.filter((c) => c.status === 'escalated').length;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto" data-testid="ops-page">
      {/* Header & Metrics */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-content-primary tracking-tight">
              Conversation Explorer
            </h1>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-surface-inset text-content-muted border border-edge-subtle">
              Live Inspector
            </span>
          </div>
          <p className="text-xs md:text-sm text-content-muted mt-1">
            Real-time inspection of multi-agent orchestration threads, routing decisions, and escalations. Showing up to 50 recent threads.
          </p>
        </div>

        {/* KPI stat cards */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          {/* Total */}
          <div className="flex-1 lg:flex-initial bg-surface border border-edge-subtle rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-surface-inset border border-edge-subtle flex items-center justify-center text-content-muted">
              <MessageSquare className="h-4 w-4 text-brand-link" />
            </div>
            <div>
              <div className="text-[10px] text-content-muted font-medium uppercase tracking-wider">Total</div>
              <div className="text-base font-bold text-content-primary font-mono" data-testid="metric-total">
                {totalCount}
              </div>
            </div>
          </div>

          {/* Active */}
          <div className="flex-1 lg:flex-initial bg-surface border border-edge-subtle rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400">
              <Radio className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-sky-400/90 font-medium uppercase tracking-wider">Active</div>
              <div className="text-base font-bold text-sky-400 font-mono" data-testid="metric-active">
                {activeCount}
              </div>
            </div>
          </div>

          {/* Escalated */}
          <div className="flex-1 lg:flex-initial bg-surface border border-edge-subtle rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-amber-400/90 font-medium uppercase tracking-wider">Escalated</div>
              <div className="text-base font-bold text-amber-400 font-mono" data-testid="metric-escalated">
                {escalatedCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          data-testid="ops-error-banner"
          className="bg-rose-950/40 border border-status-error/40 text-status-error px-4 py-3 rounded-xl text-xs flex items-center gap-2.5 shadow-xs"
        >
          <ShieldAlert className="h-4 w-4 text-status-error shrink-0" />
          <span>Error loading conversations: {error}</span>
        </div>
      )}

      {/* Data Table */}
      <ConversationTable
        conversations={conversations}
        isLoading={isLoading}
        onRefresh={loadData}
      />
    </div>
  );
}
