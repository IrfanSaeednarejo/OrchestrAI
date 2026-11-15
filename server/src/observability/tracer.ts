import type { RunnableConfig } from '@langchain/core/runnables';
import { sanitizeMetadata, buildTags, buildRunName } from './metadata.js';
import type { OrchestrAITraceMetadata } from './types.js';

export interface TraceConfigOptions {
  extraTags?: string[];
  extraMetadata?: Record<string, unknown>;
}

/**
 * Creates a RunnableConfig with standardized metadata, tags, and runName
 * for LangGraph / LangSmith observability.
 */
export function createTraceConfig(
  metadata: OrchestrAITraceMetadata,
  extraConfig?: Partial<RunnableConfig>,
  options?: TraceConfigOptions
): RunnableConfig {
  const sanitized = sanitizeMetadata(metadata);
  const baseTags = buildTags(metadata);
  const tags = options?.extraTags ? [...baseTags, ...options.extraTags] : baseTags;
  const combinedMetadata = {
    ...sanitized,
    ...(options?.extraMetadata ?? {}),
  };

  const runName = buildRunName(metadata.level, metadata.specialist);

  return {
    runName,
    tags,
    metadata: combinedMetadata,
    configurable: {
      thread_id: metadata.threadId,
      conversationId: metadata.conversationId,
      ...(metadata.userId ? { userId: metadata.userId } : {}),
      ...(extraConfig?.configurable ?? {}),
    },
    ...(extraConfig?.callbacks ? { callbacks: extraConfig.callbacks } : {}),
    ...(extraConfig?.recursionLimit !== undefined ? { recursionLimit: extraConfig.recursionLimit } : {}),
  };
}
