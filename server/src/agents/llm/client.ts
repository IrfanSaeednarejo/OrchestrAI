// src/agents/llm/client.ts
// Phase 7: Mockable Gemini LLM client wrapper for structured JSON output.
// All tool/routing nodes use temperature 0.0 (deterministic); customer-facing
// generation uses 0.2. The underlying GoogleGenAI instance is never exported —
// tests mock the entire '@google/genai' module.

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { config } from '../../shared/config.js';

// ---------------------------------------------------------------------------
// Module-level singleton — created once so tests can replace the whole module.
// ---------------------------------------------------------------------------

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Well-known model identifier used for all agent calls in this platform. */
export const DEFAULT_MODEL = 'gemini-2.5-flash' as const;

export interface LLMOptions {
  /** Sampling temperature (0.0 = fully deterministic). Defaults to 0.0. */
  temperature?: number;
  /** Hard cap on output tokens. Optional. */
  maxOutputTokens?: number;
}

/** Discriminated union returned from `generateStructuredOutput`. */
export type LLMResult<T> =
  | { success: true; data: T }
  | { success: false; error: LLMError };

/** Typed errors emitted by this wrapper (never raw SDK errors). */
export type LLMError =
  | { kind: 'EMPTY_RESPONSE'; message: string }
  | { kind: 'INVALID_JSON'; message: string; raw: string }
  | { kind: 'SCHEMA_VALIDATION'; message: string; raw: string }
  | { kind: 'SDK_ERROR'; message: string };

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Calls `gemini-2.5-flash` with `responseMimeType: 'application/json'` and
 * validates the response text against the supplied Zod schema.
 *
 * Returns a discriminated `LLMResult<T>` — never throws.
 */
export async function generateStructuredOutput<T>(
  schema: z.ZodType<T>,
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResult<T>> {
  let responseText: string | undefined;

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: options.temperature ?? 0.0,
        ...(options.maxOutputTokens !== undefined
          ? { maxOutputTokens: options.maxOutputTokens }
          : {}),
      },
    });

    responseText = response.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { kind: 'SDK_ERROR', message } };
  }

  if (responseText === undefined || responseText === null || responseText.trim() === '') {
    return {
      success: false,
      error: { kind: 'EMPTY_RESPONSE', message: 'Gemini returned an empty response.' },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return {
      success: false,
      error: { kind: 'INVALID_JSON', message: 'Response is not valid JSON.', raw: responseText },
    };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return {
      success: false,
      error: {
        kind: 'SCHEMA_VALIDATION',
        message: validated.error.message,
        raw: responseText,
      },
    };
  }

  return { success: true, data: validated.data };
}
