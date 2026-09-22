// src/state/blocked-workflow.test.ts
import { describe, it, expect } from 'vitest';
import {
  isBlockedByReason,
  reasonForRequirement,
  buildBlockedWorkflowUpdate,
  BuildBlockedWorkflowInput
} from './blocked-workflow.js';
import { evaluateGate } from '../tools/gate.js';
import { ToolMetadata } from '../tools/types.js';

describe('blocked-workflow', () => {
  describe('reasonForRequirement', () => {
    it('returns VERIFICATION_LIGHT for LIGHT', () => {
      expect(reasonForRequirement('LIGHT')).toBe('VERIFICATION_LIGHT');
    });

    it('returns VERIFICATION_FULL for FULL', () => {
      expect(reasonForRequirement('FULL')).toBe('VERIFICATION_FULL');
    });
  });

  describe('isBlockedByReason', () => {
    it('returns true for exact literals', () => {
      expect(isBlockedByReason('VERIFICATION_LIGHT')).toBe(true);
      expect(isBlockedByReason('VERIFICATION_FULL')).toBe(true);
    });

    it('returns false for arbitrary strings and null', () => {
      expect(isBlockedByReason('identity_check')).toBe(false);
      expect(isBlockedByReason('')).toBe(false);
      expect(isBlockedByReason('VERIFICATION_LIGHT ')).toBe(false);
      expect(isBlockedByReason(null)).toBe(false);
    });
  });

  describe('buildBlockedWorkflowUpdate', () => {
    const defaultInput = {
      decision: {
        outcome: 'BLOCKED' as const,
        reason: 'VERIFICATION_REQUIRED' as const,
        tool: 'some_tool',
        specialist: 'returns' as const,
        required: 'LIGHT' as const,
        current: 'UNVERIFIED' as const,
      },
      returnTo: { domain: 'returns', agent: 'test_agent', workflowStep: null },
      workflowId: 'wf-123',
      originatingIntent: 'test_intent',
      currentStep: 'step_1',
    };

    it('required LIGHT sets blockedBy to VERIFICATION_LIGHT', () => {
      const update = buildBlockedWorkflowUpdate(defaultInput);
      const aw = update.activeWorkflow;
      if (!aw || !('blockedBy' in aw)) throw new Error('missing');
      expect(aw.blockedBy).toBe('VERIFICATION_LIGHT');
    });

    it('required FULL sets blockedBy to VERIFICATION_FULL', () => {
      const input = {
        ...defaultInput,
        decision: { ...defaultInput.decision, required: 'FULL' as const },
      };
      const update = buildBlockedWorkflowUpdate(input);
      const aw = update.activeWorkflow;
      if (!aw || !('blockedBy' in aw)) throw new Error('missing');
      expect(aw.blockedBy).toBe('VERIFICATION_FULL');
    });

    it('workflowStatus is always exactly BLOCKED', () => {
      const update = buildBlockedWorkflowUpdate(defaultInput);
      expect(update.workflowStatus).toBe('BLOCKED');
    });

    it('returnTo is passed through unchanged', () => {
      const returnTo = { domain: 'returns', agent: 'test_agent', workflowStep: 'step_1', additional: 'data' };
      const update = buildBlockedWorkflowUpdate({ ...defaultInput, returnTo });
      const aw = update.activeWorkflow;
      if (!aw || !('returnTo' in aw)) throw new Error('missing');
      expect(aw.returnTo).toEqual(returnTo);
    });

    it('resumeContext omitted from input sets resumeContext to null', () => {
      const update = buildBlockedWorkflowUpdate(defaultInput);
      const aw = update.activeWorkflow;
      if (!aw || !('resumeContext' in aw)) throw new Error('missing');
      expect(aw.resumeContext).toBeNull();
    });

    it('resumeContext explicitly provided is passed through unchanged', () => {
      const resumeContext = { key: 'value' };
      const update = buildBlockedWorkflowUpdate({ ...defaultInput, resumeContext });
      const aw = update.activeWorkflow;
      if (!aw || !('resumeContext' in aw)) throw new Error('missing');
      expect(aw.resumeContext).toEqual(resumeContext);
    });

    it('ALL SIX activeWorkflow fields are present as own keys (regression test for full-overwrite)', () => {
      const update = buildBlockedWorkflowUpdate(defaultInput);
      const aw = update.activeWorkflow;
      if (!aw || !('blockedBy' in aw)) throw new Error('missing');
      const keys = Object.keys(aw).sort();
      const expectedKeys = [
        'blockedBy',
        'currentStep',
        'originatingIntent',
        'resumeContext',
        'returnTo',
        'workflowId',
      ].sort();
      expect(keys).toEqual(expectedKeys);
    });

    it('purity: Object.freeze on input does not throw and produces correct output', () => {
      const frozenInput: BuildBlockedWorkflowInput = Object.freeze({
        decision: Object.freeze({ ...defaultInput.decision }),
        returnTo: Object.freeze({ domain: 'returns', agent: 'frozen_agent', workflowStep: null }),
        workflowId: 'wf-frozen',
        originatingIntent: 'frozen_intent',
        currentStep: 'frozen_step',
        resumeContext: Object.freeze({ data: 123 }),
      });

      const update = buildBlockedWorkflowUpdate(frozenInput);
      expect(update.workflowStatus).toBe('BLOCKED');
      const aw = update.activeWorkflow;
      if (!aw || !('workflowId' in aw)) throw new Error('missing');
      expect(aw.workflowId).toBe('wf-frozen');
    });

    it('end-to-end integration: feed evaluateGate output directly into builder', () => {
      // Returns specialist calling create_return while LIGHTLY_VERIFIED
      const gateDecision = evaluateGate({
        tool: { name: 'create_return', requiredVerification: 'FULL' } as ToolMetadata,
        specialist: 'returns',
        identity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'test', verifiedAt: 'iso' },
      });

      // Assert gate evaluated to BLOCKED first
      expect(gateDecision.outcome).toBe('BLOCKED');
      if (gateDecision.outcome !== 'BLOCKED') return;

      const update = buildBlockedWorkflowUpdate({
        decision: gateDecision,
        returnTo: { domain: 'returns', agent: 'returns_agent', workflowStep: null },
        workflowId: 'wf-999',
        originatingIntent: 'return_item',
        currentStep: 'call_create_return',
      });

      expect(update).toEqual({
        workflowStatus: 'BLOCKED',
        activeWorkflow: {
          workflowId: 'wf-999',
          originatingIntent: 'return_item',
          currentStep: 'call_create_return',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'returns', agent: 'returns_agent', workflowStep: null },
          resumeContext: null,
        }
      });
    });
  });
});
