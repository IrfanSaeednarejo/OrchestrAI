// src/agents/specialists/returns/returns.test.ts
// Phase 9: Unit tests for the Returns specialist.
// Uses buildSingleNodeHarness (MemorySaver) + mocked @google/genai.
// Zero real Gemini API calls; zero real DB calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

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
      id: 'doc-returns-1',
      domain: 'orders',
      documentType: 'policy',
      topic: 'returns',
      version: '1.0',
      content: 'Returns policy: Items can only be returned within 30 days of the delivery date.',
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

import { buildSingleNodeHarness } from '../../common/subgraph-harness.js';
import {
  returnsNode,
  extractReturnIntent,
} from './returns.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';

const mockGated = vi.mocked(gatedExecuteTool);

// ---------------------------------------------------------------------------
// Fixtures & Helpers
// ---------------------------------------------------------------------------

const FIXTURE_ORDER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const FIXTURE_RETURN_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEligibleResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      eligible: true,
      deliveredAt: new Date('2026-11-01'),
      daysSinceDelivery: 4,
    },
  };
}

function makeIneligibleResult(reason: 'RETURN_WINDOW_EXPIRED' | 'ORDER_NOT_DELIVERED' | 'RETURN_ALREADY_EXISTS') {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      eligible: false,
      reason,
    },
  };
}

function makeCreateReturnSuccessResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      id: FIXTURE_RETURN_ID,
      orderId: FIXTURE_ORDER_ID,
      status: 'requested' as const,
      reason: 'Damaged item',
      createdAt: new Date('2026-11-05'),
    },
  };
}

function makeCreateReturnBlockedResult() {
  return {
    gate: {
      outcome: 'BLOCKED' as const,
      reason: 'VERIFICATION_REQUIRED' as const,
      required: 'FULL' as const,
      current: 'UNVERIFIED' as const,
      tool: 'create_return',
      specialist: 'returns' as const,
    },
    success: false as const,
    error: {
      code: 'VERIFICATION_REQUIRED',
      message: 'Requires FULL verification',
    },
  };
}

// ---------------------------------------------------------------------------
// extractReturnIntent
// ---------------------------------------------------------------------------

