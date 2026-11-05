// src/agents/handoff/validation.test.ts
// Phase 7: Unit tests for HandoffRequest schema and helpers.

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { buildHandoffRequest, parseHandoffRequest } from './validation.js';
import type { HandoffRequest } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidRequest(overrides: Partial<HandoffRequest> = {}): HandoffRequest {
  return {
    sourceAgent: 'order_tracking',
    handoffReason: 'Customer is asking about a refund, out of scope.',
    detectedIntent: 'refund_request',
    recommendedDomain: 'refund',
    relevantContext: { orderId: 'ord-001' },
    attemptedActions: ['get_order'],
    confidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildHandoffRequest
// ---------------------------------------------------------------------------

describe('buildHandoffRequest', () => {
  it('returns a HandoffRequest unchanged when input is valid', () => {
    const input = makeValidRequest();
    const result = buildHandoffRequest(input);
    expect(result).toEqual(input);
  });

  it('throws ZodError when confidence is greater than 1', () => {
    const input = makeValidRequest({ confidence: 1.1 });
    expect(() => buildHandoffRequest(input)).toThrow(ZodError);
  });

  it('throws ZodError when confidence is less than 0', () => {
    const input = makeValidRequest({ confidence: -0.1 });
    expect(() => buildHandoffRequest(input)).toThrow(ZodError);
  });

  it('accepts confidence exactly at 0', () => {
    const input = makeValidRequest({ confidence: 0 });
    expect(() => buildHandoffRequest(input)).not.toThrow();
  });

  it('accepts confidence exactly at 1', () => {
    const input = makeValidRequest({ confidence: 1 });
    expect(() => buildHandoffRequest(input)).not.toThrow();
  });

  it('throws ZodError when sourceAgent is not a valid SpecialistId', () => {
    // Force an invalid value through unknown
    const input = makeValidRequest({ sourceAgent: 'invalid_specialist' as never });
    expect(() => buildHandoffRequest(input)).toThrow(ZodError);
  });

  it('accepts detectedIntent as null', () => {
    const input = makeValidRequest({ detectedIntent: null });
    expect(() => buildHandoffRequest(input)).not.toThrow();
    expect(buildHandoffRequest(input).detectedIntent).toBeNull();
  });

  it('accepts empty attemptedActions array', () => {
    const input = makeValidRequest({ attemptedActions: [] });
    expect(() => buildHandoffRequest(input)).not.toThrow();
  });

  it('accepts empty relevantContext object', () => {
    const input = makeValidRequest({ relevantContext: {} });
    expect(() => buildHandoffRequest(input)).not.toThrow();
  });

  it('accepts all valid SpecialistId values as sourceAgent', () => {
    const ids = [
      'order_tracking',
      'returns',
      'payment',
      'refund',
      'profile',
      'account_access',
    ] as const;
    for (const id of ids) {
      expect(() => buildHandoffRequest(makeValidRequest({ sourceAgent: id }))).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// parseHandoffRequest
// ---------------------------------------------------------------------------

describe('parseHandoffRequest', () => {
  it('succeeds and returns data when given a valid plain object', () => {
    const raw: unknown = makeValidRequest();
    const result = parseHandoffRequest(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceAgent).toBe('order_tracking');
    }
  });

  it('strips extra fields from the parsed output', () => {
    const raw: unknown = { ...makeValidRequest(), extraField: 'should be stripped' };
    const result = parseHandoffRequest(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extraField' in result.data).toBe(false);
    }
  });

  it('fails (does not throw) when confidence is out of range', () => {
    const raw: unknown = { ...makeValidRequest(), confidence: 2 };
    const result = parseHandoffRequest(raw);
    expect(result.success).toBe(false);
  });

  it('fails (does not throw) when a required field is missing', () => {
    const { handoffReason: _unused, ...withoutReason } = makeValidRequest();
    void _unused;
    const result = parseHandoffRequest(withoutReason);
    expect(result.success).toBe(false);
  });

  it('fails (does not throw) when given null', () => {
    const result = parseHandoffRequest(null);
    expect(result.success).toBe(false);
  });

  it('fails (does not throw) when given a non-object primitive', () => {
    const result = parseHandoffRequest('not an object');
    expect(result.success).toBe(false);
  });

  it('never throws — even for completely unexpected input', () => {
    expect(() => parseHandoffRequest(undefined)).not.toThrow();
    expect(() => parseHandoffRequest(42)).not.toThrow();
    expect(() => parseHandoffRequest([])).not.toThrow();
  });
});
