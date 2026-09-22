// src/tools/gate.ts
import { satisfiesVerification, ToolMetadata, VerificationRequirement } from './types.js';
import { IdentityState } from '../state/conversation-state.js';
import { SpecialistId, TOOL_ALLOWLIST } from './permissions.js';

export type GateDecision =
  | { outcome: 'ALLOWED' }
  | { outcome: 'DENIED'; reason: 'TOOL_NOT_PERMITTED'; tool: string; specialist: SpecialistId }
  | {
      outcome: 'BLOCKED';
      reason: 'VERIFICATION_REQUIRED';
      tool: string;
      specialist: SpecialistId;
      required: Exclude<VerificationRequirement, 'NONE'>;
      current: IdentityState['status'];
    };

export function evaluateGate(input: {
  tool: ToolMetadata;
  specialist: SpecialistId;
  identity: IdentityState | null;
}): GateDecision {
  const { tool, specialist, identity } = input;

  if (!TOOL_ALLOWLIST[specialist].has(tool.name)) {
    return {
      outcome: 'DENIED',
      reason: 'TOOL_NOT_PERMITTED',
      tool: tool.name,
      specialist,
    };
  }

  const current = identity?.status ?? 'UNVERIFIED';
  const required = tool.requiredVerification;

  if (required === 'NONE') {
    return { outcome: 'ALLOWED' };
  }

  if (satisfiesVerification(current, required)) {
    return { outcome: 'ALLOWED' };
  }

  return {
    outcome: 'BLOCKED',
    reason: 'VERIFICATION_REQUIRED',
    tool: tool.name,
    specialist,
    required,
    current,
  };
}
