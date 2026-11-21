'use client';

// src/components/ops/handoff-breadcrumbs.tsx
// Phase 34: Visual handoff breadcrumbs with Midnight Burgundy and Imperial Crimson theme.

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
      className={`bg-surface border border-edge-subtle rounded-xl p-4 shadow-xs ${className}`}
    >
      <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-content-muted uppercase tracking-wider font-mono">
        <Compass className="h-4 w-4 text-brand-link" />
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
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-xs transition-all ${
                  isLast
                    ? 'bg-brand-primary/20 border-brand-primary text-brand-link ring-1 ring-brand-primary/30 font-semibold'
                    : 'bg-surface-inset border-edge-subtle text-content-secondary'
                }`}
              >
                <Bot className={`h-3.5 w-3.5 ${isLast ? 'text-brand-link' : 'text-content-muted'}`} />
                <span>{label}</span>
                {isLast && (
                  <span className="text-[10px] bg-brand-primary/40 text-brand-link px-1.5 py-0.5 rounded font-mono font-semibold ml-1">
                    Active
                  </span>
                )}
              </div>

              {!isLast && (
                <ArrowRight className="h-3.5 w-3.5 text-content-muted/60 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
