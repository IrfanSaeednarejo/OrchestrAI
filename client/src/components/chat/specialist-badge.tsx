// src/components/chat/specialist-badge.tsx
// Phase 17 Step 5b: Specialist badge with unknown-agent tolerance and handoff notice.
// Phase 30 Step 4: Design system redesign — unified brand surface, specialist identity
//   preserved via label text and icon shape; no rainbow colors.

import React from 'react';
import { Bot, ArrowRightLeft, Package, CreditCard, RefreshCw, Wallet, Shield, User as UserIcon } from 'lucide-react';

interface SpecialistBadgeProps {
  currentAgent: string | null | undefined;
  handoffCount?: number;
  className?: string;
}

const AGENT_META: Record<string, { label: string; Icon: React.ElementType }> = {
  order_tracking: {
    label: 'Order Tracking Specialist',
    Icon: Package,
  },
  payment: {
    label: 'Payments & Billing Specialist',
    Icon: CreditCard,
  },
  returns: {
    label: 'Returns & Exchanges Specialist',
    Icon: RefreshCw,
  },
  refund: {
    label: 'Refunds Specialist',
    Icon: Wallet,
  },
  account_access: {
    label: 'Account Access & Security Specialist',
    Icon: Shield,
  },
  profile: {
    label: 'Customer Profile Specialist',
    Icon: UserIcon,
  },
  router: {
    label: 'OrchestrAI Supervisor',
    Icon: Bot,
  },
};

export function SpecialistBadge({
  currentAgent,
  handoffCount = 0,
  className = '',
}: SpecialistBadgeProps) {
  const agentKey = currentAgent?.toLowerCase().trim() || '';
  const meta = AGENT_META[agentKey] ?? {
    label: currentAgent
      ? `${currentAgent.replace(/_/g, ' ')} Specialist`
      : 'AI Support Specialist',
    Icon: Bot,
  };

  const { Icon } = meta;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        data-testid="specialist-badge"
        className="inline-flex items-center gap-1.5 rounded-tag px-2.5 py-1 text-xs font-medium border border-edge-subtle bg-surface-elevated text-content-secondary shadow-sm"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-brand-link" />
        <span>{meta.label}</span>
      </span>

      {handoffCount > 0 && (
        <span
          data-testid="handoff-count-badge"
          className="inline-flex items-center gap-1 rounded-tag px-2 py-0.5 text-[11px] font-medium bg-surface-elevated text-content-muted border border-edge-subtle"
          title={`${handoffCount} multi-agent handoff(s) occurred`}
        >
          <ArrowRightLeft className="h-3 w-3 text-content-disabled" />
          <span>Handoffs: {handoffCount}</span>
        </span>
      )}
    </div>
  );
}
