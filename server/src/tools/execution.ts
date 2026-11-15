import { ToolResult, ToolMetadata } from './types.js';
import { recordToolExecution } from '../routing/events.js';

export type ToolRetryConfig = {
  maxRetries?: number;
  retryableCodes?: readonly string[];
  backoffMs?: number;
};

export type ToolExecutionContext = {
  agentExecutionId: string;
  retryConfig?: ToolRetryConfig;
};

export const DEFAULT_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK_ERROR',
  'DATABASE_ERROR',
] as const;

export function isRetryableError(
  code: string,
  retryableCodes: readonly string[] = DEFAULT_RETRYABLE_CODES
): boolean {
  return retryableCodes.includes(code);
}

// Recursive redaction helper for objects and arrays of objects.
function redact(obj: unknown, fields: string[] | undefined): unknown {
  if (!fields || fields.length === 0 || !obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item, fields));
  }

  const copy = { ...(obj as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    if (fields.includes(key)) {
      copy[key] = '[REDACTED]';
    } else if (copy[key] && typeof copy[key] === 'object') {
      copy[key] = redact(copy[key], fields);
    }
  }
  return copy;
}

export async function executeTool<T>(
  toolFn: (rawInput: unknown) => Promise<ToolResult<T>>,
  metadata: ToolMetadata,
  rawInput: unknown,
  context: ToolExecutionContext
): Promise<ToolResult<T>> {
  const startTime = Date.now();
  const maxRetries = context.retryConfig?.maxRetries ?? 1;
  const retryableCodes = context.retryConfig?.retryableCodes ?? DEFAULT_RETRYABLE_CODES;
  const backoffMs = context.retryConfig?.backoffMs ?? 0;

  let result: ToolResult<T> = {
    success: false,
    error: {
      code: 'UNEXPECTED_ERROR',
      message: 'Tool execution did not produce a result',
    },
  };
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
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

    if (result.success) {
      break;
    }

    // Check if error is retryable and we have retries remaining
    const canRetry = attempts <= maxRetries && isRetryableError(result.error.code, retryableCodes);
    if (!canRetry) {
      break;
    }

    if (backoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  const duration = Date.now() - startTime;
  const status = result.success ? 'success' : 'failure';
  let errorMessage: string | undefined;
  if (!result.success) {
    const retryNote = attempts > 1 ? ` (failed after ${attempts} attempts)` : '';
    errorMessage = `${result.error.code}: ${result.error.message}${retryNote}`;
  }

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
