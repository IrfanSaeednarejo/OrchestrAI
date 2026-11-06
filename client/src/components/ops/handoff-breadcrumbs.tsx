'use client';

// src/components/ops/handoff-breadcrumbs.tsx
// Phase 18 Step 5: Visual handoff breadcrumbs showing multi-agent routing transitions.

import React from 'react';
import { ArrowRight, Bot, Compass } from 'lucide-react';

interface HandoffBreadcrumbsProps {
  handoffPath: string[];
  className?: string;
}

const AGENT_NAMES: Record<string, string> = {
  router: 'Supervisor Router',
  order_tracking: 'Order Tracking',
  payment: 'Payments & Billing',
  returns: 'Returns',
  refund: 'Refunds',
  profile: 'Customer Profile',
  account_access: 'Account Access',
};

export function HandoffBreadcrumbs({
  handoffPath,
  className = '',
}: HandoffBreadcrumbsProps) {
  if (!handoffPath || handoffPath.length === 0) {
    return null;
  }

  // Prepend Router as initial origin if not explicitly first
  const fullPath = handoffPath[0] === 'router' ? handoffPath : ['router', ...handoffPath];

  return (
    <div
      data-testid="handoff-breadcrumbs"
      className={`bg-slate-900 border border-slate-800 rounded-lg p-3.5 ${className}`}
    >
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        <Compass className="h-4 w-4 text-indigo-400" />
        <span>Multi-Agent Routing Trajectory</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {fullPath.map((agent, index) => {
          const isLast = index === fullPath.length - 1;
          const label = AGENT_NAMES[agent] || agent.replace(/_/g, ' ');

          return (
            <React.Fragment key={`${agent}-${index}`}>
              <div
                data-testid={`breadcrumb-node-${index}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border shadow-sm transition-all ${
                  isLast
                    ? 'bg-indigo-950 border-indigo-700 text-indigo-200 ring-1 ring-indigo-500/30'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                <Bot className={`h-3.5 w-3.5 ${isLast ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{label}</span>
                {isLast && (
                  <span className="text-[10px] bg-indigo-800/60 text-indigo-300 px-1.5 py-0.2 rounded font-mono font-semibold ml-1">
                    Active
                  </span>
                )}
              </div>

              {!isLast && (
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