describe('extractReturnIntent', () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  it('extracts orderId, reason, and intent when LLM finds them', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: 'Item arrived shattered',
        intent: 'create_return',
        confidence: 0.95,
      }),
    });

    const res = await extractReturnIntent(`I want to return order ${FIXTURE_ORDER_ID} because item arrived shattered`);
    expect(res.orderId).toBe(FIXTURE_ORDER_ID);
    expect(res.reason).toBe('Item arrived shattered');
    expect(res.intent).toBe('create_return');
  });

  it('returns null orderId when none present', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: null,
        reason: 'Want to return an item',
        intent: 'create_return',
        confidence: 0.2,
      }),
    });

    const res = await extractReturnIntent('I want to return something');
    expect(res.orderId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// returnsNode
// ---------------------------------------------------------------------------

describe('returnsNode', () => {
  const harness = buildSingleNodeHarness('returns_node', returnsNode);

  beforeEach(() => {
    mockGenerateContent.mockClear();
    mockGated.mockClear();
    mockRetrieveKnowledge.mockClear();
  });

  it('emits WAITING_FOR_USER_INPUT when no orderId can be resolved', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: null,
        reason: null,
        intent: 'create_return',
        confidence: 0.1,
      }),
    });

    const state = await harness.invoke({
      messages: [new HumanMessage('I want to return my purchase')],
    });

    expect(state.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(state.messages.at(-1)?.content).toMatch(/order ID/i);
    expect(mockGated).not.toHaveBeenCalled();
  });

  it('Scenario 9: ineligible return -> RAG explanation -> hard decline (COMPLETED)', async () => {
    // 1. LLM extraction of orderId
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: 'Too small',
        intent: 'create_return',
        confidence: 0.95,
      }),
    });

    // 2. checkReturnEligibility -> ineligible due to RETURN_WINDOW_EXPIRED
    mockGated.mockResolvedValueOnce(makeIneligibleResult('RETURN_WINDOW_EXPIRED'));

    // 3. LLM generation of decline response
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: 'Unfortunately, your order was delivered more than 30 days ago, which exceeds our return window. We cannot accept this return.',
      }),
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Return order ${FIXTURE_ORDER_ID}`)],
    });

    // Must be COMPLETED (conversation reached a definitive conclusion)
    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.activeWorkflow).toBeNull();
    // Must have retrieved knowledge for orders/returns
    expect(mockRetrieveKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        domains: ['orders'],
        topics: ['returns'],
      })
    );
    expect(state.messages.at(-1)?.content).toMatch(/30 days/i);
  });

  it('Scenario 6 shape: eligible return with UNVERIFIED identity -> create_return is BLOCKED -> Pattern C (WAITING_FOR_USER_INPUT)', async () => {
    // 1. Extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: 'Wrong size',
        intent: 'create_return',
        confidence: 0.98,
      }),
    });

    // 2. checkReturnEligibility -> eligible
    mockGated.mockResolvedValueOnce(makeEligibleResult());

    // 3. createReturn -> BLOCKED (needs FULL)
    mockGated.mockResolvedValueOnce(makeCreateReturnBlockedResult());

    const state = await harness.invoke({
      messages: [new HumanMessage(`I want to return order ${FIXTURE_ORDER_ID}`)],
      identity: null, // UNVERIFIED
    });

    expect(state.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(state.activeWorkflow).not.toBeNull();
    expect(state.activeWorkflow?.returnTo).toEqual({
      domain: 'returns',
      agent: 'returns',
      workflowStep: 'create_return',
    });
    expect(state.activeWorkflow?.resumeContext).toEqual({
      orderId: FIXTURE_ORDER_ID,
      reason: 'Wrong size',
    });
    expect(state.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
  });

  it('resumes from activeWorkflow.resumeContext and successfully creates return when FULL verified', async () => {
    // 1. checkReturnEligibility -> eligible
    mockGated.mockResolvedValueOnce(makeEligibleResult());

    // 2. createReturn -> ALLOWED & succeeds
    mockGated.mockResolvedValueOnce(makeCreateReturnSuccessResult());

    // 3. LLM success response generation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        response: `Your return has been requested! Your return ID is ${FIXTURE_RETURN_ID}. Please print the label sent to your email.`,
      }),
    });

    const state = await harness.invoke({
      messages: [new HumanMessage('I verified my account, please process my return.')],
      identity: {
        status: 'VERIFIED',
        verificationMethod: 'email_code',
        verifiedAt: new Date().toISOString(),
      },
      activeWorkflow: {
        workflowId: 'wf-123',
        originatingIntent: 'return_request',
        currentStep: 'create_return',
        blockedBy: 'VERIFICATION_FULL',
        returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'create_return' },
        resumeContext: {
          orderId: FIXTURE_ORDER_ID,
          reason: 'Defective zipper',
        },
      },
    });

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toContain(FIXTURE_RETURN_ID);
    // Extractor LLM should not have been called because resumeContext provided orderId
    expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Only for response generation
  });

  it('emits FAILED when checkReturnEligibility reports ORDER_NOT_FOUND', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: 'Broken',
        intent: 'create_return',
        confidence: 0.9,
      }),
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Return order ${FIXTURE_ORDER_ID}`)],
    });

    expect(state.workflowStatus).toBe('FAILED');
    expect(state.messages.at(-1)?.content).toMatch(/couldn't find/i);
  });

  it('Step 5: intent check_status queries return status and does NOT initiate return creation', async () => {
    // 1. LLM extraction with check_status intent
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: null,
        intent: 'check_status',
        confidence: 0.95,
      }),
    });

    // 2. getReturnByOrder succeeds with an existing return
    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: true as const,
      data: [
        {
          id: FIXTURE_RETURN_ID,
          orderId: FIXTURE_ORDER_ID,
          status: 'in_transit' as const,
          reason: 'Defective item',
          createdAt: new Date('2026-11-02'),
        },
      ],
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`What is the status of the return for order ${FIXTURE_ORDER_ID}?`)],
    });

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toContain(FIXTURE_RETURN_ID);
    expect(state.messages.at(-1)?.content).toContain('in_transit');
    // Ensure gatedExecuteTool was called once for getReturnByOrder and NOT for createReturn
    expect(mockGated).toHaveBeenCalledTimes(1);
  });

  it('Step 5: intent check_eligibility only checks eligibility and does NOT create a return', async () => {
    // 1. LLM extraction with check_eligibility intent
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: null,
        intent: 'check_eligibility',
        confidence: 0.95,
      }),
    });

    // 2. checkReturnEligibility succeeds (eligible)
    mockGated.mockResolvedValueOnce(makeEligibleResult());

    const state = await harness.invoke({
      messages: [new HumanMessage(`Can I return order ${FIXTURE_ORDER_ID}?`)],
    });

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toMatch(/eligible for return/i);
    // Only checkReturnEligibility was called, createReturn was NOT called
    expect(mockGated).toHaveBeenCalledTimes(1);
  });

  it('Step 5: concurrency collision with RETURN_ALREADY_EXISTS returns COMPLETED gracefully', async () => {
    // 1. LLM extraction with create_return intent
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        orderId: FIXTURE_ORDER_ID,
        reason: 'Duplicate order',
        intent: 'create_return',
        confidence: 0.95,
      }),
    });

    // 2. checkReturnEligibility -> eligible
    mockGated.mockResolvedValueOnce(makeEligibleResult());

    // 3. createReturn -> fails with RETURN_ALREADY_EXISTS (unique constraint collision)
    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: {
        code: 'RETURN_ALREADY_EXISTS',
        message: 'A return has already been submitted for this order.',
      },
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Please create a return for order ${FIXTURE_ORDER_ID}`)],
    });

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.activeWorkflow).toBeNull();
    expect(state.messages.at(-1)?.content).toMatch(/already been submitted/i);
  });
});
