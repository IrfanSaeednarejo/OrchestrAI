// src/agents/handoff/validation.ts
// Phase 7: Zod schema and helpers for HandoffRequest validation.
// buildHandoffRequest validates and returns the payload (throws ZodError on failure).
// parseHandoffRequest safely parses unknown input (useful for LLM output).

import { z } from 'zod';
import { SPECIALIST_IDS } from '../../tools/permissions.js';
import type { HandoffRequest } from './types.js';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

/**
 * Strict Zod schema for HandoffRequest.
 * Extra fields are stripped (`.strip()` is Zod's default for objects).
 * Confidence must be in [0, 1] inclusive.
 */
export const HandoffRequestSchema = z.object({
  sourceAgent: z.enum(SPECIALIST_IDS),
  handoffReason: z.string().min(1, 'handoffReason must not be empty'),
  detectedIntent: z.string().nullable(),
  recommendedDomain: z.string().min(1, 'recommendedDomain must not be empty'),
  relevantContext: z.record(z.string(), z.unknown()),
  attemptedActions: z.array(z.string()),
  confidence: z
    .number()
    .min(0, 'confidence must be >= 0')
    .max(1, 'confidence must be <= 1'),
});

// Verify the schema output type is assignable to HandoffRequest at compile time.
// This guard runs at module load in TypeScript strict mode; it is a type assertion only.
type _AssertSchemaMatchesType = z.infer<typeof HandoffRequestSchema> extends HandoffRequest
  ? HandoffRequest extends z.infer<typeof HandoffRequestSchema>
    ? true
    : never
  : never;
const _typeCheck: _AssertSchemaMatchesType = true;
void _typeCheck; // suppress unused-variable lint

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates `input` against `HandoffRequestSchema` and returns a typed
 * `HandoffRequest`.  Throws a `ZodError` if validation fails.
 *
 * Use this when you have a strongly-typed object and want to assert correctness
 * (e.g. inside a specialist node before emitting a handoff).
 */
export function buildHandoffRequest(input: HandoffRequest): HandoffRequest {
  return HandoffRequestSchema.parse(input);
}

/**
 * Safely parses an `unknown` value (e.g. raw LLM JSON output) into a
 * `HandoffRequest`.  Returns a discriminated result object — never throws.
 *
 * Unknown extra fields are stripped by Zod's default object behaviour.
 */
export function parseHandoffRequest(raw: unknown): ReturnType<typeof HandoffRequestSchema.safeParse> {
  return HandoffRequestSchema.safeParse(raw);
}
