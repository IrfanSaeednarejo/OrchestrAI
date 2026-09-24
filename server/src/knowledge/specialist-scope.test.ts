// src/knowledge/specialist-scope.test.ts
import { describe, it, expect } from 'vitest';
import { getKnowledgeScope, SPECIALIST_KNOWLEDGE_SCOPE, SpecialistName } from './specialist-scope.js';

describe('specialist-scope', () => {
  describe('getKnowledgeScope — one assertion per specialist', () => {
    it('order_tracking -> { domain: orders, topic: shipping }', () => {
      expect(getKnowledgeScope('order_tracking')).toEqual({ domain: 'orders', topic: 'shipping' });
    });

    it('returns -> { domain: orders, topic: returns }', () => {
      expect(getKnowledgeScope('returns')).toEqual({ domain: 'orders', topic: 'returns' });
    });

    it('payment -> { domain: payments, topic: payments }', () => {
      expect(getKnowledgeScope('payment')).toEqual({ domain: 'payments', topic: 'payments' });
    });

    it('refund -> { domain: payments, topic: refunds }', () => {
      expect(getKnowledgeScope('refund')).toEqual({ domain: 'payments', topic: 'refunds' });
    });

    it('account_access -> { domain: account, topic: account_security }', () => {
      expect(getKnowledgeScope('account_access')).toEqual({ domain: 'account', topic: 'account_security' });
    });

    it('profile -> null (no RAG access)', () => {
      expect(getKnowledgeScope('profile')).toBeNull();
    });
  });

  describe('runtime completeness guard', () => {
    it('SPECIALIST_KNOWLEDGE_SCOPE covers exactly 6 specialist entries', () => {
      // This test guards against someone changing the type to Partial<Record<...>>
      // later and silently losing the compile-time guarantee for all 6 specialists.
      const allSpecialists: SpecialistName[] = [
        'order_tracking',
        'returns',
        'payment',
        'refund',
        'account_access',
        'profile',
      ];

      // Verify all 6 exist with own-property entries in the record
      for (const name of allSpecialists) {
        expect(Object.prototype.hasOwnProperty.call(SPECIALIST_KNOWLEDGE_SCOPE, name)).toBe(true);
      }
      expect(Object.keys(SPECIALIST_KNOWLEDGE_SCOPE)).toHaveLength(6);
    });
  });
});
