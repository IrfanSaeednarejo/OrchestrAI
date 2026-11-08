// src/agents/specialists/profile/profile.test.ts
// Phase 11: Unit tests for the Profile specialist subgraph.
// Tests: view_profile (ALLOWED, BLOCKED → Pattern C, DENIED, NOT_FOUND),
//        update_profile (ALLOWED, BLOCKED → Pattern C, nothing-to-update),
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
}));

// Mock retrieveKnowledge (not used by Profile, but guard against accidents)
vi.mock('../../../knowledge/retrieval.js', () => ({
  retrieveKnowledge: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import {
  profileNode,
  extractProfileIntent,
  extractLastUserText,
} from './profile.js';
import type { ConversationState } from '../../../state/conversation-state.js';

const mockGated = vi.mocked(gatedExecuteTool);

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
    ...overrides,
  };
}

const MOCK_PROFILE = {
  id: USER_ID,
  email: 'test@example.com',
  name: 'Jane Doe',
  defaultAddress: '123 Main St, Springfield',
  createdAt: new Date('2026-01-01'),
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

    // LLM: intent extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'view_profile', name: null, defaultAddress: null, confidence: 0.95 }),
    });

    // Gate: ALLOWED
    mockGated.mockResolvedValueOnce(makeAllowedGetProfile());

    // LLM: response generation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ response: 'Here is your profile: Jane Doe, test@example.com' }),
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

    // LLM: intent extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'view_profile', name: null, defaultAddress: null, confidence: 0.9 }),
    });

    // Gate: BLOCKED
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

  // ---- Update profile — ALLOWED ----

  it('update_profile: returns COMPLETED when update succeeds', async () => {
    const state = makeState({ messages: [new HumanMessage('please change my name to John Smith')] });

    // LLM: intent extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'update_profile', name: 'John Smith', defaultAddress: null, confidence: 0.95 }),
    });
    // Gate: ALLOWED
    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: true as const,
      data: { ...MOCK_PROFILE, name: 'John Smith' },
    });
    // LLM: response generation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ response: 'Your name has been updated to John Smith.' }),
    });

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: null;
      messages?: Array<{ content: string }>;
    };
    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.activeWorkflow).toBeNull();
    expect(result.messages?.[0]?.content).toContain('John Smith');
  });

  // ---- Update profile — BLOCKED → Pattern C ----

  it('update_profile: emits Pattern C activeWorkflow with correct resumeContext when BLOCKED', async () => {
    const state = makeState({
      messages: [new HumanMessage('update my address to 456 Oak Ave')],
      identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null },
    });

    // LLM: intent extraction
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'update_profile', name: null, defaultAddress: '456 Oak Ave', confidence: 0.95 }),
    });
    // Gate: BLOCKED
    mockGated.mockResolvedValueOnce(makeBlockedFullGate('update_profile'));

    const result = await profileNode(state) as {
      workflowStatus?: string;
      activeWorkflow?: {
        returnTo: { agent: string; workflowStep: string };
        resumeContext: Record<string, unknown>;
      };
    };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.activeWorkflow?.returnTo?.agent).toBe('profile');
    expect(result.activeWorkflow?.returnTo?.workflowStep).toBe('update_profile');
    expect(result.activeWorkflow?.resumeContext?.['defaultAddress']).toBe('456 Oak Ave');
    expect(result.activeWorkflow?.resumeContext?.['intent']).toBe('update_profile');
  });

  // ---- Update profile — nothing to update ----

  it('update_profile: asks for clarification when no fields extracted', async () => {
    const state = makeState({ messages: [new HumanMessage('i want to change something')] });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ intent: 'update_profile', name: null, defaultAddress: null, confidence: 0.4 }),
    });

    const result = await profileNode(state) as { workflowStatus?: string; messages?: Array<{ content: string }> };
    expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(result.messages?.[0]?.content).toMatch(/name or your default/i);
  });
});
