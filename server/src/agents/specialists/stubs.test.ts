// src/agents/specialists/stubs.test.ts
// Phase 8: Unit tests for specialist stubs.

import { describe, it, expect } from 'vitest';
import { Command } from '@langchain/langgraph';
import {
  createSpecialistStub,
  SPECIALIST_STUBS,
  type StubBehavior,
} from './stubs.js';
import type {
  ConversationState,
  ActiveWorkflowState,
} from '../../state/conversation-state.js';

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    messages: [],
    user: null,
    currentDomain: null,
    currentIntent: null,
    routing: {
      currentAgent: null,
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: [],
    },
    workflowStatus: 'ACTIVE',
    identity: null,
    activeWorkflow: null,
    ...overrides,
  };
}

function isActiveWorkflow(val: unknown): val is ActiveWorkflowState {
  return typeof val === 'object' && val !== null && 'blockedBy' in val;
}

describe('Specialist Stubs', () => {
  it('defaults to COMPLETED outcome with an AIMessage', async () => {
    const stub = createSpecialistStub('order_tracking');
    const result = await stub(makeState());

    expect(result).not.toBeInstanceOf(Command);
    if (!(result instanceof Command)) {
      expect(result.workflowStatus).toBe('COMPLETED');
      expect(Array.isArray(result.messages)).toBe(true);
      if (Array.isArray(result.messages)) {
        expect(result.messages.length).toBe(1);
      }
    }
  });

  it('handles custom COMPLETE message', async () => {
    const stub = createSpecialistStub('payment');
    const result = await stub(makeState(), {
      configurable: {
        stubBehavior: {
          type: 'COMPLETE',
          message: 'Payment captured successfully.',
        },
      },
    });

    expect(result).not.toBeInstanceOf(Command);
    if (!(result instanceof Command)) {
      expect(result.workflowStatus).toBe('COMPLETED');
      expect(Array.isArray(result.messages)).toBe(true);
      if (Array.isArray(result.messages)) {
        expect(result.messages[0]?.content).toBe('Payment captured successfully.');
      }
    }
  });

  it('handles HANDOFF by returning a Command to route to router', async () => {
    const stub = createSpecialistStub('returns');
    const handoffBehavior: StubBehavior = {
      type: 'HANDOFF',
      handoffRequest: {
        sourceAgent: 'returns',
        handoffReason: 'Customer wants a refund instead of return',
        detectedIntent: 'refund_request',
        recommendedDomain: 'refund',
        relevantContext: { orderId: 'ord-123' },
        attemptedActions: ['get_return_status'],
        confidence: 0.95,
      },
    };

    const result = await stub(makeState(), {
      configurable: { stubBehavior: handoffBehavior },
    });

    expect(result).toBeInstanceOf(Command);
    if (result instanceof Command) {
      expect(result.goto).toEqual(['router']);
      expect(result.update).toEqual({
        currentIntent: 'refund_request',
        routing: {
          previousAgent: 'returns',
          handoffCount: 1,
        },
      });
    }
  });

  it('handles BLOCK by emitting activeWorkflow and WAITING_FOR_USER_INPUT', async () => {
    const stub = createSpecialistStub('payment');
    const blockBehavior: StubBehavior = {
      type: 'BLOCK',
      required: 'FULL',
      workflowStep: 'get_payment',
      workflowId: 'wf-payment-1',
      resumeContext: { paymentId: 'pay-123' },
    };

    const result = await stub(makeState({ currentIntent: 'view_payment' }), {
      configurable: { stubBehavior: blockBehavior },
    });

    expect(result).not.toBeInstanceOf(Command);
    if (!(result instanceof Command)) {
      expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
      expect(isActiveWorkflow(result.activeWorkflow)).toBe(true);
      if (isActiveWorkflow(result.activeWorkflow)) {
        expect(result.activeWorkflow.blockedBy).toBe('VERIFICATION_FULL');
        expect(result.activeWorkflow.workflowId).toBe('wf-payment-1');
        expect(result.activeWorkflow.returnTo).toEqual({
          domain: 'payment',
          agent: 'payment',
          workflowStep: 'get_payment',
        });
        expect(result.activeWorkflow.resumeContext).toEqual({ paymentId: 'pay-123' });
      }
    }
  });

  it('handles FAIL by setting workflowStatus to FAILED', async () => {
    const stub = createSpecialistStub('profile');
    const failBehavior: StubBehavior = {
      type: 'FAIL',
      errorMessage: 'Database connection failed',
    };

    const result = await stub(makeState(), {
      configurable: { stubBehavior: failBehavior },
    });

    expect(result).not.toBeInstanceOf(Command);
    if (!(result instanceof Command)) {
      expect(result.workflowStatus).toBe('FAILED');
      expect(Array.isArray(result.messages)).toBe(true);
      if (Array.isArray(result.messages)) {
        expect(result.messages[0]?.content).toContain('Database connection failed');
      }
    }
  });

  it('allows specialist-specific overrides in stubBehaviors map', async () => {
    const orderStub = SPECIALIST_STUBS.order_tracking;
    const paymentStub = SPECIALIST_STUBS.payment;

    const config = {
      configurable: {
        stubBehaviors: {
          payment: { type: 'FAIL', errorMessage: 'Payment gateway down' },
        },
      },
    };

    const orderResult = await orderStub(makeState(), config);
    const paymentResult = await paymentStub(makeState(), config);

    if (!(orderResult instanceof Command)) {
      expect(orderResult.workflowStatus).toBe('COMPLETED');
    }
    if (!(paymentResult instanceof Command)) {
      expect(paymentResult.workflowStatus).toBe('FAILED');
    }
  });
});
