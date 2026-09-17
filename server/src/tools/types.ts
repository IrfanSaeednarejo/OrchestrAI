import { IdentityState } from '../state/conversation-state.js';

export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type VerificationRequirement = 'NONE' | 'LIGHT' | 'FULL';

export function satisfiesVerification(
  currentStatus: IdentityState['status'],
  required: VerificationRequirement
): boolean {
  if (required === 'NONE') {
    return true;
  }
  
  if (required === 'LIGHT') {
    return currentStatus === 'LIGHTLY_VERIFIED' || currentStatus === 'VERIFIED';
  }

  if (required === 'FULL') {
    return currentStatus === 'VERIFIED';
  }

  return false;
}

export type ToolMetadata = {
  name: string;
  requiredVerification: VerificationRequirement;
  sensitiveInputFields?: string[];
  sensitiveOutputFields?: string[];
};
