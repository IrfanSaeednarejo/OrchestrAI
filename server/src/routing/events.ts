import {
  type NewRoutingHistory,
  type NewAgentExecution,
  type NewToolExecution,
  type AgentExecution,
  type ToolExecution,
  createRoutingHistoryEntry,
  createAgentExecution,
  createToolExecution,
} from '../persistence/repositories/orchestration.repository.js';
import type { ConversationState } from '../state/conversation-state.js';

// ---------------------------------------------------------------------------
// RoutingEvent — produces BOTH a state update and an operational record.
// ---------------------------------------------------------------------------

export type RoutingDecisionType =
  | 'INITIAL_ROUTE'
  | 'RE_ROUTE'
  | 'HANDOFF'
  | 'ESCALATION'
  | 'FALLBACK';

export type RoutingEvent = {
  conversationId: string;
  sourceAgent: string | null;     // null for the very first route
  destinationAgent: string;
  intent: string | null;
  decisionType: RoutingDecisionType;
  reason: string;
  newDomain?: string;             // Only present when this routing event changes the active domain
};

/**
 * Pure function — no I/O. Maps a RoutingEvent to the NewRoutingHistory shape
 * expected by the repository. Timestamp is handled by the table default.
 */
export function toRoutingHistoryRecord(event: RoutingEvent): NewRoutingHistory {
  return {
    conversationId: event.conversationId,
    sourceAgent: event.sourceAgent,
    destinationAgent: event.destinationAgent,
    intent: event.intent,
    decisionType: event.decisionType,
    reason: event.reason,
  };
}

/**
 * Pure function — no I/O. Maps a RoutingEvent to a partial ConversationState
 * update that matches Step 2's reducer semantics exactly.
 *
 * handoffCount delta reasoning: only HANDOFF and RE_ROUTE represent an
 * agent-to-agent handoff; INITIAL_ROUTE is the first assignment (not a
 * handoff), and ESCALATION/FALLBACK are control-flow decisions, not lateral
 * handoffs — those are intentionally excluded from handoff counting.
 */
export function toRoutingStateUpdate(event: RoutingEvent): Partial<ConversationState> {
  const isHandoff =
    event.decisionType === 'HANDOFF' || event.decisionType === 'RE_ROUTE';

  const update: Partial<ConversationState> = {
    routing: {
      currentAgent: event.destinationAgent,
      previousAgent: event.sourceAgent,
      history: [
        {
          fromAgent: event.sourceAgent,
          toAgent: event.destinationAgent,
          reason: event.reason,
          timestamp: new Date().toISOString(),
        },
      ],
      visitedAgents: [event.destinationAgent],
      ...(isHandoff ? { handoffCount: 1 } : {}),
    },
  };

  // Only emit currentDomain if the event explicitly provides a new domain.
  // Omitting the key entirely prevents the overwrite reducer from clobbering
  // the existing domain when this event doesn't change it.
  if (event.newDomain !== undefined) {
    update.currentDomain = event.newDomain;
  }

  // Only emit currentIntent if the event carries a non-null intent.
  if (event.intent !== null) {
    update.currentIntent = event.intent;
  }

  return update;
}

/**
 * Coordinates the two concerns: persists the operational log record first,
 * then returns the pure state update.
 *
 * Error policy: errors from the repository are NOT caught here. Callers
 * (graph nodes) are responsible for deciding their own error-handling policy
 * (e.g. log and proceed with the state update anyway, or halt). This function
 * does not make that decision for them.
 *
 * Ordering: the state update is only returned AFTER the repository write
 * succeeds. If the write throws, the caller receives nothing — it never gets a
 * partial state update for a routing event that failed to log. This is the
 * intentionally simpler behaviour for a portfolio-scale project; a production
 * system might use an outbox pattern or explicit retry queue instead.
 */
export async function recordRoutingEvent(
  event: RoutingEvent
): Promise<Partial<ConversationState>> {
  await createRoutingHistoryEntry(toRoutingHistoryRecord(event));
  return toRoutingStateUpdate(event);
}

// ---------------------------------------------------------------------------
// AgentExecutionEvent — operational record ONLY, no state update.
// ---------------------------------------------------------------------------

export type AgentExecutionEvent = {
  conversationId: string;
  agent: string;
  inputSummary?: string;
  outputSummary?: string;
  duration?: number;
  status: 'success' | 'failure';
  error?: string;
};

/**
 * Pure function — no I/O.
 */
export function toAgentExecutionRecord(event: AgentExecutionEvent): NewAgentExecution {
  return {
    conversationId: event.conversationId,
    agent: event.agent,
    inputSummary: event.inputSummary ?? null,
    outputSummary: event.outputSummary ?? null,
    duration: event.duration ?? null,
    status: event.status,
    error: event.error ?? null,
  };
}

/**
 * Persists the agent execution record and returns the created row.
 *
 * Intentionally produces NO ConversationState update. Agent execution history
 * belongs exclusively in the operational Postgres store (agent_executions
 * table), not in the in-flight LangGraph state. If an agent's output needs to
 * become runtime state, that is an explicit, separate decision made by the
 * calling node.
 */
export async function recordAgentExecution(
  event: AgentExecutionEvent
): Promise<AgentExecution> {
  return createAgentExecution(toAgentExecutionRecord(event));
}

// ---------------------------------------------------------------------------
// ToolExecutionEvent — operational record ONLY, no state update.
// ---------------------------------------------------------------------------

export type ToolExecutionEvent = {
  agentExecutionId: string;
  tool: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration?: number;
  status: 'success' | 'failure';
  error?: string;
};

/**
 * Pure function — no I/O.
 */
export function toToolExecutionRecord(event: ToolExecutionEvent): NewToolExecution {
  return {
    agentExecutionId: event.agentExecutionId,
    tool: event.tool,
    input: event.input ?? null,
    output: event.output ?? null,
    duration: event.duration ?? null,
    status: event.status,
    error: event.error ?? null,
  };
}

/**
 * Persists the tool execution record and returns the created row.
 *
 * Intentionally produces NO ConversationState update. If a tool's result
 * needs to become runtime state, that is a SEPARATE, explicit decision made by
 * the calling node (e.g. it might call recordToolExecution AND separately
 * return a state update containing the tool result). This function handles the
 * observability/logging concern only — it never infers a state update from a
 * tool result automatically.
 */
export async function recordToolExecution(
  event: ToolExecutionEvent
): Promise<ToolExecution> {
  return createToolExecution(toToolExecutionRecord(event));
}
