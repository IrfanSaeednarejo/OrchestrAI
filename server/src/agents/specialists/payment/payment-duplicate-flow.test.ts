import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';

const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockCreateReviewRequest = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 'rev-req-12345',
    amount: '89.99',
    status: 'pending',
    createdAt: new Date(),
  })
);

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('../../../persistence/repositories/review-request.repository.js', () => ({
  createReviewRequest: (...args: unknown[]) => mockCreateReviewRequest(...args),
}));

const mockRetrieveKnowledge = vi.fn().mockResolvedValue({
  success: true,
  data: [],
});

vi.mock('../../../knowledge/retrieval.js', () => ({
  retrieveKnowledge: (...args: unknown[]) => mockRetrieveKnowledge(...args),
}));

vi.mock('../../../tools/gated-execution.js', () => ({
  gatedExecuteTool: vi.fn(),
}));

import { paymentNode, isUserConfirmation } from './payment.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import type { BaseMessage } from '@langchain/core/messages';
import type { ConversationState, ConversationStateUpdate } from '../../../state/conversation-state.js';

type PaymentUpdate = Omit<ConversationStateUpdate, 'messages'> & {
  activeWorkflow?: ConversationState['activeWorkflow'];
  messages?: BaseMessage[];
};

const mockGated = vi.mocked(gatedExecuteTool);

const FIXTURE_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const FIXTURE_PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
const FIXTURE_DUP_PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function buildBaseState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    messages: [new HumanMessage('Hello')],
    identity: {
      status: 'VERIFIED',
      verificationMethod: 'otp',
      verifiedAt: new Date().toISOString(),
    },
    user: { id: '00000000-0000-4000-8000-000000000001' },
    routing: {
      currentAgent: 'payment',
      previousAgent: 'router',
      history: [],
      handoffCount: 0,
      visitedAgents: ['payment'],
    },
    currentDomain: 'payment',
    currentIntent: 'DUPLICATE_CHARGE',
    workflowStatus: 'ACTIVE',
    activeWorkflow: null,
    ...overrides,
  };
}

describe('Payment Specialist — Duplicate Charge Confirmation Flow (OD-24b)', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGated.mockReset();
    mockCreateReviewRequest.mockClear();
  });

  it('isUserConfirmation recognizes affirmations and declines accurately', () => {
    expect(isUserConfirmation('Yes, please refund').confirmed).toBe(true);
    expect(isUserConfirmation('yeah proceed').confirmed).toBe(true);
    expect(isUserConfirmation('sure do it').confirmed).toBe(true);
    expect(isUserConfirmation('No, leave it').declined).toBe(true);
    expect(isUserConfirmation('cancel that').declined).toBe(true);
    expect(isUserConfirmation("don't do that").declined).toBe(true);
  });

  it('prompts user for confirmation when duplicate is detected without prior refund request', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        paymentId: null,
        intent: 'duplicate_charge',
        confidence: 0.95,
      }),
    });

    mockGated
      .mockResolvedValueOnce({
        gate: { outcome: 'ALLOWED' },
        success: true,
        data: {
          id: FIXTURE_PAYMENT_ID,
          orderId: FIXTURE_ORDER_ID,
          amount: '89.99',
          status: 'captured',
          method: 'credit_card',
          createdAt: new Date(),
        },
      })
      .mockResolvedValueOnce({
        gate: { outcome: 'ALLOWED' },
        success: true,
        data: {
          potentialDuplicate: true,
          duplicatePaymentId: FIXTURE_DUP_PAYMENT_ID,
          reason: 'Duplicate payment found within 24h',
        },
      });

    const state = buildBaseState({
      messages: [new HumanMessage(`Why was I charged twice for order ${FIXTURE_ORDER_ID}?`)],
    });

    const result = await paymentNode(state);

    expect(result).not.toBeInstanceOf(Command);
    const update = result as PaymentUpdate;
    expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(update.activeWorkflow?.resumeContext?.['awaitingDuplicateConfirmation']).toBe(true);
    expect(update.messages?.[0]?.content).toContain('Would you like our billing team to review and refund this charge?');
  });

  it('cancels review request gracefully when user declines confirmation', async () => {
    const state = buildBaseState({
      messages: [new HumanMessage('No, cancel it please')],
      activeWorkflow: {
        workflowId: 'dup-123',
        originatingIntent: 'DUPLICATE_CHARGE',
        currentStep: 'confirm_duplicate',
        blockedBy: null,
        returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'confirm_duplicate' },
        resumeContext: {
          awaitingDuplicateConfirmation: true,
          orderId: FIXTURE_ORDER_ID,
          paymentId: FIXTURE_PAYMENT_ID,
          duplicatePaymentId: FIXTURE_DUP_PAYMENT_ID,
          amount: '89.99',
          reason: 'Duplicate charge detected',
        },
      },
    });

    const result = await paymentNode(state);
    expect(result).not.toBeInstanceOf(Command);
    const update = result as PaymentUpdate;
    expect(update.workflowStatus).toBe('COMPLETED');
    expect(update.activeWorkflow).toBeNull();
    expect(update.messages?.[0]?.content).toContain('cancelled the duplicate charge review request');
  });

  it('submits review request to billing team when user confirms', async () => {
    const state = buildBaseState({
      messages: [new HumanMessage('Yes, please refund the charge')],
      activeWorkflow: {
        workflowId: 'dup-123',
        originatingIntent: 'DUPLICATE_CHARGE',
        currentStep: 'confirm_duplicate',
        blockedBy: null,
        returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'confirm_duplicate' },
        resumeContext: {
          awaitingDuplicateConfirmation: true,
          orderId: FIXTURE_ORDER_ID,
          paymentId: FIXTURE_PAYMENT_ID,
          duplicatePaymentId: FIXTURE_DUP_PAYMENT_ID,
          amount: '89.99',
          reason: 'Duplicate charge detected',
        },
      },
    });

    const result = await paymentNode(state);
    expect(result).not.toBeInstanceOf(Command);
    const update = result as PaymentUpdate;
    expect(update.workflowStatus).toBe('COMPLETED');
    expect(update.activeWorkflow).toBeNull();
    expect(update.messages?.[0]?.content).toContain('rev-req-12345');
    expect(mockCreateReviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: FIXTURE_ORDER_ID,
        paymentId: FIXTURE_PAYMENT_ID,
        amount: '89.99',
        status: 'pending',
      })
    );
  });
});
