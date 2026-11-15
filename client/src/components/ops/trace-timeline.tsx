'use client';

// src/components/ops/trace-timeline.tsx
// Phase 18 Step 5: Chronological trace execution timeline.

import React from 'react';
import type { OpsTimelineEvent, OpsRoutingEvent, OpsAgentEvent } from '../../types/ops';
import { ToolExecutionCard } from './tool-execution-card';
import {
  Compass,
  Bot,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

interface TraceTimelineProps {
  timeline: OpsTimelineEvent[];
  className?: string;
}

export function TraceTimeline({ timeline, className = '' }: TraceTimelineProps) {
  if (!timeline || timeline.length === 0) {
    return (
      <div
        data-testid="empty-timeline"
        className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-lg text-sm"
      >
        No trace events recorded for this conversation yet.
      </div>
    );
  }

  function renderRoutingCard(event: OpsRoutingEvent, index: number) {
    const isEscalation = event.decisionType === 'ESCALATION';
    const isFallback = event.decisionType === 'FALLBACK';

    return (
      <div
        key={`routing-${index}`}
        data-testid={`timeline-routing-event-${index}`}
        className="relative pl-6 pb-6 border-l-2 border-purple-900/60 last:border-l-0"
      >
        {/* Node indicator */}
        <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-purple-950 border border-purple-500 flex items-center justify-center text-purple-400 shadow-sm">
          <Compass className="h-3.5 w-3.5" />
        </div>

        {/* Content Card */}
        <div className="bg-slate-900 border border-purple-900/50 rounded-lg p-4 space-y-2.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-950 text-purple-300 border border-purple-800">
                Routing Decision
              </span>
              <span
                data-testid="decision-type-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider ${
                  isEscalation
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : isFallback
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                }`}
              >
                {event.decisionType}
              </span>
            </div>

            <span className="text-[11px] font-mono text-slate-500">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Route path */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <span className="text-slate-400 font-mono">
              {event.sourceAgent || 'supervisor_router'}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-purple-300 font-mono font-bold">
              {event.destinationAgent}
            </span>
          </div>

          {/* Intent */}
          {event.intent && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 text-[11px] font-mono text-slate-300 border border-slate-800">
              <span className="text-slate-500">Intent:</span>
              <span className="text-purple-300 font-medium">{event.intent}</span>
            </div>
          )}

          {/* Rationale reason */}
          <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
            <span className="font-semibold text-slate-300">Rationale: </span>
            {event.reason}
          </p>
        </div>
      </div>
    );
  }

  function renderAgentCard(event: OpsAgentEvent, index: number) {
    const isFailure = event.status === 'failure';
    const hasTools = event.tools && event.tools.length > 0;

    return (
      <div
        key={`agent-${index}`}
        data-testid={`timeline-agent-event-${index}`}
        className="relative pl-6 pb-6 border-l-2 border-indigo-900/60 last:border-l-0"
      >
        {/* Node indicator */}
        <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-indigo-950 border border-indigo-500 flex items-center justify-center text-indigo-400 shadow-sm">
          <Bot className="h-3.5 w-3.5" />
        </div>

        {/* Content Card */}
        <div className="bg-slate-900 border border-indigo-900/50 rounded-lg p-4 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-950 text-indigo-300 border border-indigo-800">
                Agent Execution
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {event.agent}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {event.duration !== null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  <Clock className="h-3 w-3 text-slate-500" />
                  <span>{event.duration}ms</span>
                </span>
              )}
              <span
                data-testid="agent-status-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                  isFailure
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {event.status}
              </span>
            </div>
          </div>

          {/* Tools executed */}
          {hasTools ? (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <span>Tools Invoked ({event.tools.length})</span>
              </div>
              <div className="space-y-1.5">
                {event.tools.map((tool, tIdx) => (
                  <ToolExecutionCard key={`tool-${tIdx}`} tool={tool} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 italic">
              No tools invoked during this turn.
            </div>
          )}

          {event.error && (
            <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs">
              <span className="font-semibold">Error: </span>
              {event.error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-0 ${className}`} data-testid="trace-timeline">
      {timeline.map((event, index) => {
        if (event.type === 'routing') {
          return renderRoutingCard(event, index);
        }
        return renderAgentCard(event, index);
      })}
    </div>
  );
}

