// src/routing/classifier/classifier.test.ts
// Phase 8: Unit tests for the router intent classifier.
// Mocked @google/genai — zero external API calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

import { classifyMessage } from './classifier.js';
import { isGreetingMessage } from './taxonomy.js';

describe('isGreetingMessage', () => {
  it('identifies standalone greetings', () => {
    expect(isGreetingMessage('hello there')).toBe(true);
    expect(isGreetingMessage('hi')).toBe(true);
    expect(isGreetingMessage('Hey!')).toBe(true);
    expect(isGreetingMessage('Good morning')).toBe(true);
    expect(isGreetingMessage('howdy assistant')).toBe(true);
  });

  it('rejects empty or non-greeting messages', () => {
    expect(isGreetingMessage('')).toBe(false);
    expect(isGreetingMessage('   ')).toBe(false);
    expect(isGreetingMessage('Where is my package?')).toBe(false);
  });

  it('rejects greetings that immediately contain domain keywords', () => {
    expect(isGreetingMessage('Hi, where is my order?')).toBe(false);
    expect(isGreetingMessage('Hello, I want a refund')).toBe(false);
    expect(isGreetingMessage('Hey, can you track my delivery?')).toBe(false);
    expect(isGreetingMessage('Hi I forgot my password')).toBe(false);
  });
});

describe('classifyMessage', () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  it('classifies an order tracking message into order_tracking specialist', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked where their package is.',
      }),
    });

    const result = await classifyMessage('Where is my package #ord-123?');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.specialist).toBe('order_tracking');
      expect(result.data.intent).toBe('ORDER_STATUS');
      expect(result.data.confidence).toBe(0.95);
    }
  });

  it('classifies a refund query into refund specialist', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_REQUEST',
        confidence: 0.9,
        reasoning: 'Customer requesting a money refund.',
      }),
    });

    const result = await classifyMessage('I want my money back for order 555');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.specialist).toBe('refund');
      expect(result.data.intent).toBe('REFUND_REQUEST');
    }
  });

  it('forwards domain context in the prompt', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_STATUS',
        confidence: 0.88,
        reasoning: 'Context is returns.',
      }),
    });

    await classifyMessage('Any updates?', { currentDomain: 'returns' });

    const call = mockGenerateContent.mock.calls[0]?.[0] as {
      contents?: string;
      config?: { temperature?: number };
    };
    expect(call?.contents).toContain('Current active domain: returns');
    expect(call?.config?.temperature).toBe(0.0);
  });

  it('returns SCHEMA_VALIDATION error when LLM output violates schema', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'invalid_specialist_id',
        intent: 'UNKNOWN',
        confidence: 0.5,
        reasoning: 'Bad specialist.',
      }),
    });

    const result = await classifyMessage('Hello');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('SCHEMA_VALIDATION');
    }
  });

  it('returns INVALID_JSON error when LLM output is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'not a json string',
    });

    const result = await classifyMessage('Hello');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('INVALID_JSON');
    }
  });
});

