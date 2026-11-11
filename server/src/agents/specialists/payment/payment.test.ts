// src/agents/specialists/payment/payment.test.ts
// Phase 10: Unit tests for the Payment specialist.
// Fast in-memory tests with mocked @google/genai, retrieveKnowledge, and gatedExecuteTool.
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
      id: 'doc-pay-1',
      domain: 'payments',
      documentType: 'policy',
      topic: 'payments',
      version: '1.0',
      content: 'Payments policy: All captured transactions are final unless refunded or disputed.',
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
  paymentNode,
  extractPaymentIntent,
  isDuplicateChargeInquiry,
} from './payment.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import type { ConversationState } from '../../../state/conversation-state.js';

const mockGated = vi.mocked(gatedExecuteTool);

// ---------------------------------------------------------------------------
// Fixtures & Helpers
// ---------------------------------------------------------------------------

const FIXTURE_ORDER_ID = 'e1a2b3c4-d5e6-7890-abcd-1234567890ab';
const FIXTURE_PAYMENT_ID = 'f2b3c4d5-e6f7-8901-bcde-2345678901bc';
const FIXTURE_DUP_PAYMENT_ID = 'a3c4d5e6-f7a8-9012-cdef-3456789012cd';

function makeCapturedPaymentResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      id: FIXTURE_PAYMENT_ID,
      orderId: FIXTURE_ORDER_ID,
      amount: '120.00',
      status: 'captured' as const,
      method: 'credit_card',
      createdAt: new Date('2026-11-04T10:00:00Z'),
    },
  };
}

function makeDuplicateFoundResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      potentialDuplicate: true,
      duplicatePaymentId: FIXTURE_DUP_PAYMENT_ID,
      reason: 'Matching captured payment found on another order within 24 hours',
    },
  };
}

function makeNoDuplicateResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      potentialDuplicate: false,
    },
  };
}

