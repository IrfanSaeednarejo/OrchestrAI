// src/state/blocked-workflow.ts
import { GateDecision } from '../tools/gate.js';
import { ReturnTo, ConversationStateUpdate, WorkflowStatus } from './conversation-state.js';

export const BLOCKED_BY_REASONS = ['VERIFICATION_LIGHT', 'VERIFICATION_FULL'] as const;
export type BlockedByReason = (typeof BLOCKED_BY_REASONS)[number];

export function isBlockedByReason(value: string | null): value is BlockedByReason {
  return value === 'VERIFICATION_LIGHT' || value === 'VERIFICATION_FULL';
}

export function reasonForRequirement(required: 'LIGHT' | 'FULL'): BlockedByReason {
  return required === 'LIGHT' ? 'VERIFICATION_LIGHT' : 'VERIFICATION_FULL';
}

export type BuildBlockedWorkflowInput = {
  decision: Extract<GateDecision, { outcome: 'BLOCKED' }>;
  returnTo: ReturnTo;
  workflowId: string | null;
  originatingIntent: string | null;
  currentStep: string | null;
  resumeContext?: Record<string, unknown> | null;
};

export function buildBlockedWorkflowUpdate(input: BuildBlockedWorkflowInput): ConversationStateUpdate {
  return {
    workflowStatus: 'BLOCKED' satisfies WorkflowStatus,
    activeWorkflow: {
      workflowId: input.workflowId,
      originatingIntent: input.originatingIntent,
      currentStep: input.currentStep,
      blockedBy: reasonForRequirement(input.decision.required),
      returnTo: input.returnTo,
      resumeContext: input.resumeContext ?? null,
    },
  };
}
