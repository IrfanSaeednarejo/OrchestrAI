import { ToolResult, ToolMetadata } from './types.js';
import { recordToolExecution } from '../routing/events.js';

export type ToolExecutionContext = {
  agentExecutionId: string;
};

// Shallow-only redaction helper. Does not recursively redact nested objects.
function redact(obj: unknown, fields: string[] | undefined): unknown {
  if (!fields || fields.length === 0 || !obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const shallowCopy = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    if (field in shallowCopy) {
      shallowCopy[field] = '[REDACTED]';
    }
  }
  return shallowCopy;
}

export async function executeTool<T>(
  toolFn: (rawInput: unknown) => Promise<ToolResult<T>>,
  metadata: ToolMetadata,
  rawInput: unknown,
  context: ToolExecutionContext
): Promise<ToolResult<T>> {
  const startTime = Date.now();
  let result: ToolResult<T>;

  try {
    result = await toolFn(rawInput);
  } catch (error) {
    result = {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const duration = Date.now() - startTime;
  const status = result.success ? 'success' : 'failure';
  const errorMessage = result.success ? undefined : `${result.error.code}: ${result.error.message}`;

  const sanitizedInput = redact(rawInput, metadata.sensitiveInputFields) as Record<string, unknown> | undefined;
  
  // "when result.success is false, log result.error as-is (errors never contain sensitive fields in this codebase)."
  // The event signature takes `error?: string` which we populated.
  // The event signature takes `output?: Record<string, unknown>`.
  const sanitizedOutput = result.success 
    ? redact(result.data, metadata.sensitiveOutputFields) as Record<string, unknown> | undefined
    : undefined;

  try {
    await recordToolExecution({
      agentExecutionId: context.agentExecutionId,
      tool: metadata.name,
      input: sanitizedInput ?? undefined, // handles null case
      output: sanitizedOutput ?? undefined, // handles null case
      duration,
      status,
      error: errorMessage,
    });
  } catch (error) {
    console.error('Failed to log tool execution:', error);
  }

  return result;
}
