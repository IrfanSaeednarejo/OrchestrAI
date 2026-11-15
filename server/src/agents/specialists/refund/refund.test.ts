// src/agents/specialists/refund/refund.test.ts
// Phase 10: Unit tests for the Refund specialist subgraph.
// Uses mocked @google/genai, retrieveKnowledge, and gatedExecuteTool.
// Zero real Gemini API calls; zero real DB calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';

// ---------------------------------------------------------------------------
// Mock @google/genai — hoisted before import
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

// Mock retrieveKnowledge
const mockRetrieveKnowledge = vi.fn().mockResolvedValue({
  success: true,
  data: [
    {
      id: 'doc-ref-1',
      domain: 'payments',
      documentType: 'policy',
      topic: 'refunds',
      version: '1.0',
      content: 'Refunds policy: Refunds for approved returns are processed within 3-5 business days.',
      similarity: 0.95,
    },
  ],
});

vi.mock('../../../knowledge/retrieval.js', () => ({
  retrieveKnowledge: (...args: unknown[]) => mockRetrieveKnowledge(...args),
}));

// Mock gatedExecuteTool
vi.mock('../../../tools/gated-execution.js', () => ({
  gatedExecuteTool: vi.fn(),
}));

import {
  refundNode,
  extractRefundIntent,
} from './refund.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import type { ConversationState } from '../../../state/conversation-state.js';

const mockGated = vi.mocked(gatedExecuteTool);

// ---------------------------------------------------------------------------
// Fixtures & Helpers
// ---------------------------------------------------------------------------

const FIXTURE_ORDER_ID = 'b1c2d3e4-f5a6-7890-abcd-ef1234567890';
const FIXTURE_PAYMENT_ID = 'c2d3e4f5-a6b7-8901-bcde-fa2345678901';
const FIXTURE_DUP_PAYMENT_ID = 'd3e4f5a6-b7c8-9012-cdef-ab3456789012';
const FIXTURE_RETURN_ID = 'e4f5a6b7-c8d9-0123-defa-bc4567890123';
const FIXTURE_REFUND_ID = 'f5a6b7c8-d9e0-1234-efab-cd5678901234';

function makeCreatedRefundResult(overrides: { returnId: string | null; amount?: string }) {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      id: FIXTURE_REFUND_ID,
      paymentId: FIXTURE_PAYMENT_ID,
      returnId: overrides.returnId,
      amount: overrides.amount ?? '99.99',
      status: 'pending' as const,
      createdAt: new Date('2026-11-05T12:00:00Z'),
    },
  };
}

function makeReturnsByOrderResult(returnsList: Array<{ id: string; status: 'requested' | 'approved' | 'rejected' }>) {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: returnsList.map((r) => ({
      id: r.id,
      orderId: FIXTURE_ORDER_ID,
      status: r.status,
      reason: 'Defective item',
      createdAt: new Date('2026-11-02T10:00:00Z'),
    })),
  };
}

function makePaymentResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      id: FIXTURE_PAYMENT_ID,
      orderId: FIXTURE_ORDER_ID,
      amount: '99.99',
      status: 'captured' as const,
      method: 'credit_card',
      createdAt: new Date('2026-11-01T10:00:00Z'),
    },
  };
}

function makeBlockedResult() {
  return {
    gate: {
      outcome: 'BLOCKED' as const,
      reason: 'VERIFICATION_REQUIRED' as const,
      required: 'FULL' as const,
      current: 'UNVERIFIED' as const,
      tool: 'create_refund',
      specialist: 'refund' as const,
    },
    success: false as const,
    error: {
      code: 'VERIFICATION_REQUIRED',
      message: 'FULL verification required',
    },
  };
}

