// src/agents/llm/client.test.ts
// Phase 7: Unit tests for the Gemini LLM client wrapper.
// The @google/genai module is mocked — no real API calls are made.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Mock @google/genai BEFORE any import of the module under test.
// vi.hoisted ensures the factory runs before ES module hoisting.
// ---------------------------------------------------------------------------

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

// Import AFTER mock is established
import { generateStructuredOutput } from './client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextResponse(text: string) {
  return { text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateStructuredOutput', () => {
  const schema = z.object({ answer: z.string(), value: z.number() });

  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  // a. Happy path: valid JSON + schema match → success result
  it('returns success with parsed data when response is valid JSON matching schema', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":42}')
    );

    const result = await generateStructuredOutput(schema, 'some prompt');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ answer: 'yes', value: 42 });
    }
  });

  // b. Invalid JSON → INVALID_JSON error (never throws)
  it('returns INVALID_JSON error when response text is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeTextResponse('not-json'));

    const result = await generateStructuredOutput(schema, 'some prompt');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('INVALID_JSON');
    }
  });

  // c. Valid JSON but schema mismatch → SCHEMA_VALIDATION error
  it('returns SCHEMA_VALIDATION error when JSON does not match schema', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":"not-a-number"}')
    );

    const result = await generateStructuredOutput(schema, 'some prompt');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('SCHEMA_VALIDATION');
    }
  });

  // d. Empty response text → EMPTY_RESPONSE error
  it('returns EMPTY_RESPONSE error when response text is empty', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeTextResponse(''));

    const result = await generateStructuredOutput(schema, 'some prompt');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('EMPTY_RESPONSE');
    }
  });

  // e. Undefined response text → EMPTY_RESPONSE error
  it('returns EMPTY_RESPONSE error when response.text is undefined', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: undefined });

    const result = await generateStructuredOutput(schema, 'some prompt');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('EMPTY_RESPONSE');
    }
  });

  // f. SDK throws → SDK_ERROR (never throws)
  it('returns SDK_ERROR when the underlying SDK throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('network failure'));

    const result = await generateStructuredOutput(schema, 'some prompt');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('SDK_ERROR');
    }
  });

  // g. Default temperature is 0.0
  it('passes temperature 0.0 by default', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":1}')
    );

    await generateStructuredOutput(schema, 'prompt');

    const call = mockGenerateContent.mock.calls[0]?.[0] as {
      config?: { temperature?: number };
    };
    expect(call?.config?.temperature).toBe(0.0);
  });

  // h. Custom temperature is forwarded
  it('forwards a custom temperature to the SDK', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":1}')
    );

    await generateStructuredOutput(schema, 'prompt', { temperature: 0.2 });

    const call = mockGenerateContent.mock.calls[0]?.[0] as {
      config?: { temperature?: number };
    };
    expect(call?.config?.temperature).toBe(0.2);
  });

  // i. maxOutputTokens is forwarded when provided
  it('forwards maxOutputTokens when provided', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":1}')
    );

    await generateStructuredOutput(schema, 'prompt', { maxOutputTokens: 512 });

    const call = mockGenerateContent.mock.calls[0]?.[0] as {
      config?: { maxOutputTokens?: number };
    };
    expect(call?.config?.maxOutputTokens).toBe(512);
  });

  // j. maxOutputTokens key is absent when not provided
  it('does not include maxOutputTokens when not provided', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":1}')
    );

    await generateStructuredOutput(schema, 'prompt');

    const call = mockGenerateContent.mock.calls[0]?.[0] as {
      config?: Record<string, unknown>;
    };
    expect(Object.prototype.hasOwnProperty.call(call?.config, 'maxOutputTokens')).toBe(false);
  });

  // k. responseMimeType is always 'application/json'
  it('always sends responseMimeType application/json', async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeTextResponse('{"answer":"yes","value":1}')
    );

    await generateStructuredOutput(schema, 'prompt');

    const call = mockGenerateContent.mock.calls[0]?.[0] as {
      config?: { responseMimeType?: string };
    };
    expect(call?.config?.responseMimeType).toBe('application/json');
  });

  // l. SCHEMA_VALIDATION raw field contains the original JSON text
  it('includes the raw response in SCHEMA_VALIDATION error', async () => {
    const badJson = '{"answer":"yes","value":"bad"}';
    mockGenerateContent.mockResolvedValueOnce(makeTextResponse(badJson));

    const result = await generateStructuredOutput(schema, 'prompt');

    expect(result.success).toBe(false);
    if (!result.success && result.error.kind === 'SCHEMA_VALIDATION') {
      expect(result.error.raw).toBe(badJson);
    }
  });
});
