'use client';

// src/components/ops/eval-scorecard.tsx
// Phase 34: Evaluation benchmark scorecard dashboard component with Midnight Burgundy theme.

import React, { useState, useMemo } from 'react';
import type { BenchmarkReport } from '../../types/ops';
import {
  Award,
  CheckCircle2,
  XCircle,
  BarChart3,
  Target,
  ListFilter,
  Search,
} from 'lucide-react';

interface EvalScorecardProps {
  report: BenchmarkReport;
  className?: string;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function EvalScorecard({ report, className = '' }: EvalScorecardProps) {
  const [domainFilter, setDomainFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const domains = useMemo(() => {
    return Object.keys(report.byDomain || {});
  }, [report.byDomain]);

  const filteredScenarios = useMemo(() => {
    return (report.scenarioResults || []).filter((item) => {
      if (domainFilter !== 'all' && item.scenario.domain !== domainFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesId = item.scenario.id.toLowerCase().includes(query);
        const matchesName = item.scenario.name.toLowerCase().includes(query);
        const matchesPattern = item.scenario.pattern.toLowerCase().includes(query);
        return matchesId || matchesName || matchesPattern;
      }
      return true;
    });
  }, [report.scenarioResults, domainFilter, searchQuery]);

  const isPerfect = report.passRate >= 1.0;

  return (
    <div className={`space-y-6 ${className}`} data-testid="eval-scorecard">
      {/* Top Banner KPI Card */}
      <div className="bg-surface border border-edge-subtle rounded-xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 max-w-xl z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-surface-inset border border-edge-subtle text-brand-link shadow-xs">
              <Award className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-content-primary tracking-tight">
                30-Scenario Canonical Benchmark
              </h2>
              <p className="text-xs text-content-muted">
                Deterministic binary evaluation across all 6 specialists, 5 routing patterns, and safety guardrails.
              </p>
            </div>
          </div>
        </div>

        {/* Big Pass Rate Display */}
        <div className="flex items-center gap-6 z-10">
          <div className="text-right">
            <div className="text-xs font-semibold text-content-muted uppercase tracking-wider font-mono">
              Overall Pass Rate
            </div>
            <div
              data-testid="overall-pass-rate"
              className={`text-3xl font-extrabold font-mono tracking-tight ${
                isPerfect ? 'text-status-success' : 'text-amber-400'
              }`}
            >
              {formatPercent(report.passRate)}
            </div>
            <div className="text-xs text-content-muted font-mono">
              {report.passedScenarios} of {report.totalScenarios} passed
            </div>
          </div>

          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${
              isPerfect
                ? 'bg-emerald-950/80 border-status-success text-status-success'
                : 'bg-amber-950/80 border-amber-500 text-amber-400'
            }`}
          >
            {isPerfect ? <CheckCircle2 className="h-7 w-7" /> : <BarChart3 className="h-7 w-7" />}
          </div>
        </div>
      </div>

      {/* Grid: Domain Breakdown & Evaluator Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Domain Breakdown */}
        <div className="bg-surface border border-edge-subtle rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-muted uppercase tracking-wider font-mono border-b border-edge-subtle pb-3">
            <BarChart3 className="h-4 w-4 text-brand-link" />
            <span>Domain Performance</span>
          </div>

          <div className="space-y-3">
            {Object.entries(report.byDomain || {}).map(([domain, stats]) => (
              <div key={domain} data-testid={`domain-stat-${domain}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-content-secondary capitalize font-mono">
                    {domain.replace(/_/g, ' ')}
                  </span>
                  <span className="text-content-muted font-mono text-[11px]">
                    {stats.passed}/{stats.total} ({formatPercent(stats.rate)})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-inset border border-edge-subtle/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stats.rate >= 1.0 ? 'bg-status-success' : 'bg-brand-primary'
                    }`}
                    style={{ width: `${Math.round(stats.rate * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evaluator Breakdown */}
        <div className="bg-surface border border-edge-subtle rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-muted uppercase tracking-wider font-mono border-b border-edge-subtle pb-3">
            <Target className="h-4 w-4 text-brand-link" />
            <span>Binary Evaluators (8 Metrics)</span>
          </div>

          <div className="space-y-3">
            {Object.entries(report.byEvaluator || {}).map(([evaluator, stats]) => (
              <div key={evaluator} data-testid={`evaluator-stat-${evaluator}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-content-secondary font-mono text-[11px]">
                    {evaluator}
                  </span>
                  <span className="text-content-muted font-mono text-[11px]">
                    {stats.passed}/{stats.total} ({formatPercent(stats.rate)})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-inset border border-edge-subtle/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      stats.rate >= 1.0 ? 'bg-status-success' : 'bg-brand-link'
                    }`}
                    style={{ width: `${Math.round(stats.rate * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scenario Detail Grid */}
      <div className="bg-surface border border-edge-subtle rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-edge-subtle pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-content-muted uppercase tracking-wider font-mono">
            <ListFilter className="h-4 w-4 text-brand-link" />
            <span>Scenario Results ({filteredScenarios.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-content-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Filter scenarios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="scenario-search-input"
                className="bg-surface-inset border border-edge-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-content-primary placeholder-content-muted/60 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
              />
            </div>

            {/* Domain filter */}
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              data-testid="scenario-domain-filter"
              className="bg-surface-inset border border-edge-subtle rounded-lg px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer"
            >
              <option value="all" className="bg-surface text-content-primary">All Domains</option>
              {domains.map((d) => (
                <option key={d} value={d} className="bg-surface text-content-primary">
                  {d.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table of Scenarios */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-content-secondary" data-testid="scenario-results-table">
            <thead className="text-[11px] font-semibold text-content-muted uppercase tracking-wider border-b border-edge-subtle bg-surface-inset/60">
              <tr>
                <th className="py-2.5 px-3">ID</th>
                <th className="py-2.5 px-3">Scenario Name</th>
                <th className="py-2.5 px-3">Domain</th>
                <th className="py-2.5 px-3">Pattern</th>
                <th className="py-2.5 px-3 text-center">Evaluators</th>
                <th className="py-2.5 px-3 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-subtle/60 font-sans">
              {filteredScenarios.map((item) => (
                <tr
                  key={item.scenario.id}
                  data-testid={`scenario-row-${item.scenario.id}`}
                  className="hover:bg-surface-hover/50 transition-colors"
                >
                  <td className="py-2.5 px-3 font-mono font-semibold text-brand-link">
                    {item.scenario.id}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-content-primary">
                    {item.scenario.name}
                  </td>
                  <td className="py-2.5 px-3 capitalize font-mono text-content-muted">
                    {item.scenario.domain.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-inset border border-edge-subtle text-content-secondary">
                      {item.scenario.pattern}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-content-muted">
                    {item.passingEvaluators}/{item.totalEvaluators}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {item.scenarioPassed ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>PASS</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                        <XCircle className="h-3 w-3 text-rose-400" />
                        <span>FAIL</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
