// src/agents/specialists/account-access/account-access.test.ts
// Phase 11: Unit tests for the Account Access specialist subgraph.
// Tests:
// - Password reset (Mode 1 / Scenario 14): calls initiatePasswordReset, never touches identity
// - Verification Step A: calls startIdentityVerification, emits WAITING_FOR_USER_INPUT
// - Verification Step B (with returnTo): calls verifyIdentity, emits buildIdentityUpdate + Command({ goto: 'router' })
// - Verification Step B (standalone): calls verifyIdentity, emits buildIdentityUpdate + COMPLETED
// - Verification failure: invalid code -> WAITING_FOR_USER_INPUT; max attempts -> FAILED
// - Security policy inquiry: RAG lookup with domains: ['account'], topics: ['account_security']
// - No user in state -> FAILED

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';

// ---------------------------------------------------------------------------
// Mock @google/genai — hoisted before import
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockEmbedContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent,
    };
  },
}));

// Mock gatedExecuteTool
vi.mock('../../../tools/gated-execution.js', () => ({
  gatedExecuteTool: vi.fn(),
}));

// Mock recordAgentExecution
vi.mock('../../../routing/events.js', () => ({
  recordAgentExecution: vi.fn().mockResolvedValue({ id: 'mock-agent-exec-id' }),
}));

// Mock retrieveKnowledge
const mockRetrieveKnowledge = vi.fn().mockResolvedValue({
  success: true,
  data: [
    {
      id: 'doc-sec-1',
      domain: 'account',
      documentType: 'policy',
      topic: 'account_security',
      version: '1.0',
      content: 'Account security policy: One-time codes expire after 10 minutes.',
      similarity: 0.95,
    },
  ],
});

vi.mock('../../../knowledge/retrieval.js', () => ({
  retrieveKnowledge: (...args: unknown[]) => mockRetrieveKnowledge(...args),
}));

import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import {
  accountAccessNode,
  extractAccountAccessIntent,
  extractSixDigitCode,
  extractLastUserText,
} from './account-access.js';
import type { ConversationState } from '../../../state/conversation-state.js';

