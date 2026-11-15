'use client';

// src/app/ops/page.tsx
// Phase 18 Step 4: Platform/Ops Conversation Explorer page.

import React, { useState, useEffect, useCallback } from 'react';
import { fetchOpsConversations } from '../../lib/ops-client';
import type { OpsConversation } from '../../types/ops';
import { ConversationTable } from '../../components/ops/conversation-table';
import { MessageSquare, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            Conversation Explorer
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Real-time inspection of multi-agent orchestration threads, routing decisions, and escalations.
          </p>
        </div>

        {/* KPI stat cards */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total</div>
              <div className="text-sm font-bold text-white font-mono" data-testid="metric-total">{totalCount}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Active</div>
              <div className="text-sm font-bold text-emerald-400 font-mono" data-testid="metric-active">{activeCount}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-rose-950 border border-rose-800 flex items-center justify-center text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Escalated</div>
              <div className="text-sm font-bold text-rose-400 font-mono" data-testid="metric-escalated">{escalatedCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          data-testid="ops-error-banner"
          className="bg-rose-950/60 border border-rose-800 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2"
        >
          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
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

