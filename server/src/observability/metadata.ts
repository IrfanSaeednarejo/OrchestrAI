import type { OrchestrAITraceMetadata, SanitizedTraceMetadata, TraceLevel } from './types.js';

/**
 * Sanitizes trace metadata to prevent PII, raw verification codes,
 * or credentials from appearing in observability platforms.
 */
export function sanitizeMetadata(metadata: OrchestrAITraceMetadata): SanitizedTraceMetadata {
  return {
    conversationId: metadata.conversationId,
    userId: metadata.userId ?? null,
    threadId: metadata.threadId,
    domain: metadata.domain ?? null,
    specialist: metadata.specialist ?? null,
    intent: metadata.intent ?? null,
    workflowStatus: metadata.workflowStatus ?? null,
    verificationStatus: metadata.verificationStatus ?? null,
    handoffCount: metadata.handoffCount ?? 0,
    level: metadata.level,
    environment: metadata.environment,
  };
}

/**
 * Formats structured tags for filtering runs in LangSmith.
 */
export function buildTags(metadata: OrchestrAITraceMetadata): string[] {
  const tags: string[] = ['orchestrai', `env:${metadata.environment}`, `level:${metadata.level}`];

  if (metadata.domain) {
    tags.push(`domain:${metadata.domain}`);
  }
  if (metadata.specialist) {
    tags.push(`specialist:${metadata.specialist}`);
  }
  if (metadata.intent) {
    tags.push(`intent:${metadata.intent}`);
  }
  if (metadata.workflowStatus) {
    tags.push(`workflow:${metadata.workflowStatus}`);
  }
  if (metadata.verificationStatus) {
    tags.push(`verification:${metadata.verificationStatus}`);
  }

  return tags;
}

/**
 * Builds standardized run names for LangGraph and LangSmith traces.
 */
export function buildRunName(level: TraceLevel, specialist?: string | null): string {
  switch (level) {
    case 'conversation':
      return 'OrchestrAI:ParentGraph';
    case 'router':
      return 'OrchestrAI:Router';
    case 'specialist':
      return specialist ? `OrchestrAI:Specialist:${specialist}` : 'OrchestrAI:Specialist';
    case 'tool':
      return 'OrchestrAI:Tool';
    case 'llm':
      return 'OrchestrAI:LLM';
    default:
      return 'OrchestrAI:Trace';
  }
}
