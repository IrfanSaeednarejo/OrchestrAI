// src/tools/gated-execution.ts
import { evaluateGate, GateDecision } from './gate.js';
import { SpecialistId } from './permissions.js';
import { executeTool, ToolExecutionContext } from './execution.js';
import { ToolResult, ToolMetadata } from './types.js';
import { IdentityState } from '../state/conversation-state.js';
import { recordToolExecution } from '../routing/events.js';

export type GatedToolResult<T> = ToolResult<T> & { gate: GateDecision };

export async function gatedExecuteTool<T>(
  toolFn: (rawInput: unknown) => Promise<ToolResult<T>>,
  metadata: ToolMetadata,
  rawInput: unknown,
  context: ToolExecutionContext & { specialist: SpecialistId; identity: IdentityState | null }
): Promise<GatedToolResult<T>> {
  const decision = evaluateGate({ tool: metadata, specialist: context.specialist, identity: context.identity });

  if (decision.outcome === 'ALLOWED') {
    const result = await executeTool(toolFn, metadata, rawInput, context);
    return { ...result, gate: decision };
  }

  // BLOCKED or DENIED
  let errorMessage: string;
  let errorCode: string;

  if (decision.outcome === 'BLOCKED') {
    errorCode = 'VERIFICATION_REQUIRED';
    errorMessage = `Tool '${metadata.name}' requires ${decision.required} verification (current: ${decision.current}).`;
  } else {
    // DENIED
    errorCode = 'TOOL_NOT_PERMITTED';
    errorMessage = `Specialist '${decision.specialist}' is not permitted to call '${decision.tool}'.`;
  }

  const errorResult = {
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
    }
  };

  try {
    await recordToolExecution({
      agentExecutionId: context.agentExecutionId,
      tool: metadata.name,
      input: undefined,
      output: undefined,
      duration: 0,
      status: 'failure',
      error: `${errorCode}: ${errorMessage}`,
    });
  } catch (error) {
    console.error('Failed to log tool execution:', error);
  }

  return { ...errorResult, gate: decision };
}
