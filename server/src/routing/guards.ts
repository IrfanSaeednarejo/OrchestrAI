// src/routing/guards.ts
// Phase 8: Deterministic router safety guards.
// Evaluated before calling the LLM classifier. Ensures hard boundaries:
// 1. Handoff cap guard: auto-escalates when handoffCount >= MAX_HANDOFF_LIMIT (3).
// 2. Loop detection guard: detects circular agent bounce and escalates.
// 3. Resume guard: routes directly to returnTo when blocked verification is satisfied.

import { type SpecialistId } from '../tools/permissions.js';
import {
  type RoutingState,
  type ActiveWorkflowState,
  type IdentityState,
  type ReturnTo,
  type ConversationState,
} from '../state/conversation-state.js';
import { satisfiesVerification } from '../tools/types.js';
import { isValidSpecialistId } from './classifier/taxonomy.js';

export const DEFAULT_MAX_HANDOFFS = 3;

// ---------------------------------------------------------------------------
// Guard Decision Types
// ---------------------------------------------------------------------------

export type GuardOutcome =
  | {
      outcome: 'ESCALATE';
      reason: string;
    }
  | {
      outcome: 'RESUME';
      targetSpecialist: SpecialistId;
      returnTo: ReturnTo;
      reason: string;
    }
  | {
      outcome: 'PROCEED';
    };

// ---------------------------------------------------------------------------
// Guard 1: Handoff Count Cap
// ---------------------------------------------------------------------------

/**
 * Returns true if lateral handoffs have reached or exceeded the maximum limit.
 */
export function isHandoffCapExceeded(
  routing: RoutingState,
  maxHandoffs: number = DEFAULT_MAX_HANDOFFS
): boolean {
  return routing.handoffCount >= maxHandoffs;
}

// ---------------------------------------------------------------------------
// Guard 2: Loop Detection
// ---------------------------------------------------------------------------

/**
 * Detects circular ping-pong routing.
 * A loop is detected if the proposed target specialist has already been visited
 * AND the handoffCount is >= 2.
 */
export function isRoutingLoop(
  routing: RoutingState,
  proposedTarget: SpecialistId
): boolean {
  if (routing.handoffCount < 2) {
    return false;
  }

  // Ping-pong: immediate return to previous agent
  if (routing.previousAgent === proposedTarget) {
    return true;
  }

  // Cycle: agent already visited in history twice or more
  const visits = routing.history.filter((h) => h.toAgent === proposedTarget).length;
  return visits >= 2;
}

// ---------------------------------------------------------------------------
// Guard 3: Resume Active Workflow
// ---------------------------------------------------------------------------

/**
 * Checks if there is an active blocked workflow whose verification requirement
 * has now been satisfied, enabling an automatic resume to the originating specialist.
 */
export function checkResumePreconditions(
  activeWorkflow: ActiveWorkflowState | null,
  identity: IdentityState | null
): ReturnTo | null {
  if (!activeWorkflow || !activeWorkflow.returnTo) {
    return null;
  }

  const { blockedBy, returnTo } = activeWorkflow;

  // If no verification blocked it, it is free to resume
  if (!blockedBy) {
    return returnTo;
  }

  const currentStatus = identity?.status ?? 'UNVERIFIED';

  if (blockedBy === 'VERIFICATION_LIGHT') {
    if (satisfiesVerification(currentStatus, 'LIGHT')) {
      return returnTo;
    }
    return null;
  }

  if (blockedBy === 'VERIFICATION_FULL') {
    if (satisfiesVerification(currentStatus, 'FULL')) {
      return returnTo;
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Unified Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates all deterministic guards in priority order:
 * 1. Handoff cap -> ESCALATE
 * 2. Resume preconditions -> RESUME
 * 3. Fallback -> PROCEED to intent classification
 */
export function evaluatePreClassificationGuards(
  state: ConversationState,
  maxHandoffs: number = DEFAULT_MAX_HANDOFFS
): GuardOutcome {
  // 1. Handoff threshold guard
  if (isHandoffCapExceeded(state.routing, maxHandoffs)) {
    return {
      outcome: 'ESCALATE',
      reason: `Maximum lateral handoff limit reached (${maxHandoffs}). Escalating to human agent.`,
    };
  }

  // 2. Active workflow resume guard
  const resumeTarget = checkResumePreconditions(state.activeWorkflow, state.identity);
  if (resumeTarget && isValidSpecialistId(resumeTarget.agent)) {
    return {
      outcome: 'RESUME',
      targetSpecialist: resumeTarget.agent,
      returnTo: resumeTarget,
      reason: `Resuming pending workflow '${resumeTarget.workflowStep ?? 'unknown'}' after verification requirement satisfied.`,
    };
  }

  return { outcome: 'PROCEED' };
}
