// src/tools/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { TOOL_NAMES, TOOL_ALLOWLIST, SPECIALIST_IDS } from './permissions.js';
import { getOrderMetadata, getShipmentStatusMetadata } from './queries/order.tools.js';
import { getReturnStatusMetadata, getReturnByOrderMetadata } from './queries/return.tools.js';
import { checkReturnEligibilityMetadata, createReturnMetadata } from './mutations/return.tools.js';
import { getPaymentMetadata, getRefundStatusMetadata } from './queries/payment.tools.js';
import { detectDuplicateChargeMetadata } from './business/duplicate-detection.js';
import { createRefundMetadata } from './mutations/refund.tools.js';
import { getProfileMetadata } from './queries/profile.tools.js';
import { updateProfileMetadata } from './mutations/profile.tools.js';
import { startIdentityVerificationMetadata, verifyIdentityMetadata, initiatePasswordResetMetadata } from './mutations/identity.tools.js';
import { searchKnowledgeMetadata } from './queries/knowledge.tools.js';

describe('permissions drift guard', () => {
  const metadatas = [
    getOrderMetadata,
    getShipmentStatusMetadata,
    getReturnStatusMetadata,
    getReturnByOrderMetadata,
    checkReturnEligibilityMetadata,
    createReturnMetadata,
    getPaymentMetadata,
    getRefundStatusMetadata,
    detectDuplicateChargeMetadata,
    createRefundMetadata,
    getProfileMetadata,
    updateProfileMetadata,
    startIdentityVerificationMetadata,
    verifyIdentityMetadata,
    initiatePasswordResetMetadata,
    searchKnowledgeMetadata,
  ];

  it('should have exact set of TOOL_NAMES', () => {
    const names = metadatas.map(m => m.name);
    expect(new Set(names)).toEqual(new Set(TOOL_NAMES));
    expect(names.length).toBe(16);
    expect(TOOL_NAMES.length).toBe(16);
  });

  it('should match the locked verification levels', () => {
    const expectedLevels: Record<string, string> = {
      get_order: 'LIGHT',
      get_shipment_status: 'LIGHT',
      get_return_status: 'LIGHT',
      get_return_by_order: 'LIGHT',
      check_return_eligibility: 'LIGHT',
      create_return: 'FULL',
      get_payment: 'FULL',
      get_refund_status: 'FULL',
      detect_duplicate_charge: 'FULL',
      create_refund: 'FULL',
      get_profile: 'FULL',
      update_profile: 'FULL',
      start_identity_verification: 'NONE',
      verify_identity: 'NONE',
      initiate_password_reset: 'NONE',
      search_knowledge: 'NONE',
    };

    for (const metadata of metadatas) {
      expect(metadata.requiredVerification).toBe(expectedLevels[metadata.name]);
    }
  });

  it('every ToolName appears in at least one specialist allowlist', () => {
    const allowedTools = new Set<string>();
    for (const specialist of SPECIALIST_IDS) {
      for (const tool of TOOL_ALLOWLIST[specialist]) {
        allowedTools.add(tool);
      }
    }
    for (const tool of TOOL_NAMES) {
      expect(allowedTools.has(tool)).toBe(true);
    }
  });

  it('every allowlist entry is a member of TOOL_NAMES', () => {
    const toolNamesSet = new Set<string>(TOOL_NAMES);
    for (const specialist of SPECIALIST_IDS) {
      for (const tool of TOOL_ALLOWLIST[specialist]) {
        expect(toolNamesSet.has(tool)).toBe(true);
      }
    }
  });
});
