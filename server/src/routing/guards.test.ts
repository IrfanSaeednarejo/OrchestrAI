// src/routing/guards.test.ts
// Phase 8: Unit tests for deterministic router safety guards.

import { describe, it, expect } from 'vitest';
import {
  isHandoffCapExceeded,
  isRoutingLoop,
  checkResumePreconditions,
  evaluatePreClassificationGuards,
  DEFAULT_MAX_HANDOFFS,
} from './guards.js';
import type {
  RoutingState,
  ActiveWorkflowState,
  IdentityState,
  ConversationState,
} from '../state/conversation-state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRouting(overrides: Partial<RoutingState> = {}): RoutingState {
  return {
    currentAgent: 'order_tracking',
    previousAgent: null,
    history: [],
    handoffCount: 0,
    visitedAgents: ['order_tracking'],
    ...overrides,
  };
}

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    messages: [],
    user: null,
    currentDomain: null,
    currentIntent: null,
    routing: makeRouting(),
    workflowStatus: 'ACTIVE',
    identity: null,
    activeWorkflow: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Router Guards', () => {
  describe('isHandoffCapExceeded', () => {
    it('returns false when handoffCount is below threshold', () => {
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: 0 }))).toBe(false);
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: 1 }))).toBe(false);
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: 2 }))).toBe(false);
    });

    it('returns true when handoffCount reaches default threshold (3)', () => {
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: DEFAULT_MAX_HANDOFFS }))).toBe(true);
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: 4 }))).toBe(true);
    });

    it('respects custom max handoff threshold', () => {
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: 2 }), 2)).toBe(true);
      expect(isHandoffCapExceeded(makeRouting({ handoffCount: 1 }), 2)).toBe(false);
    });
  });

  describe('isRoutingLoop', () => {
    it('returns false if handoffCount < 2 regardless of target', () => {
      const routing = makeRouting({
        handoffCount: 1,
        previousAgent: 'returns',
      });
      expect(isRoutingLoop(routing, 'returns')).toBe(false);
    });

    it('returns true if proposed target is the previous agent (immediate ping-pong)', () => {
      const routing = makeRouting({
        handoffCount: 2,
        currentAgent: 'order_tracking',
        previousAgent: 'returns',
      });
      expect(isRoutingLoop(routing, 'returns')).toBe(true);
    });

    it('returns true if proposed target has been visited 2 or more times in history', () => {
      const routing = makeRouting({
        handoffCount: 3,
        currentAgent: 'payment',
        previousAgent: 'refund',
        history: [
          { fromAgent: null, toAgent: 'order_tracking', reason: 'r1', timestamp: 't1' },
          { fromAgent: 'order_tracking', toAgent: 'returns', reason: 'r2', timestamp: 't2' },
          { fromAgent: 'returns', toAgent: 'order_tracking', reason: 'r3', timestamp: 't3' },
          { fromAgent: 'order_tracking', toAgent: 'payment', reason: 'r4', timestamp: 't4' },
        ],
      });
      expect(isRoutingLoop(routing, 'order_tracking')).toBe(true);
    });

    it('returns false for an unvisited target agent', () => {
      const routing = makeRouting({
        handoffCount: 2,
        currentAgent: 'order_tracking',
        previousAgent: 'returns',
        history: [],
      });
      expect(isRoutingLoop(routing, 'payment')).toBe(false);
    });
  });

  describe('checkResumePreconditions', () => {
    const returnTo = { domain: 'returns', agent: 'returns', workflowStep: 'create_return' };

    it('returns null when activeWorkflow is null or returnTo is null', () => {
      expect(checkResumePreconditions(null, null)).toBeNull();
      const workflowWithoutReturnTo: ActiveWorkflowState = {
        workflowId: 'wf-1',
        originatingIntent: 'return_request',
        currentStep: 'step',
        blockedBy: null,
        returnTo: null,
        resumeContext: null,
      };
      expect(checkResumePreconditions(workflowWithoutReturnTo, null)).toBeNull();
    });

    it('returns returnTo when blockedBy is null (no verification gate blocked it)', () => {
      const workflow: ActiveWorkflowState = {
        workflowId: 'wf-1',
        originatingIntent: 'return_request',
        currentStep: 'step',
        blockedBy: null,
        returnTo,
        resumeContext: null,
      };
      expect(checkResumePreconditions(workflow, null)).toEqual(returnTo);
    });

    describe('VERIFICATION_LIGHT requirement', () => {
      const workflow: ActiveWorkflowState = {
        workflowId: 'wf-1',
        originatingIntent: 'order_status',
        currentStep: 'get_order',
        blockedBy: 'VERIFICATION_LIGHT',
        returnTo: { domain: 'order_tracking', agent: 'order_tracking', workflowStep: 'get_order' },
        resumeContext: null,
      };

      it('returns null for UNVERIFIED status or null identity', () => {
        expect(checkResumePreconditions(workflow, null)).toBeNull();
        const unverified: IdentityState = {
          status: 'UNVERIFIED',
          verificationMethod: null,
          verifiedAt: null,
        };
        expect(checkResumePreconditions(workflow, unverified)).toBeNull();
      });

      it('returns returnTo when identity is LIGHTLY_VERIFIED or VERIFIED', () => {
        const lightlyVerified: IdentityState = {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: '2026-11-05T00:00:00Z',
        };
        expect(checkResumePreconditions(workflow, lightlyVerified)).toEqual(workflow.returnTo);

        const fullyVerified: IdentityState = {
          status: 'VERIFIED',
          verificationMethod: 'password',
          verifiedAt: '2026-11-05T00:00:00Z',
        };
        expect(checkResumePreconditions(workflow, fullyVerified)).toEqual(workflow.returnTo);
      });
    });

    describe('VERIFICATION_FULL requirement', () => {
      const workflow: ActiveWorkflowState = {
        workflowId: 'wf-2',
        originatingIntent: 'payment_query',
        currentStep: 'get_payment',
        blockedBy: 'VERIFICATION_FULL',
        returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
        resumeContext: null,
      };

      it('returns null when UNVERIFIED or LIGHTLY_VERIFIED', () => {
        expect(checkResumePreconditions(workflow, null)).toBeNull();
        const lightlyVerified: IdentityState = {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: '2026-11-05T00:00:00Z',
        };
        expect(checkResumePreconditions(workflow, lightlyVerified)).toBeNull();
      });

      it('returns returnTo only when fully VERIFIED', () => {
        const fullyVerified: IdentityState = {
          status: 'VERIFIED',
          verificationMethod: 'bank_id',
          verifiedAt: '2026-11-05T00:00:00Z',
        };
        expect(checkResumePreconditions(workflow, fullyVerified)).toEqual(workflow.returnTo);
      });
    });
  });

  describe('evaluatePreClassificationGuards', () => {
    it('returns ESCALATE when handoff cap is reached', () => {
      const state = makeState({
        routing: makeRouting({ handoffCount: 3 }),
      });
      const outcome = evaluatePreClassificationGuards(state);
      expect(outcome.outcome).toBe('ESCALATE');
    });

    it('returns RESUME when active workflow preconditions are met', () => {
      const state = makeState({
        routing: makeRouting({ handoffCount: 1 }),
        activeWorkflow: {
          workflowId: 'wf-1',
          originatingIntent: 'get_payment',
          currentStep: 'get_payment',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
          resumeContext: { orderId: 'ord-1' },
        },
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: '2026-11-05T00:00:00Z',
        },
      });

      const outcome = evaluatePreClassificationGuards(state);
      expect(outcome.outcome).toBe('RESUME');
      if (outcome.outcome === 'RESUME') {
        expect(outcome.targetSpecialist).toBe('payment');
      }
    });

    it('prioritizes ESCALATE over RESUME if handoff cap is also exceeded', () => {
      const state = makeState({
        routing: makeRouting({ handoffCount: 3 }), // cap reached
        activeWorkflow: {
          workflowId: 'wf-1',
          originatingIntent: 'get_payment',
          currentStep: 'get_payment',
          blockedBy: null,
          returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
          resumeContext: null,
        },
      });

      const outcome = evaluatePreClassificationGuards(state);
      expect(outcome.outcome).toBe('ESCALATE');
    });

    it('returns PROCEED when no guard triggers', () => {
      const state = makeState({
        routing: makeRouting({ handoffCount: 0 }),
        activeWorkflow: null,
      });

      const outcome = evaluatePreClassificationGuards(state);
      expect(outcome.outcome).toBe('PROCEED');
    });
  });
});
