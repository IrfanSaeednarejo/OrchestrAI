import { describe, it, expect } from 'vitest';
import { sanitizeMetadata, buildTags, buildRunName } from './metadata.js';
import { createTraceConfig } from './tracer.js';
import type { OrchestrAITraceMetadata } from './types.js';

describe('Observability & Tracing (Phase 14 OD-14)', () => {
  const baseMetadata: OrchestrAITraceMetadata = {
    conversationId: 'conv-12345',
    userId: 'user-67890',
    threadId: 'thread-conv-12345',
    domain: 'orders',
    specialist: 'order_tracking',
    intent: 'ORDER_STATUS',
    workflowStatus: 'ACTIVE',
    verificationStatus: 'LIGHT',
    handoffCount: 1,
    level: 'conversation',
    environment: 'test',
  };

  describe('sanitizeMetadata', () => {
    it('preserves all standard trace metadata fields and defaults missing optional values', () => {
      const sanitized = sanitizeMetadata(baseMetadata);

      expect(sanitized).toEqual({
        conversationId: 'conv-12345',
        userId: 'user-67890',
        threadId: 'thread-conv-12345',
        domain: 'orders',
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        workflowStatus: 'ACTIVE',
        verificationStatus: 'LIGHT',
        handoffCount: 1,
        level: 'conversation',
        environment: 'test',
      });
    });

    it('replaces undefined optional fields with null and defaults handoffCount to 0', () => {
      const minimalMetadata: OrchestrAITraceMetadata = {
        conversationId: 'conv-min',
        threadId: 'thread-min',
        level: 'router',
        environment: 'production',
      };

      const sanitized = sanitizeMetadata(minimalMetadata);

      expect(sanitized.conversationId).toBe('conv-min');
      expect(sanitized.threadId).toBe('thread-min');
      expect(sanitized.userId).toBeNull();
      expect(sanitized.domain).toBeNull();
      expect(sanitized.specialist).toBeNull();
      expect(sanitized.intent).toBeNull();
      expect(sanitized.workflowStatus).toBeNull();
      expect(sanitized.verificationStatus).toBeNull();
      expect(sanitized.handoffCount).toBe(0);
      expect(sanitized.level).toBe('router');
      expect(sanitized.environment).toBe('production');
    });

    it('strips arbitrary extra fields to prevent accidental PII or secret leakage', () => {
      const metadataWithPii = {
        ...baseMetadata,
        rawVerificationCode: '123456',
        password: 'super-secret-password',
        creditCard: '4111-2222-3333-4444',
      } as unknown as OrchestrAITraceMetadata;

      const sanitized = sanitizeMetadata(metadataWithPii);

      expect(sanitized).not.toHaveProperty('rawVerificationCode');
      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).not.toHaveProperty('creditCard');
    });
  });

  describe('buildTags', () => {
    it('constructs complete set of tags when all fields are populated', () => {
      const tags = buildTags(baseMetadata);

      expect(tags).toContain('orchestrai');
      expect(tags).toContain('env:test');
      expect(tags).toContain('level:conversation');
      expect(tags).toContain('domain:orders');
      expect(tags).toContain('specialist:order_tracking');
      expect(tags).toContain('intent:ORDER_STATUS');
      expect(tags).toContain('workflow:ACTIVE');
      expect(tags).toContain('verification:LIGHT');
      expect(tags).toHaveLength(8);
    });

    it('omits optional tags when fields are absent or null', () => {
      const tags = buildTags({
        conversationId: 'conv-none',
        threadId: 'thread-none',
        level: 'tool',
        environment: 'test',
      });

      expect(tags).toEqual(['orchestrai', 'env:test', 'level:tool']);
    });
  });

  describe('buildRunName', () => {
    it('returns standardized run names across all trace levels', () => {
      expect(buildRunName('conversation')).toBe('OrchestrAI:ParentGraph');
      expect(buildRunName('router')).toBe('OrchestrAI:Router');
      expect(buildRunName('specialist', 'order_tracking')).toBe('OrchestrAI:Specialist:order_tracking');
      expect(buildRunName('specialist')).toBe('OrchestrAI:Specialist');
      expect(buildRunName('tool')).toBe('OrchestrAI:Tool');
      expect(buildRunName('llm')).toBe('OrchestrAI:LLM');
    });
  });

  describe('createTraceConfig', () => {
    it('generates a valid RunnableConfig with runName, tags, metadata, and configurable', () => {
      const config = createTraceConfig(baseMetadata);

      expect(config.runName).toBe('OrchestrAI:ParentGraph');
      expect(config.tags).toContain('orchestrai');
      expect(config.tags).toContain('domain:orders');
      expect(config.metadata).toMatchObject({
        conversationId: 'conv-12345',
        userId: 'user-67890',
        threadId: 'thread-conv-12345',
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
      });
      expect(config.configurable).toEqual({
        thread_id: 'thread-conv-12345',
        conversationId: 'conv-12345',
        userId: 'user-67890',
      });
    });

    it('merges extraConfig options without overwriting core thread identity', () => {
      const config = createTraceConfig(
        baseMetadata,
        {
          recursionLimit: 50,
          configurable: {
            customParam: 'my-custom-value',
          },
        },
        {
          extraTags: ['feature:priority-support'],
          extraMetadata: { customMetaKey: 'customMetaVal' },
        }
      );

      expect(config.recursionLimit).toBe(50);
      expect(config.configurable?.['customParam']).toBe('my-custom-value');
      expect(config.configurable?.['thread_id']).toBe('thread-conv-12345');
      expect(config.tags).toContain('feature:priority-support');
      expect(config.metadata?.['customMetaKey']).toBe('customMetaVal');
    });

    it('preserves custom callbacks for offline deterministic assertions without network calls', () => {
      const mockCallback = {
        handleChainStart: () => {},
        handleChainEnd: () => {},
      };

      const config = createTraceConfig(baseMetadata, {
        callbacks: [mockCallback as never],
      });

      expect(config.callbacks).toBeDefined();
      expect(Array.isArray(config.callbacks)).toBe(true);
      expect(config.callbacks).toHaveLength(1);
    });
  });
});
