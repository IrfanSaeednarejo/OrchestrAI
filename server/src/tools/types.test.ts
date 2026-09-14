import { describe, it, expect } from 'vitest';
import { satisfiesVerification, VerificationRequirement } from './types.js';
import { IdentityState } from '../state/conversation-state.js';

describe('satisfiesVerification', () => {
  const testCases: {
    status: IdentityState['status'];
    requirement: VerificationRequirement;
    expected: boolean;
  }[] = [
    { status: 'UNVERIFIED', requirement: 'NONE', expected: true },
    { status: 'UNVERIFIED', requirement: 'LIGHT', expected: false },
    { status: 'UNVERIFIED', requirement: 'FULL', expected: false },
    { status: 'LIGHTLY_VERIFIED', requirement: 'NONE', expected: true },
    { status: 'LIGHTLY_VERIFIED', requirement: 'LIGHT', expected: true },
    { status: 'LIGHTLY_VERIFIED', requirement: 'FULL', expected: false },
    { status: 'VERIFIED', requirement: 'NONE', expected: true },
    { status: 'VERIFIED', requirement: 'LIGHT', expected: true },
    { status: 'VERIFIED', requirement: 'FULL', expected: true },
  ];

  it.each(testCases)(
    'given status $status and requirement $requirement, it returns $expected',
    ({ status, requirement, expected }) => {
      expect(satisfiesVerification(status, requirement)).toBe(expected);
    }
  );
});
