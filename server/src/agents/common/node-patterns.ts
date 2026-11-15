// src/agents/common/node-patterns.ts
// Phase 7: Reusable node execution patterns for specialist subgraphs.
// All tool invocations in agent nodes must pass through gatedExecuteTool.
// This module extracts the tripartite ALLOWED / BLOCKED / DENIED pattern
// established in Phase 6 (phase6-gate-graph.ts) into a shared utility so
// every future specialist subgraph can re-use it without duplication.

import { gatedExecuteTool } from '../../tools/gated-execution.js';
import { buildBlockedWorkflowUpdate } from '../../state/blocked-workflow.js';
import type { SpecialistId } from '../../tools/permissions.js';
import type { ToolMetadata, ToolResult } from '../../tools/types.js';
import type {
  IdentityState,
  ConversationStateUpdate,
  ReturnTo,
} from '../../state/conversation-state.js';

// ---------------------------------------------------------------------------
// Parameter contract
// ---------------------------------------------------------------------------

export interface ExecuteNodeToolParams {
  /** Tool function: validates input and returns a ToolResult. */
  toolFn: (rawInput: unknown) => Promise<ToolResult<unknown>>;
  /** Static tool descriptor (name + verification requirement). */
  metadata: ToolMetadata;
  /** Raw input passed to the tool (after argument generation). */
  rawInput: unknown;
  /** Agent execution row id for telemetry. */
  agentExecutionId: string;
  /** Specialist calling the tool (used for allowlist check). */
  specialist: SpecialistId;
  /** Current identity from ConversationState (may be null = UNVERIFIED). */
  identity: IdentityState | null;
  /** Where to route back after verification resolves a BLOCKED outcome. */
  returnTo?: ReturnTo;
  /** Workflow tracking: id of the current workflow (nullable). */
  workflowId?: string | null;
  /** Workflow tracking: human-readable intent that started this workflow. */
  originatingIntent?: string | null;
  /** Workflow tracking: current step label (defaults to metadata.name). */
  currentStep?: string | null;
  /** Context the resuming specialist needs to replay the blocked action. */
  resumeContext?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Core utility
// ---------------------------------------------------------------------------

/**
 * Executes a single tool call through the access-control gate and returns
 * the appropriate `ConversationStateUpdate`:
 *
 * - **ALLOWED** → `{ workflowStatus: 'COMPLETED' }`
 * - **BLOCKED** → `{ ...buildBlockedWorkflowUpdate(...), workflowStatus: 'WAITING_FOR_USER_INPUT' }`
 * - **DENIED**  → `{ workflowStatus: 'FAILED' }`
 *
 * Never throws. The tool body itself is wrapped by `gatedExecuteTool` which
 * also never throws — all error paths return `ToolResult` failures.
 */
export async function executeNodeTool(
  params: ExecuteNodeToolParams
): Promise<ConversationStateUpdate> {
  const result = await gatedExecuteTool(
    params.toolFn,
    params.metadata,
    params.rawInput,
    {
      agentExecutionId: params.agentExecutionId,
      specialist: params.specialist,
      identity: params.identity,
    }
  );

  if (result.gate.outcome === 'ALLOWED') {
    return { workflowStatus: 'COMPLETED' };
  }

  if (result.gate.outcome === 'BLOCKED') {
    const returnTo: ReturnTo = params.returnTo ?? {
      domain: params.specialist,
      agent: params.specialist,
      workflowStep: params.metadata.name,
    };

    const blockedUpdate = buildBlockedWorkflowUpdate({
      decision: result.gate,
      returnTo,
      workflowId: params.workflowId ?? null,
      originatingIntent: params.originatingIntent ?? null,
      currentStep: params.currentStep ?? params.metadata.name,
      resumeContext: params.resumeContext ?? null,
    });

    return {
      ...blockedUpdate,
      workflowStatus: 'WAITING_FOR_USER_INPUT',
    };
  }

  // DENIED
  return { workflowStatus: 'FAILED' };
}

