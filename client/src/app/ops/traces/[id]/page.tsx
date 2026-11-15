'use client';

// src/app/ops/traces/[id]/page.tsx
// Phase 18 Step 5: Trace & Timeline Inspector page for an individual conversation thread.

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchOpsTrace } from '../../../../lib/ops-client';
import type { OpsTraceResponse } from '../../../../types/ops';
import { TraceTimeline } from '../../../../components/ops/trace-timeline';
import { HandoffBreadcrumbs } from '../../../../components/ops/handoff-breadcrumbs';
import {
  ArrowLeft,
  Activity,
  Layers,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Archive,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

export default function OpsTraceInspectorPage() {
  const params = useParams();
  const rawId = params?.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : (rawId as string);

  const [traceData, setTraceData] = useState<OpsTraceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrace = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOpsTrace(conversationId);
      setTraceData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trace');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadTrace();
  }, [loadTrace]);

  function renderStatusBadge(status: string) {
    switch (status) {
      case 'escalated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800">
            <AlertTriangle className="h-3 w-3 text-rose-400" />
            <span>Escalated</span>
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Archive className="h-3 w-3 text-slate-400" />
            <span>Archived</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span>Active</span>
          </span>
        );
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto" data-testid="trace-inspector-page">
      {/* Navigation & Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/ops"
          data-testid="back-to-conversations-link"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Conversations</span>
        </Link>

        <button
          type="button"
          onClick={loadTrace}
          disabled={isLoading}
          data-testid="refresh-trace-btn"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Trace</span>
        </button>
      </div>

      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
              Execution Trace Inspector
            </div>
            <h1 className="text-base md:text-lg font-mono font-bold text-white break-all">
              {conversationId}
            </h1>
          </div>

          {traceData?.conversation && renderStatusBadge(traceData.conversation.status)}
        </div>

        {/* Metric Badges */}
        {traceData && (
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              <span>{traceData.messageCount} messages</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-slate-500" />
              <span>{traceData.eventCount} trace events</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-slate-500" />
              <span>{traceData.handoffPath.length} routing steps</span>
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div
          data-testid="trace-error-banner"
          className="bg-rose-950/60 border border-rose-800 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2"
        >
          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          <span>Error loading trace: {error}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !traceData && (
        <div className="py-12 text-center text-slate-500 text-sm">
          Loading execution trace and timeline...
        </div>
      )}

      {/* Trajectory & Timeline */}
      {traceData && (
        <div className="space-y-6">
          <HandoffBreadcrumbs handoffPath={traceData.handoffPath} />
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Execution Event Log
            </h2>
            <TraceTimeline timeline={traceData.timeline} />
          </div>
        </div>
      )}
    </div>
  );
}

