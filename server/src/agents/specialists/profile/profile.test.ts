// src/agents/specialists/profile/profile.test.ts
// Phase 11: Unit tests for the Profile specialist subgraph.
// Phase 26 update: Tests reflect the new multi-step update flow
//   (collect_value → confirm_change → awaiting_code → verify → COMPLETED).
// Tests: view_profile (ALLOWED, BLOCKED → Pattern C, DENIED, NOT_FOUND),
//        update_profile (new flow: first visit produces confirm_change;
//                        awaiting_code path produces COMPLETED on correct code),
//        no user in state → FAILED.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

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
  completeAgentExecutionSafely: vi.fn().mockResolvedValue(undefined),
}));

// Mock retrieveKnowledge (not used by Profile, but guard against accidents)
vi.mock('../../../knowledge/retrieval.js', () => ({
  retrieveKnowledge: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

// Mock marketplace repository (getUserById needed by update flow)
vi.mock('../../../persistence/repositories/marketplace.repository.js', () => ({
  getUserById: vi.fn(),
}));

// Mock profile-verification service (avoid Redis in unit tests)
vi.mock('../../../services/profile-verification.service.js', () => ({
  issueProfileVerificationCode: vi.fn(),
  verifyProfileVerificationCode: vi.fn(),
  resendProfileVerificationCode: vi.fn(),
  recordDeliveryFailure: vi.fn(),
  clearProfileVerification: vi.fn(),
  VERIFICATION_TTL_SECONDS: 600,
  RESEND_COOLDOWN_SECONDS: 60,
  FAILURE_COOLDOWN_SECONDS: 15,
}));

// Mock email service
vi.mock('../../../services/email.service.js', () => ({
  sendEmail: vi.fn(),
}));

// Mock db + users schema (avoid Postgres in unit tests)
vi.mock('../../../persistence/db/client.js', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  },
}));

vi.mock('../../../persistence/db/schema.js', () => ({
  users: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import { getUserById } from '../../../persistence/repositories/marketplace.repository.js';
import * as profileVerificationService from '../../../services/profile-verification.service.js';
import * as emailService from '../../../services/email.service.js';
import { db } from '../../../persistence/db/client.js';
import {
  profileNode,
  extractProfileIntent,
  extractLastUserText,
} from './profile.js';
import type { ConversationState } from '../../../state/conversation-state.js';

const mockGated = vi.mocked(gatedExecuteTool);
const mockGetUserById = vi.mocked(getUserById);
const mockIssueCode = vi.mocked(profileVerificationService.issueProfileVerificationCode);
const mockVerifyCode = vi.mocked(profileVerificationService.verifyProfileVerificationCode);
const mockClearVerification = vi.mocked(profileVerificationService.clearProfileVerification);
const mockSendEmail = vi.mocked(emailService.sendEmail);
const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    messages: [new HumanMessage('show me my profile')],
    user: { id: USER_ID },
    currentDomain: 'profile',
    currentIntent: 'VIEW_PROFILE',
    routing: {
      currentAgent: 'profile',
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: ['profile'],
    },
    workflowStatus: 'ACTIVE',
    identity: { status: 'VERIFIED', verificationMethod: 'otp', verifiedAt: '2026-11-05T10:00:00.000Z' },
    activeWorkflow: null,
    lastKnownEntities: null,
    pendingTask: null,
    intentQueue: null,
    ...overrides,
  };
}

const MOCK_USER = {
  id: USER_ID,
  email: 'jane@example.com',
  name: 'Jane Doe',
  defaultAddress: '123 Main St, Springfield',
  passwordHash: null,
  createdAt: new Date('2026-01-01'),
};

const MOCK_PROFILE = {
  ...MOCK_USER,
};

function makeAllowedGetProfile() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: MOCK_PROFILE,
  };
}

function makeBlockedFullGate(tool: string) {
  return {
    gate: {
      outcome: 'BLOCKED' as const,
      reason: 'VERIFICATION_REQUIRED' as const,
      required: 'FULL' as const,
      current: 'UNVERIFIED' as const,
      tool,
      specialist: 'profile' as const,
    },
    success: false as const,
    error: { code: 'VERIFICATION_REQUIRED', message: 'FULL verification required' },
  };
}

function makeDeniedGate(tool: string) {
  return {
    gate: {
      outcome: 'DENIED' as const,
      reason: 'TOOL_NOT_PERMITTED' as const,
      tool,
      specialist: 'profile' as const,
    },
    success: false as const,
    error: { code: 'DENIED', message: 'Tool not allowed' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Profile specialist — extractLastUserText', () => {
  it('returns the last human message content', () => {
    const state = makeState({ messages: [new HumanMessage('hello')] });
    expect(extractLastUserText(state)).toBe('hello');
  });

  it('returns empty string when messages is empty', () => {
    const state = makeState({ messages: [] });
    expect(extractLastUserText(state)).toBe('');
  });
});

describe('Profile specialist — extractProfileIntent', () => {
  beforeEach(() => { mockGenerateContent.mockReset(); });

  it('returns view_profile on empty input without LLM call', async () => {
    const result = await extractProfileIntent('');
    expect(result.intent).toBe('view_profile');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('extracts update_profile intent with name from LLM', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'update_profile', name: 'John Smith', defaultAddress: null, confidence: 0.95 }),
    });
    const result = await extractProfileIntent('please change my name to John Smith');
    expect(result.intent).toBe('update_profile');
    expect(result.name).toBe('John Smith');
  });

  it('falls back to view_profile on LLM failure', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'invalid json }{' });
    const result = await extractProfileIntent('something');
    expect(result.intent).toBe('view_profile');
  });
});

