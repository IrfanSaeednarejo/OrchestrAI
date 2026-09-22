// src/tools/gate.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateGate } from './gate.js';
import { SpecialistId, SPECIALIST_IDS, ToolName } from './permissions.js';
import { VerificationRequirement, ToolMetadata } from './types.js';
import { IdentityState } from '../state/conversation-state.js';

// ORACLE
const ORACLE_ALLOWLIST: Record<ToolName, SpecialistId[]> = {
  get_order: ['order_tracking', 'returns', 'payment', 'refund'],
  get_shipment_status: ['order_tracking', 'returns'],
  get_return_status: ['returns', 'refund'],
  get_return_by_order: ['returns', 'refund'],
  check_return_eligibility: ['returns'],
  create_return: ['returns'],
  get_payment: ['payment'],
  detect_duplicate_charge: ['payment'],
  get_refund_status: ['refund'],
  create_refund: ['refund'],
  get_profile: ['profile'],
  update_profile: ['profile'],
  start_identity_verification: ['account_access'],
  verify_identity: ['account_access'],
  initiate_password_reset: ['account_access'],
  search_knowledge: ['order_tracking', 'returns', 'payment', 'refund', 'account_access'],
};

const ORACLE_REQUIREMENTS: Record<ToolName, VerificationRequirement> = {
  get_order: 'LIGHT',
  get_shipment_status: 'LIGHT',
  get_return_status: 'LIGHT',
  get_return_by_order: 'LIGHT',
  check_return_eligibility: 'LIGHT',
  create_return: 'FULL',
  get_payment: 'FULL',
  detect_duplicate_charge: 'FULL',
  get_refund_status: 'FULL',
  create_refund: 'FULL',
  get_profile: 'FULL',
  update_profile: 'FULL',
  start_identity_verification: 'NONE',
  verify_identity: 'NONE',
  initiate_password_reset: 'NONE',
  search_knowledge: 'NONE',
};

const ALL_TOOLS = Object.keys(ORACLE_ALLOWLIST) as ToolName[];
const IDENTITIES: Array<IdentityState | null> = [
  null,
  { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null },
  { status: 'LIGHTLY_VERIFIED', verificationMethod: 'test', verifiedAt: new Date().toISOString() },
  { status: 'VERIFIED', verificationMethod: 'test', verifiedAt: new Date().toISOString() },
];

function isSatisfied(status: IdentityState['status'] | null, required: VerificationRequirement): boolean {
  if (required === 'NONE') return true;
  const current = status ?? 'UNVERIFIED';
  if (required === 'LIGHT') return current === 'LIGHTLY_VERIFIED' || current === 'VERIFIED';
  if (required === 'FULL') return current === 'VERIFIED';
  return false;
}