function makePaymentBlockedResult() {
  return {
    gate: {
      outcome: 'BLOCKED' as const,
      reason: 'VERIFICATION_REQUIRED' as const,
      required: 'FULL' as const,
      current: 'UNVERIFIED' as const,
      tool: 'get_payment',
      specialist: 'payment' as const,
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
      currentAgent: 'payment',
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: ['payment'],
    },
    workflowStatus: 'ACTIVE',
    identity: {
      status: 'VERIFIED',
      verificationMethod: 'sms_otp',
      verifiedAt: '2026-11-05T00:00:00Z',
    },
    activeWorkflow: null,
    lastKnownEntities: null,
    pendingTask: null,
    intentQueue: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('Payment Specialist Subgraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractPaymentIntent & isDuplicateChargeInquiry', () => {
    it('detects duplicate charge keywords accurately', () => {
      expect(isDuplicateChargeInquiry('I was charged twice for order 123')).toBe(true);
      expect(isDuplicateChargeInquiry('Duplicate charge on my card')).toBe(true);
      expect(isDuplicateChargeInquiry('Why did you bill me two times?')).toBe(true);
      expect(isDuplicateChargeInquiry('What is my payment status?')).toBe(false);
      expect(isDuplicateChargeInquiry('Checking status', 'DUPLICATE_CHARGE')).toBe(true);
    });

    it('extracts orderId and intent via structured LLM output', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: FIXTURE_ORDER_ID,
          paymentId: null,
          intent: 'duplicate_charge',
          confidence: 0.98,
        }),
      });

      const result = await extractPaymentIntent(`I see two charges for order ${FIXTURE_ORDER_ID}`);
      expect(result.orderId).toBe(FIXTURE_ORDER_ID);
      expect(result.intent).toBe('duplicate_charge');
      expect(result.confidence).toBe(0.98);
    });

    it('returns empty extraction for blank user message', async () => {
      const result = await extractPaymentIntent('');
      expect(result.orderId).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('paymentNode — missing arguments', () => {
    it('emits WAITING_FOR_USER_INPUT when no orderId is found in message or state', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: null,
          paymentId: null,
          intent: 'general_inquiry',
          confidence: 0,
        }),
      });

      const state = buildBaseState({
        messages: [new HumanMessage('Why was my payment declined?')],
      });

      const result = await paymentNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
      expect(update.messages?.[0]?.content).toContain('Could you please provide your order ID?');
      expect(mockGated).not.toHaveBeenCalled();
    });
  });

  describe('paymentNode — Pattern C verification gate', () => {
    it('emits blocked activeWorkflow update when identity is UNVERIFIED (FULL gate fails)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: FIXTURE_ORDER_ID,
          paymentId: null,
          intent: 'payment_status',
          confidence: 0.95,
        }),
      });

      mockGated.mockResolvedValueOnce(makePaymentBlockedResult());

      const state = buildBaseState({
        messages: [new HumanMessage(`Check payment for order ${FIXTURE_ORDER_ID}`)],
        identity: {
          status: 'UNVERIFIED',
          verificationMethod: null,
          verifiedAt: null,
        },
      });

      const result = await paymentNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as {
        workflowStatus?: string;
        activeWorkflow?: {
          blockedBy: string;
          returnTo: { agent: string; workflowStep: string };
          resumeContext: { orderId: string };
        };
      };

      expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
      expect(update.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
      expect(update.activeWorkflow?.returnTo?.agent).toBe('payment');
      expect(update.activeWorkflow?.returnTo?.workflowStep).toBe('get_payment');
      expect(update.activeWorkflow?.resumeContext?.orderId).toBe(FIXTURE_ORDER_ID);
    });
  });

  describe('paymentNode — Standard Payment Inquiry', () => {
    it('fetches payment and grounded RAG policy, completing with customer message', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({
            orderId: FIXTURE_ORDER_ID,
            paymentId: null,
            intent: 'payment_status',
            confidence: 0.95,
          }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            response: `Your payment of $120.00 for order ${FIXTURE_ORDER_ID} was captured successfully.`,
          }),
        });

      mockGated.mockResolvedValueOnce(makeCapturedPaymentResult());

      const state = buildBaseState({
        messages: [new HumanMessage(`What is the payment status for order ${FIXTURE_ORDER_ID}?`)],
      });

      const result = await paymentNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('COMPLETED');
      expect(update.messages?.[0]?.content).toContain('captured successfully');
      expect(mockGated).toHaveBeenCalledTimes(1);
      expect(mockRetrieveKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: ['payments'],
          topics: ['payments'],
        })
      );
    });
  });

  describe('paymentNode — Duplicate Charge Detection & Pattern B Handoff', () => {
    it('investigates duplicate charge and completes when potentialDuplicate is false', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({
            orderId: FIXTURE_ORDER_ID,
            paymentId: null,
            intent: 'duplicate_charge',
            confidence: 0.95,
          }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            response: 'We checked and confirmed only one captured charge of $120.00 exists for this order.',
          }),
        });

      mockGated
        .mockResolvedValueOnce(makeCapturedPaymentResult())
        .mockResolvedValueOnce(makeNoDuplicateResult());

      const state = buildBaseState({
        messages: [new HumanMessage(`I think I was charged twice for order ${FIXTURE_ORDER_ID}`)],
      });

      const result = await paymentNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('COMPLETED');
      expect(update.messages?.[0]?.content).toContain('only one captured charge');
      expect(mockGated).toHaveBeenCalledTimes(2);
    });

    it('confirms duplicate charge and triggers Pattern B Command(goto: router) handoff to Refund specialist', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: FIXTURE_ORDER_ID,
          paymentId: null,
          intent: 'duplicate_charge',
          confidence: 0.99,
        }),
      });

      mockGated
        .mockResolvedValueOnce(makeCapturedPaymentResult())
        .mockResolvedValueOnce(makeDuplicateFoundResult());

      const state = buildBaseState({
        messages: [new HumanMessage(`I was double charged for order ${FIXTURE_ORDER_ID}! Please refund the duplicate.`)],
      });

      const result = await paymentNode(state);

      // Must emit a LangGraph Command targeting the parent router
      expect(result).toBeInstanceOf(Command);
      const cmd = result as unknown as {
        goto: string;
        update: {
          currentIntent: string;
          currentDomain: string;
          routing: { previousAgent: string; handoffCount: number };
          activeWorkflow: {
            currentStep: string;
            blockedBy: string | null;
            returnTo: { agent: string; workflowStep: string; domain: string };
            resumeContext: {
              orderId: string;
              paymentId: string;
              duplicatePaymentId: string;
              amount: string;
              returnId: null;
            };
          };
        };
      };

      const gotoTargets = Array.isArray(cmd.goto) ? cmd.goto : [cmd.goto];
      expect(gotoTargets).toContain('router');
      expect(cmd.update.currentIntent).toBe('REFUND_ACTION_REQUIRED');
      expect(cmd.update.currentDomain).toBe('refund');
      expect(cmd.update.routing.previousAgent).toBe('payment');
      expect(cmd.update.routing.handoffCount).toBe(1); // Reducer applies delta

      // Target specialist in activeWorkflow must be refund
      expect(cmd.update.activeWorkflow.blockedBy).toBeNull();
      expect(cmd.update.activeWorkflow.returnTo.agent).toBe('refund');
      expect(cmd.update.activeWorkflow.returnTo.workflowStep).toBe('create_refund');
      expect(cmd.update.activeWorkflow.resumeContext.duplicatePaymentId).toBe(FIXTURE_DUP_PAYMENT_ID);
      expect(cmd.update.activeWorkflow.resumeContext.amount).toBe('120.00');
      expect(cmd.update.activeWorkflow.resumeContext.returnId).toBeNull();
    });

    it('resumes from activeWorkflow.resumeContext without re-extracting orderId', async () => {
      mockGated.mockResolvedValueOnce(makeCapturedPaymentResult());

      const state = buildBaseState({
        messages: [new HumanMessage('Verification code entered.')],
        currentIntent: 'PAYMENT_INQUIRY',
        activeWorkflow: {
          workflowId: 'wf-123',
          originatingIntent: 'PAYMENT_INQUIRY',
          currentStep: 'get_payment',
          blockedBy: null,
          returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
          resumeContext: { orderId: FIXTURE_ORDER_ID, intent: 'payment_status' },
        },
      });

      // No extraction LLM call needed since orderId is in resumeContext
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Resumed: your payment for order ${FIXTURE_ORDER_ID} is confirmed.`,
        }),
      });

      const result = await paymentNode(state);

      expect(result).not.toBeInstanceOf(Command);
      const update = result as { workflowStatus?: string; messages?: HumanMessage[] };
      expect(update.workflowStatus).toBe('COMPLETED');
      expect(mockGated).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { orderId: FIXTURE_ORDER_ID },
        expect.anything()
      );
    });
  });
});
