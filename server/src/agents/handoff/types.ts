// src/agents/handoff/types.ts
// Phase 7: HandoffRequest — the typed contract passed between specialists
// and the parent router whenever a specialist cannot resolve an intent and
// must hand off to another domain. Validated strictly by Zod in validation.ts.

import type { SpecialistId } from '../../tools/permissions.js';

/**
 * Payload emitted by a specialist node when it determines that another
 * specialist is better suited to continue the conversation.
 *
 * Shape approved in OPEN-DECISIONS #6 (2026-11-05).
 */
export interface HandoffRequest {
  /** The specialist that is *giving up* ownership of the conversation turn. */
  sourceAgent: SpecialistId;

  /** Human-readable explanation of why the handoff was initiated. */
  handoffReason: string;

  /**
   * The user's inferred intent at the time of handoff, or null if the
   * intent could not be determined with sufficient confidence.
   */
  detectedIntent: string | null;

  /**
   * The recommended target domain (e.g. `'payment'`, `'returns'`).
   * This is a suggestion — the router makes the final routing decision.
   */
  recommendedDomain: string;

  /**
   * Arbitrary key/value context that the receiving specialist may need
   * (e.g. order id, partial tool results, user preferences).
   */
  relevantContext: Record<string, unknown>;

  /**
   * Actions already attempted by the source specialist, so the receiver
   * does not duplicate work (e.g. `['get_order', 'check_return_eligibility']`).
   */
  attemptedActions: string[];

  /**
   * Routing confidence score in [0, 1].
   * 1.0 = fully certain of the target domain; 0.0 = complete uncertainty.
   */
  confidence: number;
}