describe('Profile specialist — profileNode', () => {
  beforeEach(() => {
    mockGated.mockReset();
    mockGenerateContent.mockReset();
    mockGetUserById.mockReset();
    mockIssueCode.mockReset();
    mockVerifyCode.mockReset();
    mockClearVerification.mockReset();
    mockSendEmail.mockReset();
    // Reset DB mock chain
    const returning = vi.fn().mockResolvedValue([]);
    vi.mocked(mockDb.update).mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }) } as unknown as ReturnType<typeof mockDb.update>);
  });

  // ---- No user in state ----

  it('returns FAILED when state.user is null', async () => {
    const state = makeState({ user: null });
    const result = await profileNode(state) as { workflowStatus?: string; messages?: Array<{ content: string }> };
    expect(result.workflowStatus).toBe('FAILED');
    expect(result.messages?.[0]?.content).toMatch(/session/i);
  });

  // ---- View profile — ALLOWED ----

  it('view_profile: returns COMPLETED with profile data when ALLOWED', async () => {
    const state = makeState({ messages: [new HumanMessage('show me my profile')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'view_profile', name: null, defaultAddress: null, confidence: 0.95 }),
    });
    mockGated.mockResolvedValueOnce(makeAllowedGetProfile());
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ response: 'Here is your profile: Jane Doe, jane@example.com' }),
    });

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: null;
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.activeWorkflow).toBeNull();
    expect(result.messages?.[0]?.content).toContain('Jane Doe');
  });

  // ---- View profile — BLOCKED → Pattern C ----

  it('view_profile: emits Pattern C activeWorkflow pointing to account_access when BLOCKED', async () => {
    const state = makeState({
      messages: [new HumanMessage('show me my profile')],
      identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null },
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'view_profile', name: null, defaultAddress: null, confidence: 0.9 }),
    });
    mockGated.mockResolvedValueOnce(makeBlockedFullGate('get_profile'));

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: {
        blockedBy: string;
        returnTo: { agent: string; workflowStep: string };
        resumeContext: Record<string, unknown>;
      };
    };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
    expect(result.activeWorkflow?.returnTo?.agent).toBe('profile');
    expect(result.activeWorkflow?.returnTo?.workflowStep).toBe('get_profile');
    expect(result.activeWorkflow?.resumeContext?.['intent']).toBe('view_profile');
  });

  // ---- View profile — DENIED ----

  it('view_profile: returns FAILED when DENIED', async () => {
    const state = makeState({ messages: [new HumanMessage('show me my profile')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'view_profile', name: null, defaultAddress: null, confidence: 0.9 }),
    });
    mockGated.mockResolvedValueOnce(makeDeniedGate('get_profile'));

    const result = await profileNode(state) as { workflowStatus?: string };
    expect(result.workflowStatus).toBe('FAILED');
  });

  // ---- View profile — tool error NOT_FOUND ----

  it('view_profile: returns FAILED with NOT_FOUND message', async () => {
    const state = makeState({ messages: [new HumanMessage('show me my profile')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'view_profile', name: null, defaultAddress: null, confidence: 0.9 }),
    });
    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });

    const result = await profileNode(state) as { workflowStatus?: string; messages?: Array<{ content: string }> };
    expect(result.workflowStatus).toBe('FAILED');
    expect(result.messages?.[0]?.content).toMatch(/not find/i);
  });

  // ---- Update profile — first visit: produces confirm_change state ----

  it('update_profile: first visit with name produces confirm_change WAITING_FOR_USER_INPUT', async () => {
    const state = makeState({ messages: [new HumanMessage('please change my name to John Smith')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'update_profile', name: 'John Smith', defaultAddress: null, confidence: 0.95 }),
    });
    mockGetUserById.mockResolvedValue(MOCK_USER);

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: { currentStep?: string; resumeContext?: Record<string, unknown> };
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.activeWorkflow?.currentStep).toBe('confirm_change');
    // Message should contain the normalized name and ask for confirmation
    expect(result.messages?.[0]?.content).toContain('John Smith');
    expect(result.messages?.[0]?.content).toMatch(/confirm/i);
  });

  // ---- Update profile — confirm_change: user confirms → code sent ----

  it('update_profile: confirm_change + user says yes → sends code, moves to awaiting_code', async () => {
    const state = makeState({
      messages: [new HumanMessage('yes')],
      activeWorkflow: {
        workflowId: null,
        originatingIntent: 'UPDATE_PROFILE',
        currentStep: 'confirm_change',
        blockedBy: null,
        returnTo: null,
        resumeContext: {
          field: 'name',
          pendingName: 'John Smith',
          pendingAddress: undefined,
          originalSnapshot: { name: 'Jane Doe', defaultAddress: '123 Main St, Springfield' },
        },
      },
    });

    mockGetUserById.mockResolvedValue(MOCK_USER);
    mockIssueCode.mockResolvedValue({
      success: true,
      data: { code: '123456', codeHash: 'hash', expiresAt: Date.now() + 600000, resendAt: Date.now() + 60000, resendAfter: 60 },
    });
    mockSendEmail.mockResolvedValue({ success: true, data: { messageId: 'mock-id' } });

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: { currentStep?: string };
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.activeWorkflow?.currentStep).toBe('awaiting_code');
    expect(result.messages?.[0]?.content).toMatch(/6-digit/i);
  });

  // ---- Update profile — awaiting_code: correct code → COMPLETED ----

  it('update_profile: awaiting_code + correct code → COMPLETED with updated name', async () => {
    const state = makeState({
      messages: [new HumanMessage('123456')],
      activeWorkflow: {
        workflowId: null,
        originatingIntent: 'UPDATE_PROFILE',
        currentStep: 'awaiting_code',
        blockedBy: null,
        returnTo: null,
        resumeContext: {
          field: 'name',
          pendingName: 'John Smith',
          pendingAddress: undefined,
          originalSnapshot: { name: 'Jane Doe', defaultAddress: '123 Main St, Springfield' },
        },
      },
    });

    mockVerifyCode.mockResolvedValue({
      success: true,
      status: 'OK',
      data: {
        pendingUpdates: {
          field: 'name',
          name: 'John Smith',
          originalSnapshot: { name: 'Jane Doe', defaultAddress: '123 Main St, Springfield' },
        },
      },
    });
    // Mock DB returning updated row
    const returning = vi.fn().mockResolvedValue([{ ...MOCK_USER, name: 'John Smith' }]);
    vi.mocked(mockDb.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }),
    } as unknown as ReturnType<typeof mockDb.update>);
    mockClearVerification.mockResolvedValue(undefined);

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: null;
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.activeWorkflow).toBeNull();
    expect(result.messages?.[0]?.content).toContain('John Smith');
  });

  // ---- Update profile — awaiting_code: wrong code → WAITING with remaining_attempts ----

  it('update_profile: awaiting_code + wrong code → WAITING_FOR_USER_INPUT with invalid message', async () => {
    const state = makeState({
      messages: [new HumanMessage('000000')],
      activeWorkflow: {
        workflowId: null,
        originatingIntent: 'UPDATE_PROFILE',
        currentStep: 'awaiting_code',
        blockedBy: null,
        returnTo: null,
        resumeContext: {
          field: 'name',
          pendingName: 'John Smith',
          pendingAddress: undefined,
          originalSnapshot: { name: 'Jane Doe', defaultAddress: '123 Main St, Springfield' },
        },
      },
    });

    mockVerifyCode.mockResolvedValue({
      success: false,
      status: 'INVALID',
      attempts: 1,
      remainingAttempts: 4,
      message: 'Invalid code',
    });

    const result = await profileNode(state) as {
      workflowStatus?: string;
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.messages?.[0]?.content).toMatch(/4 attempt/i);
  });

  // ---- Update profile — nothing extracted, asks what to change ----

  it('update_profile: asks for clarification when no fields extracted', async () => {
    const state = makeState({ messages: [new HumanMessage('i want to change something')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'update_profile', name: null, defaultAddress: null, confidence: 0.4 }),
    });
    mockGetUserById.mockResolvedValue(MOCK_USER);

    const result = await profileNode(state) as { workflowStatus?: string; messages?: Array<{ content: string }> };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    // Message should mention what can be changed
    expect(result.messages?.[0]?.content).toMatch(/name|shipping address/i);
  });

  it('update_profile: asks specifically for name when user targets name without a new value', async () => {
    const state = makeState({ messages: [new HumanMessage('so change the account name')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: 'update_profile',
        targetField: 'name',
        name: null,
        defaultAddress: null,
        confidence: 0.9,
      }),
    });
    mockGetUserById.mockResolvedValue(MOCK_USER);

    const result = await profileNode(state) as { workflowStatus?: string; messages?: Array<{ content: string }> };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.messages?.[0]?.content).toMatch(/What new name would you like to set/i);
  });

  it('update_profile: asks specifically for shipping address when user targets address without a new value', async () => {
    const state = makeState({ messages: [new HumanMessage('change my shipping address')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        intent: 'update_profile',
        targetField: 'defaultAddress',
        name: null,
        defaultAddress: null,
        confidence: 0.9,
      }),
    });
    mockGetUserById.mockResolvedValue(MOCK_USER);

    const result = await profileNode(state) as { workflowStatus?: string; messages?: Array<{ content: string }> };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.messages?.[0]?.content).toMatch(/shipping address/i);
  });
});