const mockGated = vi.mocked(gatedExecuteTool);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    messages: [new HumanMessage('help with my account')],
    user: { id: USER_ID },
    currentDomain: 'account_access',
    currentIntent: 'ACCOUNT_ACCESS',
    routing: {
      currentAgent: 'account_access',
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: ['account_access'],
    },
    workflowStatus: 'ACTIVE',
    identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null },
    activeWorkflow: null,
    lastKnownEntities: null,
    pendingTask: null,
    intentQueue: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Account Access specialist — helpers', () => {
  it('extractLastUserText returns human message content', () => {
    const state = makeState({ messages: [new HumanMessage('my code is 123456')] });
    expect(extractLastUserText(state)).toBe('my code is 123456');
  });

  it('extractSixDigitCode extracts 6-digit number', () => {
    expect(extractSixDigitCode('here is 654321 thanks')).toBe('654321');
    expect(extractSixDigitCode('12345')).toBeNull();
    expect(extractSixDigitCode('1234567')).toBeNull();
    expect(extractSixDigitCode('no code')).toBeNull();
  });

  it('extractAccountAccessIntent fast-paths 6-digit code', async () => {
    const result = await extractAccountAccessIntent('my code is 987654', false);
    expect(result.intent).toBe('verify_code');
    expect(result.code).toBe('987654');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe('Account Access specialist — accountAccessNode', () => {
  beforeEach(() => {
    mockGated.mockReset();
    mockGenerateContent.mockReset();
  });

  // ---- No user in state ----

  it('returns FAILED when state.user is null', async () => {
    const state = makeState({ user: null });
    const result = (await accountAccessNode(state)) as {
      workflowStatus?: string;
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('FAILED');
    expect(result.messages?.[0]?.content).toMatch(/session/i);
  });

  // ---- Path 1: Password Reset (Mode 1 / Scenario 14) ----

  it('Scenario 14: password reset calls initiatePasswordReset and NEVER touches identity', async () => {
    const state = makeState({
      messages: [new HumanMessage('I forgot my password, please reset it')],
      identity: {
        status: 'LIGHTLY_VERIFIED',
        verificationMethod: 'order_number',
        verifiedAt: '2026-11-05T09:00:00Z',
      },
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'password_reset', code: null, confidence: 0.95 }),
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: true as const,
      data: { acknowledged: true },
    });

    const result = await accountAccessNode(state);

    expect(result).not.toBeInstanceOf(Command);
    const update = result as {
      workflowStatus?: string;
      identity?: unknown;
      messages?: Array<{ content: string }>;
    };

    expect(update.workflowStatus).toBe('COMPLETED');
    expect(update.messages?.[0]?.content).toMatch(/password reset link/i);
    // Hard architectural invariant: identity is NOT in the return update
    expect(update.identity).toBeUndefined();
  });

  it('password reset: returns FAILED if tool execution fails', async () => {
    const state = makeState({
      messages: [new HumanMessage('reset my password')],
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'password_reset', code: null, confidence: 0.9 }),
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: { code: 'REPOSITORY_ERROR', message: 'DB down' },
    });

    const result = (await accountAccessNode(state)) as { workflowStatus?: string };
    expect(result.workflowStatus).toBe('FAILED');
  });

  // ---- Path 2: Start Verification (Mode 2 Step A) ----

  it('start verification: issues code and emits WAITING_FOR_USER_INPUT with currentStep verify_identity', async () => {
    const state = makeState({
      messages: [new HumanMessage('please send me a verification code')],
      activeWorkflow: {
        workflowId: 'wf-123',
        originatingIntent: 'PAYMENT_STATUS',
        currentStep: 'get_payment',
        blockedBy: 'VERIFICATION_FULL',
        returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
        resumeContext: { orderId: 'ord-123' },
      },
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'start_verification', code: null, confidence: 0.9 }),
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: true as const,
      data: { sent: true, maskedEmail: 'u***@example.com', expiresInSeconds: 600 },
    });

    const result = await accountAccessNode(state);

    expect(result).not.toBeInstanceOf(Command);
    const update = result as {
      workflowStatus?: string;
      activeWorkflow?: { currentStep: string; blockedBy: string; returnTo: unknown };
      messages?: Array<{ content: string }>;
    };

    expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(update.activeWorkflow?.currentStep).toBe('verify_identity');
    expect(update.activeWorkflow?.returnTo).toEqual({
      domain: 'payment',
      agent: 'payment',
      workflowStep: 'get_payment',
    });
    expect(update.messages?.[0]?.content).toMatch(/verification code has been sent to u\*\*\*@example\.com/i);
  });

  it('start verification failure due to cooldown: surfaces retry seconds and maintains WAITING_FOR_USER_INPUT', async () => {
    const state = makeState({
      messages: [new HumanMessage('send me a code')],
      activeWorkflow: {
        workflowId: 'wf-123',
        originatingIntent: 'GET_PAYMENT',
        currentStep: 'get_payment',
        blockedBy: 'VERIFICATION_FULL',
        returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
        resumeContext: { orderId: 'ord-123' },
      },
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'start_verification', code: null, confidence: 0.9 }),
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: {
        code: 'RESEND_COOLDOWN',
        message: 'Please wait 45 seconds before requesting a new verification code.',
      },
    });

    const result = await accountAccessNode(state);
    const update = result as {
      workflowStatus?: string;
      activeWorkflow?: unknown;
      messages?: Array<{ content: string }>;
    };

    expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(update.activeWorkflow).toEqual(state.activeWorkflow);
    expect(update.messages?.[0]?.content).toContain('wait 45 seconds');
  });

  // ---- Path 3: Verify Code Success with returnTo (Mode 2 Step B -> Pattern C resume) ----

  it('verify code success with returnTo: emits Command(router) with VERIFIED identity and unblocked activeWorkflow', async () => {
    const state = makeState({
      messages: [new HumanMessage('my code is 654321')],
      activeWorkflow: {
        workflowId: 'wf-456',
        originatingIntent: 'CREATE_RETURN',
        currentStep: 'verify_identity',
        blockedBy: 'VERIFICATION_FULL',
        returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'create_return' },
        resumeContext: { orderId: 'ord-456' },
      },
    });

    // Fast-path extracts '654321', no LLM call for intent
    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: true as const,
      data: { verified: true },
    });

    const result = await accountAccessNode(state);

    expect(result).toBeInstanceOf(Command);
    const cmd = result as Command;
    const targets = Array.isArray(cmd.goto) ? cmd.goto : [cmd.goto];
    expect(targets).toContain('router');

    const update = cmd.update as {
      identity?: { status: string; verificationMethod: string; verifiedAt: string };
      activeWorkflow?: { blockedBy: string | null; returnTo: unknown; currentStep: string };
    };

    // Invariant: identity status elevated to VERIFIED via buildIdentityUpdate
    expect(update.identity?.status).toBe('VERIFIED');
    expect(update.identity?.verificationMethod).toBe('otp');
    expect(update.identity?.verifiedAt).toBeDefined();

    // Invariant: blockedBy is cleared to null so router guard checkResumePreconditions unblocks
    expect(update.activeWorkflow?.blockedBy).toBeNull();
    expect(update.activeWorkflow?.returnTo).toEqual({
      domain: 'returns',
      agent: 'returns',
      workflowStep: 'create_return',
    });
  });

  // ---- Path 4: Verify Code Success (standalone without returnTo) ----

  it('verify code success standalone: emits COMPLETED with VERIFIED identity and clears activeWorkflow', async () => {
    const state = makeState({
      messages: [new HumanMessage('code 112233')],
      activeWorkflow: null,
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: true as const,
      data: { verified: true },
    });

    const result = await accountAccessNode(state);

    expect(result).not.toBeInstanceOf(Command);
    const update = result as {
      workflowStatus?: string;
      activeWorkflow?: unknown;
      identity?: { status: string };
      messages?: Array<{ content: string }>;
    };

    expect(update.workflowStatus).toBe('COMPLETED');
    expect(update.identity?.status).toBe('VERIFIED');
    expect(update.activeWorkflow).toBeNull();
    expect(update.messages?.[0]?.content).toMatch(/verified successfully/i);
  });

  // ---- Path 5: Verify Code Failures ----

  it('verify code failure: wrong code returns WAITING_FOR_USER_INPUT for re-try', async () => {
    const state = makeState({
      messages: [new HumanMessage('code is 000000')],
      activeWorkflow: {
        workflowId: 'wf-789',
        originatingIntent: 'GENERAL',
        currentStep: 'verify_identity',
        blockedBy: 'VERIFICATION_FULL',
        returnTo: null,
        resumeContext: null,
      },
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: { code: 'INVALID_CODE', message: 'Code mismatch' },
    });

    const result = await accountAccessNode(state);

    expect(result).not.toBeInstanceOf(Command);
    const update = result as {
      workflowStatus?: string;
      identity?: unknown;
      messages?: Array<{ content: string }>;
    };

    expect(update.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(update.identity).toBeUndefined();
    expect(update.messages?.[0]?.content).toMatch(/invalid or has expired/i);
  });

  it('verify code failure: max attempts returns FAILED', async () => {
    const state = makeState({
      messages: [new HumanMessage('code is 000000')],
    });

    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: { code: 'MAX_ATTEMPTS_EXCEEDED', message: 'Too many attempts' },
    });

    const result = (await accountAccessNode(state)) as { workflowStatus?: string };
    expect(result.workflowStatus).toBe('FAILED');
  });

  // ---- Path 6: Security Inquiry / Policy lookup ----

  it('security inquiry: retrieves knowledge and explains account security policy', async () => {
    const state = makeState({
      messages: [new HumanMessage('how long do verification codes last?')],
    });

    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({ intent: 'security_inquiry', code: null, confidence: 0.95 }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: 'Verification codes expire after 10 minutes per our security policy.',
        }),
      });

    const result = await accountAccessNode(state);

    expect(result).not.toBeInstanceOf(Command);
    const update = result as { workflowStatus?: string; messages?: Array<{ content: string }> };

    expect(update.workflowStatus).toBe('COMPLETED');
    expect(update.messages?.[0]?.content).toContain('10 minutes');
    expect(mockRetrieveKnowledge).toHaveBeenCalledWith({
      query: 'how long do verification codes last?',
      domains: ['account'],
      topics: ['account_security'],
      topK: 3,
    });
  });
});
