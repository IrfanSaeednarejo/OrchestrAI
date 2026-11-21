'use client';

// src/app/ops/evals/page.tsx
// Phase 34: Platform/Ops Evaluation Benchmark Dashboard page with Midnight Burgundy theme.

import React, { useState, useEffect, useCallback } from 'react';
import { fetchOpsEvalResults } from '../../../lib/ops-client';
import type { BenchmarkReport } from '../../../types/ops';
import { EvalScorecard } from '../../../components/ops/eval-scorecard';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export default function OpsEvalsPage() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBenchmark = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOpsEvalResults();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch evaluation report');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBenchmark();
  }, [loadBenchmark]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto" data-testid="ops-evals-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-content-primary tracking-tight">
              Evaluation Benchmark Dashboard
            </h1>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-surface-inset text-content-muted border border-edge-subtle">
              QA Suite
            </span>
          </div>
          <p className="text-xs md:text-sm text-content-muted mt-1">
            Quality assurance scorecard verifying stateful routing, domain tool selection, and specialist scope.
          </p>
        </div>

        <button
          type="button"
          onClick={loadBenchmark}
          disabled={isLoading}
          data-testid="refresh-evals-button"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Running Benchmark...' : 'Re-Run Benchmark'}</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div
          data-testid="evals-error-banner"
          className="bg-rose-950/40 border border-status-error/40 text-status-error px-4 py-3 rounded-xl text-xs flex items-center gap-2.5 shadow-xs"
        >
          <ShieldAlert className="h-4 w-4 text-status-error shrink-0" />
          <span>Error loading evaluation benchmark: {error}</span>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && !report && (
        <div className="py-16 text-center text-content-muted space-y-3">
          <div className="w-10 h-10 rounded-full bg-surface-inset border border-brand-primary flex items-center justify-center mx-auto text-brand-link animate-spin shadow-xs">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold text-content-primary">
            Executing 30-Scenario Canonical Benchmark...
          </div>
          <div className="text-xs text-content-muted max-w-sm mx-auto">
            Evaluating 8 deterministic binary metrics across order tracking, payments, refunds, returns, and safety.
          </div>
        </div>
      )}

      {/* Scorecard Component */}
      {report && <EvalScorecard report={report} />}
    </div>
  );
}
