'use client';

// src/components/ops/trace-timeline.tsx
// Phase 34: Chronological trace execution timeline with Midnight Burgundy theme.

import React from 'react';
import type { OpsTimelineEvent, OpsRoutingEvent, OpsAgentEvent } from '../../types/ops';
import { ToolExecutionCard } from './tool-execution-card';
import {
  Compass,
  Bot,
  Clock,
  ArrowRight,
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
        className="p-8 text-center text-content-muted bg-surface-inset border border-edge-subtle rounded-xl text-sm font-sans"
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
        className="relative pl-6 pb-6 border-l-2 border-edge-subtle last:border-l-0"
      >
        {/* Node indicator */}
        <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-surface-inset border border-brand-link flex items-center justify-center text-brand-link shadow-xs">
          <Compass className="h-3.5 w-3.5" />
        </div>

        {/* Content Card */}
        <div className="bg-surface-inset/70 border border-edge-subtle rounded-xl p-4 space-y-2.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface text-content-muted border border-edge-subtle">
                Routing Decision
              </span>
              <span
                data-testid="decision-type-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider ${
                  isEscalation
                    ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                    : isFallback
                    ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                    : 'bg-surface text-brand-link border border-edge-subtle'
                }`}
              >
                {event.decisionType}
              </span>
            </div>

            <span className="text-[11px] font-mono text-content-muted">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Route path */}
          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
            <span className="text-content-muted font-mono">
              {event.sourceAgent || 'supervisor_router'}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-brand-link" />
            <span className="text-brand-link font-mono font-bold">
              {event.destinationAgent}
            </span>
          </div>

          {/* Intent */}
          {event.intent && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface text-[11px] font-mono text-content-secondary border border-edge-subtle">
              <span className="text-content-muted">Intent:</span>
              <span className="text-brand-link font-medium">{event.intent}</span>
            </div>
          )}

          {/* Rationale reason */}
          <p className="text-xs text-content-muted bg-surface/80 p-2.5 rounded-lg border border-edge-subtle/80 leading-relaxed">
            <span className="font-semibold text-content-primary">Rationale: </span>
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
        className="relative pl-6 pb-6 border-l-2 border-edge-subtle last:border-l-0"
      >
        {/* Node indicator */}
        <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-surface-inset border border-brand-primary flex items-center justify-center text-brand-link shadow-xs">
          <Bot className="h-3.5 w-3.5" />
        </div>

        {/* Content Card */}
        <div className="bg-surface-inset/70 border border-edge-subtle rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface text-content-muted border border-edge-subtle">
                Agent Execution
              </span>
              <span className="text-xs font-mono font-bold text-content-primary">
                {event.agent}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {event.duration !== null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-content-muted">
                  <Clock className="h-3 w-3 text-content-muted/70" />
                  <span>{event.duration}ms</span>
                </span>
              )}
              <span
                data-testid="agent-status-badge"
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                  isFailure
                    ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                    : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                }`}
              >
                {event.status}
              </span>
            </div>
          </div>

          {/* Tools executed */}
          {hasTools ? (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-content-muted uppercase tracking-wider flex items-center gap-1 font-mono">
                <span>Tools Invoked ({event.tools.length})</span>
              </div>
              <div className="space-y-1.5">
                {event.tools.map((tool, tIdx) => (
                  <ToolExecutionCard key={`tool-${tIdx}`} tool={tool} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-content-muted italic">
              No tools invoked during this turn.
            </div>
          )}

          {event.error && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-status-error/40 text-status-error text-xs">
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
