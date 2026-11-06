// src/components/chat/specialist-badge.tsx
// Phase 17 Step 5b: Specialist badge with unknown-agent tolerance and handoff notice.

import React from 'react';
import { Bot, ArrowRightLeft, ShieldAlert } from 'lucide-react';

interface SpecialistBadgeProps {
  currentAgent: string | null | undefined;
  handoffCount?: number;
  className?: string;
}

const AGENT_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  order_tracking: {
    label: 'Order Tracking Specialist',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  payment: {
    label: 'Payments & Billing Specialist',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  returns: {
    label: 'Returns & Exchanges Specialist',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  refund: {
    label: 'Refunds Specialist',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
  },
  account_access: {
    label: 'Account Access & Security Specialist',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  profile: {
    label: 'Customer Profile Specialist',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
  },
  router: {
    label: 'OrchestrAI Supervisor',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
  },
};

export function SpecialistBadge({
  currentAgent,
  handoffCount = 0,
  className = '',
}: SpecialistBadgeProps) {
  const agentKey = currentAgent?.toLowerCase().trim() || '';
  const meta = AGENT_LABELS[agentKey] || {
    label: currentAgent ? `${currentAgent.replace(/_/g, ' ')} Specialist` : 'AI Support Specialist',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        data-testid="specialist-badge"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${meta.bg} ${meta.text} ${meta.border} shadow-sm`}
      >
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span>{meta.label}</span>
      </span>

      {handoffCount > 0 && (
        <span
          data-testid="handoff-count-badge"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
          title={`${handoffCount} multi-agent handoff(s) occurred`}
        >
          <ArrowRightLeft className="h-3 w-3 text-slate-400" />
          <span>Handoffs: {handoffCount}</span>
        </span>
      )}
    </div>
  );
}
