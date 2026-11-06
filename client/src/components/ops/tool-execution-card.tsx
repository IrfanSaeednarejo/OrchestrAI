'use client';

// src/components/ops/tool-execution-card.tsx
// Phase 18 Step 5: Collapsible tool execution card with duration and error telemetry.

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
      className={`rounded-md border bg-slate-950/60 transition-colors ${
        isSuccess ? 'border-emerald-900/60' : 'border-rose-900/60'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-900/50 transition-colors rounded-md"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="font-mono text-xs font-semibold text-slate-200 truncate">
            {tool.tool}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Duration */}
          {tool.duration !== null && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <Clock className="h-3 w-3 text-slate-500" />
              <span>{tool.duration}ms</span>
            </span>
          )}

          {/* Status badge */}
          {isSuccess ? (
            <span
              data-testid="tool-status-success"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800"
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
              <span>success</span>
            </span>
          ) : (
            <span
              data-testid="tool-status-failure"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800"
            >
              <XCircle className="h-2.5 w-2.5 text-rose-400" />
              <span>failure</span>
            </span>
          )}

          {/* Expand toggle */}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isOpen && (
        <div className="px-3 pb-2.5 pt-1 border-t border-slate-800/80 text-xs text-slate-400 space-y-1.5 font-mono">
          <div className="text-[11px]">
            <span className="text-slate-500">Timestamp: </span>
            <span>{new Date(tool.timestamp).toLocaleTimeString()}</span>
          </div>

          {tool.error && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-sans">
              <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[11px] uppercase tracking-wider text-rose-400">
                  Execution Error
                </div>
                <div>{tool.error}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

