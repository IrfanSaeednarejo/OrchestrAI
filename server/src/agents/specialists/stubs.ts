// src/agents/specialists/stubs.ts
// Phase 8: Mockable specialist stubs for the 6 domain specialists.
// Provides standardized nodes that simulate specialist execution during
// parent orchestrator routing, handoffs, and verification workflows.

import { AIMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { SpecialistId } from '../../tools/permissions.js';
import type {
  ConversationState,
  ConversationStateUpdate,
  ReturnTo,
} from '../../state/conversation-state.js';
import { buildBlockedWorkflowUpdate } from '../../state/blocked-workflow.js';
import { buildHandoffRequest } from '../handoff/validation.js';
import type { HandoffRequest } from '../handoff/types.js';

// ---------------------------------------------------------------------------
// Configurable Stub Behaviors
// ---------------------------------------------------------------------------

export type StubBehavior =
  | {
      type: 'COMPLETE';
      message?: string;
    }
  | {
      type: 'HANDOFF';
      handoffRequest: HandoffRequest;
    }
  | {
      type: 'BLOCK';
      required: 'LIGHT' | 'FULL';
      workflowStep: string;
      workflowId?: string;
      resumeContext?: Record<string, unknown>;
    }
  | {
      type: 'FAIL';
      errorMessage: string;
    };

export type SpecialistStubNode = (
  state: ConversationState,
  config?: RunnableConfig
) => Promise<ConversationStateUpdate | Command>;

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function extractStubBehavior(
  specialistId: SpecialistId,
  config?: RunnableConfig
): StubBehavior | null {
  const configurable = config?.configurable;
  if (!isRecord(configurable)) {
    return null;
  }

  // Check specialist-specific override first, then general stubBehavior
  const overrides = configurable['stubBehaviors'];
  if (isRecord(overrides) && isRecord(overrides[specialistId])) {
    const raw = overrides[specialistId];
    if (isStubBehavior(raw)) {
      return raw;
    }
  }

  const direct = configurable['stubBehavior'];
  if (isStubBehavior(direct)) {
    return direct;
  }

  return null;
}

function isStubBehavior(val: unknown): val is StubBehavior {
  if (!isRecord(val)) {
    return false;
  }
  const type = val['type'];
  return (
    type === 'COMPLETE' ||
    type === 'HANDOFF' ||
    type === 'BLOCK' ||
    type === 'FAIL'
  );
}

// ---------------------------------------------------------------------------
// Stub Node Factory
// ---------------------------------------------------------------------------

export function createSpecialistStub(specialistId: SpecialistId): SpecialistStubNode {
  return async (state: ConversationState, config?: RunnableConfig) => {
    const behavior = extractStubBehavior(specialistId, config) ?? {
      type: 'COMPLETE',
      message: `Handled by ${specialistId} specialist.`,
    };

    if (behavior.type === 'COMPLETE') {
      const text = behavior.message ?? `Handled by ${specialistId} specialist.`;
      return {
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage(text)],
      };
    }

    if (behavior.type === 'HANDOFF') {
      const validatedHandoff = buildHandoffRequest(behavior.handoffRequest);
      return new Command({
        goto: 'router',
        update: {
          currentIntent: validatedHandoff.detectedIntent,
          routing: {
            previousAgent: specialistId,
            handoffCount: 1, // reducer applies as delta
          },
        },
      });
    }

    if (behavior.type === 'BLOCK') {
      const returnTo: ReturnTo = {
        domain: specialistId,
        agent: specialistId,
        workflowStep: behavior.workflowStep,
      };

      const blockedUpdate = buildBlockedWorkflowUpdate({
        decision: {
          outcome: 'BLOCKED',
          reason: 'VERIFICATION_REQUIRED',
          required: behavior.required,
          current: state.identity?.status ?? 'UNVERIFIED',
          tool: behavior.workflowStep,
          specialist: specialistId,
        },
        returnTo,
        workflowId: behavior.workflowId ?? null,
        originatingIntent: state.currentIntent,
        currentStep: behavior.workflowStep,
        resumeContext: behavior.resumeContext ?? null,
      });

      return {
        ...blockedUpdate,
        workflowStatus: 'WAITING_FOR_USER_INPUT',
      };
    }

    // FAIL
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage(`Specialist error: ${behavior.errorMessage}`)],
    };
  };
}

// ---------------------------------------------------------------------------
// Default Specialist Stubs
// ---------------------------------------------------------------------------

export const orderTrackingStub = createSpecialistStub('order_tracking');
export const returnsStub = createSpecialistStub('returns');
export const paymentStub = createSpecialistStub('payment');
export const refundStub = createSpecialistStub('refund');
export const profileStub = createSpecialistStub('profile');
export const accountAccessStub = createSpecialistStub('account_access');
export const generalAssistantStub = createSpecialistStub('general_assistant');

export const SPECIALIST_STUBS: Record<SpecialistId, SpecialistStubNode> = {
  order_tracking: orderTrackingStub,
  returns: returnsStub,
  payment: paymentStub,
  refund: refundStub,
  profile: profileStub,
  account_access: accountAccessStub,
  general_assistant: generalAssistantStub,
};
