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
export const DEFAULT_MODEL = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite') as string;

export interface LLMOptions {
  /** Sampling temperature (0.0 = fully deterministic). Defaults to 0.0. */
  temperature?: number;
  /** Hard cap on output tokens. Optional. */
  maxOutputTokens?: number;
  /** Timeout in milliseconds (default: 10_000ms). */
  timeoutMs?: number;
  /** Max retries for transient errors (default: 1). */
  maxRetries?: number;
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

function isRetryableLLMError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('etimedout') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('network')
  );
}

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
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRetries = options.maxRetries ?? 1;

  let responseText: string | undefined;
  let lastError: unknown;
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
    try {
      const callPromise = ai.models.generateContent({
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

      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`LLM call timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      try {
        const response = await Promise.race([callPromise, timeoutPromise]);
        responseText = response.text;
        lastError = undefined;
        break;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err) {
      lastError = err;
      if (attempts <= maxRetries && isRetryableLLMError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempts - 1)));
        continue;
      }
      break;
    }
  }

  if (lastError !== undefined) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
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
