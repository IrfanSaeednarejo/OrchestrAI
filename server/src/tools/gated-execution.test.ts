// src/tools/gated-execution.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gatedExecuteTool } from './gated-execution.js';
import { SpecialistId } from './permissions.js';
import { ToolMetadata } from './types.js';
import { IdentityState } from '../state/conversation-state.js';
import { recordToolExecution } from '../routing/events.js';

// Mock recordToolExecution
vi.mock('../routing/events.js', () => ({
  recordToolExecution: vi.fn()
}));

describe('gatedExecuteTool', () => {
  const fakeToolFn = vi.fn(async () => ({ success: true as const, data: { ok: true } }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ALLOWED path: toolFn called, success, recordToolExecution called with success', async () => {
    const metadata: ToolMetadata = { name: 'get_order', requiredVerification: 'LIGHT' };
    const context = {
      agentExecutionId: 'test-exec-id',
      specialist: 'order_tracking' as SpecialistId,
      identity: { status: 'VERIFIED', verificationMethod: 'test', verifiedAt: new Date().toISOString() } as IdentityState
    };

    const result = await gatedExecuteTool(fakeToolFn, metadata, {}, context);

    expect(fakeToolFn).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.gate.outcome).toBe('ALLOWED');

    // recordToolExecution is called inside executeTool. We mocked events.js, so executeTool will call our mock.
    expect(recordToolExecution).toHaveBeenCalledTimes(1);
    expect(recordToolExecution).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      agentExecutionId: 'test-exec-id',
      tool: 'get_order'
    }));
  });

  it('BLOCKED path: toolFn NEVER called, result fails with VERIFICATION_REQUIRED, recordToolExecution called with failure', async () => {
    const metadata: ToolMetadata = { name: 'get_order', requiredVerification: 'LIGHT' };
    const context = {
      agentExecutionId: 'test-exec-id',
      specialist: 'order_tracking' as SpecialistId,
      identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null } as IdentityState
    };

    const result = await gatedExecuteTool(fakeToolFn, metadata, {}, context);

    expect(fakeToolFn).toHaveBeenCalledTimes(0);
    expect(result.success).toBe(false);
    if (!result.success) { // Type guard
      expect(result.error.code).toBe('VERIFICATION_REQUIRED');
    }
    expect(result.gate.outcome).toBe('BLOCKED');
    expect(recordToolExecution).toHaveBeenCalledTimes(1);
    expect(recordToolExecution).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure',
      error: expect.stringMatching(/^VERIFICATION_REQUIRED:/)
    }));
  });

  it('DENIED path: toolFn NEVER called, result fails with TOOL_NOT_PERMITTED, recordToolExecution called with failure', async () => {
    // get_profile is not in order_tracking
    const metadata: ToolMetadata = { name: 'get_profile', requiredVerification: 'FULL' };
    const context = {
      agentExecutionId: 'test-exec-id',
      specialist: 'order_tracking' as SpecialistId,
      identity: { status: 'VERIFIED', verificationMethod: 'test', verifiedAt: new Date().toISOString() } as IdentityState
    };

    const result = await gatedExecuteTool(fakeToolFn, metadata, {}, context);

    expect(fakeToolFn).toHaveBeenCalledTimes(0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TOOL_NOT_PERMITTED');
    }
    expect(result.gate.outcome).toBe('DENIED');
    expect(recordToolExecution).toHaveBeenCalledTimes(1);
    expect(recordToolExecution).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure',
      error: expect.stringMatching(/^TOOL_NOT_PERMITTED:/)
    }));
  });

  it('Logging-failure isolation: recordToolExecution mock rejects -> BLOCKED case returns result, console.error called', async () => {
    vi.mocked(recordToolExecution).mockRejectedValueOnce(new Error('DB connection failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const metadata: ToolMetadata = { name: 'get_order', requiredVerification: 'LIGHT' };
    const context = {
      agentExecutionId: 'test-exec-id',
      specialist: 'order_tracking' as SpecialistId,
      identity: null
    };

    const result = await gatedExecuteTool(fakeToolFn, metadata, {}, context);

    expect(result.success).toBe(false);
    expect(result.gate.outcome).toBe('BLOCKED');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it('ALLOWED path still performs Phase 4 behaviour (failing toolFn is caught and recorded)', async () => {
    const errorToolFn = vi.fn(async () => { throw new Error('Tool internal error'); });
    const metadata: ToolMetadata = { name: 'search_knowledge', requiredVerification: 'NONE' };
    const context = {
      agentExecutionId: 'test-exec-id',
      specialist: 'returns' as SpecialistId,
      identity: null
    };

    const result = await gatedExecuteTool(errorToolFn, metadata, {}, context);

    expect(errorToolFn).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNEXPECTED_ERROR');
    }
    expect(result.gate.outcome).toBe('ALLOWED');

    expect(recordToolExecution).toHaveBeenCalledTimes(1);
    expect(recordToolExecution).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure',
      error: expect.stringMatching(/^UNEXPECTED_ERROR:/)
    }));
  });
});
