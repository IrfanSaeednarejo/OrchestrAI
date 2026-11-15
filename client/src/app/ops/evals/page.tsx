'use client';

// src/app/ops/evals/page.tsx
// Phase 18 Step 6: Platform/Ops Evaluation Benchmark Dashboard page.

import React, { useState, useEffect, useCallback } from 'react';
import { fetchOpsEvalResults } from '../../../lib/ops-client';
import type { BenchmarkReport } from '../../../types/ops';
import { EvalScorecard } from '../../../components/ops/eval-scorecard';
import { RefreshCw, ShieldAlert, Award } from 'lucide-react';

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
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Evaluation Benchmark Dashboard
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Quality assurance scorecard verifying stateful routing, domain tool selection, and specialist scope.
          </p>
        </div>

        <button
          type="button"
          onClick={loadBenchmark}
          disabled={isLoading}
          data-testid="refresh-evals-button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Running Benchmark...' : 'Re-Run Benchmark'}</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div
          data-testid="evals-error-banner"
          className="bg-rose-950/60 border border-rose-800 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2"
        >
          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          <span>Error loading evaluation benchmark: {error}</span>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && !report && (
        <div className="py-16 text-center text-slate-400 space-y-3">
          <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center mx-auto text-indigo-400 animate-spin">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-slate-300">
            Executing 30-Scenario Canonical Benchmark...
          </div>
          <div className="text-xs text-slate-500 max-w-sm mx-auto">
            Evaluating 8 deterministic binary metrics across order tracking, payments, refunds, returns, and safety.
          </div>
        </div>
      )}

      {/* Scorecard Component */}
      {report && <EvalScorecard report={report} />}
    </div>
  );
}