function buildBaseState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    messages: [],
    user: null,
    currentDomain: null,
    currentIntent: null,
    routing: {
      currentAgent: 'refund',
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: ['refund'],
    },
    workflowStatus: 'ACTIVE',
    identity: {
      status: 'VERIFIED',
      verificationMethod: 'sms_otp',
      verifiedAt: '2026-11-05T00:00:00Z',
    },
    activeWorkflow: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('Refund Specialist Subgraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractRefundIntent', () => {
    it('extracts orderId and intent via structured LLM output', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: FIXTURE_ORDER_ID,
          refundId: null,
          intent: 'refund_request',
          confidence: 0.95,
        }),
      });

      const result = await extractRefundIntent(`I want a refund for order ${FIXTURE_ORDER_ID}`);
      expect(result.orderId).toBe(FIXTURE_ORDER_ID);
      expect(result.intent).toBe('refund_request');
      expect(result.confidence).toBe(0.95);
    });

    it('returns empty extraction for blank string', async () => {
      const result = await extractRefundIntent('');
      expect(result.orderId).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('refundNode — missing arguments', () => {
    it('emits WAITING_FOR_USER_INPUT when no orderId or refundId is present', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: null,
          refundId: null,
          intent: 'refund_request',
          confidence: 0,
        }),
      });

      const state = buildBaseState({
        messages: [new HumanMessage('Where is my money?')],
      });

      const result = await refundNode(state);
      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
      expect(update.messages?.[0]?.content).toContain('Could you please provide your order ID?');
      expect(mockGated).not.toHaveBeenCalled();
    });
  });

  describe('refundNode — Scenario 3 Path (Duplicate Charge Handoff)', () => {
    it('executes create_refund with returnId: null when arriving from duplicate charge handoff', async () => {
      mockGated.mockResolvedValueOnce(makeCreatedRefundResult({ returnId: null, amount: '120.00' }));

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          response: 'I have processed a full refund of $120.00 for the duplicate charge.',
        }),
      });

      const state = buildBaseState({
        messages: [new HumanMessage('I was charged twice.')],
        currentIntent: 'REFUND_ACTION_REQUIRED',
        activeWorkflow: {
          workflowId: 'handoff-dup-123',
          originatingIntent: 'DUPLICATE_CHARGE',
          currentStep: 'REFUND_ACTION_REQUIRED',
          blockedBy: null,
          returnTo: { domain: 'refund', agent: 'refund', workflowStep: 'create_refund' },
          resumeContext: {
            orderId: FIXTURE_ORDER_ID,
            paymentId: FIXTURE_DUP_PAYMENT_ID,
            amount: '120.00',
            returnId: null,
            reason: 'Duplicate charge confirmed',
          },
        },
      });

      const result = await refundNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; activeWorkflow?: unknown; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('COMPLETED');
      expect(update.activeWorkflow).toBeNull(); // Cleared on completion
      expect(update.messages?.[0]?.content).toContain('processed a full refund of $120.00');

      expect(mockGated).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {
          paymentId: FIXTURE_DUP_PAYMENT_ID,
          returnId: null,
          amount: '120.00',
        },
        expect.anything()
      );
    });

    it('emits Pattern C blocked workflow if user is UNVERIFIED during duplicate refund creation', async () => {
      mockGated.mockResolvedValueOnce(makeBlockedResult());

      const state = buildBaseState({
        messages: [new HumanMessage('I was charged twice.')],
        identity: {
          status: 'UNVERIFIED',
          verificationMethod: null,
          verifiedAt: null,
        },
        activeWorkflow: {
          workflowId: 'handoff-dup-123',
          originatingIntent: 'DUPLICATE_CHARGE',
          currentStep: 'REFUND_ACTION_REQUIRED',
          blockedBy: null,
          returnTo: { domain: 'refund', agent: 'refund', workflowStep: 'create_refund' },
          resumeContext: {
            paymentId: FIXTURE_DUP_PAYMENT_ID,
            amount: '120.00',
            returnId: null,
          },
        },
      });

      const result = await refundNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as {
        workflowStatus?: string;
        activeWorkflow?: { blockedBy: string; returnTo: { agent: string } };
      };
      expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
      expect(update.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
      expect(update.activeWorkflow?.returnTo?.agent).toBe('refund');
    });
  });

  describe('refundNode — Scenario 4 Path (No Linked Return)', () => {
    it('triggers Pattern B handoff Command(goto: router) to Returns specialist when no returns exist for order', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: FIXTURE_ORDER_ID,
          refundId: null,
          intent: 'refund_request',
          confidence: 0.95,
        }),
      });

      // getReturnByOrder returns empty array
      mockGated.mockResolvedValueOnce(makeReturnsByOrderResult([]));

      const state = buildBaseState({
        messages: [new HumanMessage(`Can I get a refund for order ${FIXTURE_ORDER_ID}?`)],
      });

      const result = await refundNode(state);

      expect(result).toBeInstanceOf(Command);
      const cmd = result as unknown as {
        goto: string | string[];
        update: {
          currentIntent: string;
          currentDomain: string;
          routing: { previousAgent: string; handoffCount: number };
          activeWorkflow: {
            currentStep: string;
            blockedBy: string | null;
            returnTo: { agent: string; workflowStep: string; domain: string };
            resumeContext: { orderId: string };
          };
        };
      };

      const targets = Array.isArray(cmd.goto) ? cmd.goto : [cmd.goto];
      expect(targets).toContain('router');
      expect(cmd.update.currentIntent).toBe('RETURN_REQUEST');
      expect(cmd.update.currentDomain).toBe('returns');
      expect(cmd.update.routing.previousAgent).toBe('refund');
      expect(cmd.update.routing.handoffCount).toBe(1);

      // Target agent is returns
      expect(cmd.update.activeWorkflow.blockedBy).toBeNull();
      expect(cmd.update.activeWorkflow.returnTo.agent).toBe('returns');
      expect(cmd.update.activeWorkflow.returnTo.workflowStep).toBe('check_return_eligibility');
      expect(cmd.update.activeWorkflow.resumeContext.orderId).toBe(FIXTURE_ORDER_ID);
    });
  });

  describe('refundNode — Scenario 8 Path (Approved Return, Refund Not Created)', () => {
    it('performs structured check and creates refund for approved return', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({
            orderId: FIXTURE_ORDER_ID,
            refundId: null,
            intent: 'refund_status',
            confidence: 0.95,
          }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            response: `Your refund of $99.99 for your approved return on order ${FIXTURE_ORDER_ID} has been processed.`,
          }),
        });

      mockGated
        // 1. getReturnByOrder -> return approved
        .mockResolvedValueOnce(makeReturnsByOrderResult([{ id: FIXTURE_RETURN_ID, status: 'approved' }]))
        // 2. getPayment -> captured payment found
        .mockResolvedValueOnce(makePaymentResult())
        // 3. createRefund -> success
        .mockResolvedValueOnce(makeCreatedRefundResult({ returnId: FIXTURE_RETURN_ID, amount: '99.99' }));

      const state = buildBaseState({
        messages: [new HumanMessage(`My return for order ${FIXTURE_ORDER_ID} was approved, where is my refund?`)],
      });

      const result = await refundNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; activeWorkflow?: unknown; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('COMPLETED');
      expect(update.activeWorkflow).toBeNull();
      expect(update.messages?.[0]?.content).toContain('refund of $99.99');

      expect(mockGated).toHaveBeenCalledTimes(3);
    });
  });

  describe('refundNode — Return exists but pending approval', () => {
    it('explains refund timeline when return is requested but not yet approved', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: FIXTURE_ORDER_ID,
          refundId: null,
          intent: 'refund_status',
          confidence: 0.95,
        }),
      });

      mockGated.mockResolvedValueOnce(makeReturnsByOrderResult([{ id: FIXTURE_RETURN_ID, status: 'requested' }]));

      const state = buildBaseState({
        messages: [new HumanMessage(`Where is my refund for order ${FIXTURE_ORDER_ID}?`)],
      });

      const result = await refundNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('COMPLETED');
      expect(update.messages?.[0]?.content).toContain('currently \'requested\'');
      expect(mockRetrieveKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: ['payments'],
          topics: ['refunds'],
        })
      );
    });
  });
});