describe('evaluateGate', () => {
  it.each(SPECIALIST_IDS)('evaluates %s correctly across all tools and identity levels', (specialist) => {
    for (const toolName of ALL_TOOLS) {
      const tool: ToolMetadata = { name: toolName, requiredVerification: ORACLE_REQUIREMENTS[toolName] };
      for (const identity of IDENTITIES) {
        const result = evaluateGate({ tool, specialist, identity });
        
        const isAllowed = ORACLE_ALLOWLIST[toolName].includes(specialist);
        
        if (!isAllowed) {
          expect(result).toEqual({
            outcome: 'DENIED',
            reason: 'TOOL_NOT_PERMITTED',
            tool: toolName,
            specialist,
          });
        } else {
          const satisfies = isSatisfied(identity?.status ?? 'UNVERIFIED', ORACLE_REQUIREMENTS[toolName]);
          if (satisfies) {
            expect(result).toEqual({ outcome: 'ALLOWED' });
          } else {
            expect(result).toEqual({
              outcome: 'BLOCKED',
              reason: 'VERIFICATION_REQUIRED',
              tool: toolName,
              specialist,
              required: ORACLE_REQUIREMENTS[toolName],
              current: identity?.status ?? 'UNVERIFIED',
            });
          }
        }
      }
    }
  });

  it('profile + search_knowledge -> DENIED at every identity level', () => {
    for (const identity of IDENTITIES) {
      const result = evaluateGate({
        tool: { name: 'search_knowledge', requiredVerification: 'NONE' },
        specialist: 'profile',
        identity,
      });
      expect(result).toEqual({ outcome: 'DENIED', reason: 'TOOL_NOT_PERMITTED', tool: 'search_knowledge', specialist: 'profile' });
    }
  });

  it('every other specialist in the RAG matrix + search_knowledge -> ALLOWED at every level incl. null', () => {
    const ragSpecialists: SpecialistId[] = ['order_tracking', 'returns', 'payment', 'refund', 'account_access'];
    for (const specialist of ragSpecialists) {
      for (const identity of IDENTITIES) {
        const result = evaluateGate({
          tool: { name: 'search_knowledge', requiredVerification: 'NONE' },
          specialist,
          identity,
        });
        expect(result).toEqual({ outcome: 'ALLOWED' });
      }
    }
  });

  it('DENIED takes precedence over BLOCKED: profile + create_refund + null identity -> DENIED', () => {
    const result = evaluateGate({
      tool: { name: 'create_refund', requiredVerification: 'FULL' },
      specialist: 'profile',
      identity: null,
    });
    expect(result).toEqual({ outcome: 'DENIED', reason: 'TOOL_NOT_PERMITTED', tool: 'create_refund', specialist: 'profile' });
  });

  it('null identity: any LIGHT/FULL permitted tool -> BLOCKED with current UNVERIFIED; NONE -> ALLOWED', () => {
    const blockedResult = evaluateGate({
      tool: { name: 'get_order', requiredVerification: 'LIGHT' },
      specialist: 'order_tracking',
      identity: null,
    });
    expect(blockedResult).toEqual({
      outcome: 'BLOCKED',
      reason: 'VERIFICATION_REQUIRED',
      tool: 'get_order',
      specialist: 'order_tracking',
      required: 'LIGHT',
      current: 'UNVERIFIED',
    });

    const allowedResult = evaluateGate({
      tool: { name: 'search_knowledge', requiredVerification: 'NONE' },
      specialist: 'order_tracking',
      identity: null,
    });
    expect(allowedResult).toEqual({ outcome: 'ALLOWED' });
  });

  it('BLOCKED payload correctness: returns + create_return + LIGHTLY_VERIFIED -> { outcome: \'BLOCKED\'... }', () => {
    const result = evaluateGate({
      tool: { name: 'create_return', requiredVerification: 'FULL' },
      specialist: 'returns',
      identity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'test', verifiedAt: null },
    });
    expect(result).toEqual({
      outcome: 'BLOCKED',
      reason: 'VERIFICATION_REQUIRED',
      tool: 'create_return',
      specialist: 'returns',
      required: 'FULL',
      current: 'LIGHTLY_VERIFIED',
    });
  });

  it('DENIED payload correctness (tool and specialist fields)', () => {
    const result = evaluateGate({
      tool: { name: 'create_refund', requiredVerification: 'FULL' },
      specialist: 'profile',
      identity: null,
    });
    expect(result).toEqual({
      outcome: 'DENIED',
      reason: 'TOOL_NOT_PERMITTED',
      tool: 'create_refund',
      specialist: 'profile',
    });
  });

  it('purity: calling evaluateGate twice with the same input returns deeply equal results and does not mutate the input objects', () => {
    const tool = Object.freeze({ name: 'create_return', requiredVerification: 'FULL' } as ToolMetadata);
    const identity = Object.freeze({ status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null } as IdentityState);
    const specialist: SpecialistId = 'returns';

    const input1 = Object.freeze({ tool, specialist, identity });
    const result1 = evaluateGate(input1);
    const result2 = evaluateGate(input1);

    expect(result1).toEqual(result2);
  });
});
