'use client';

// src/components/ops/tool-execution-card.tsx
// Phase 34: Collapsible tool execution card with duration and error telemetry in Midnight Burgundy theme.

import React, { useState } from 'react';
import type { OpsToolEvent } from '../../types/ops';
import { Wrench, CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock, AlertCircle } from 'lucide-react';

interface ToolExecutionCardProps {
  tool: OpsToolEvent;
  className?: string;
}

export function ToolExecutionCard({ tool, className = '' }: ToolExecutionCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSuccess = tool.status === 'success';

  return (
    <div
      data-testid={`tool-card-${tool.tool}`}
      className={`rounded-lg border bg-surface/90 transition-colors shadow-xs ${
        isSuccess ? 'border-emerald-900/50 hover:border-emerald-800/70' : 'border-rose-900/50 hover:border-rose-800/70'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface-hover/60 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-3.5 w-3.5 text-brand-link shrink-0" />
          <span className="font-mono text-xs font-semibold text-content-primary truncate">
            {tool.tool}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Duration */}
          {tool.duration !== null && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-content-muted">
              <Clock className="h-3 w-3 text-content-muted/70" />
              <span>{tool.duration}ms</span>
            </span>
          )}

          {/* Status badge */}
          {isSuccess ? (
            <span
              data-testid="tool-status-success"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60"
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
              <span>success</span>
            </span>
          ) : (
            <span
              data-testid="tool-status-failure"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60"
            >
              <XCircle className="h-2.5 w-2.5 text-rose-400" />
              <span>failure</span>
            </span>
          )}

          {/* Expand toggle */}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-content-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-content-muted" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isOpen && (
        <div className="px-3 pb-2.5 pt-1.5 border-t border-edge-subtle/80 text-xs text-content-muted space-y-2 font-mono">
          <div className="text-[11px]">
            <span className="text-content-muted/80">Timestamp: </span>
            <span className="text-content-secondary">{new Date(tool.timestamp).toLocaleTimeString()}</span>
          </div>

          {tool.error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-950/40 border border-status-error/40 text-status-error text-xs font-sans">
              <AlertCircle className="h-3.5 w-3.5 text-status-error shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[11px] uppercase tracking-wider text-status-error">
                  Execution Error
                </div>
                <div className="text-content-secondary">{tool.error}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
