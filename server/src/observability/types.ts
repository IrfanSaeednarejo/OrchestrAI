import type { SpecialistId } from '../tools/permissions.js';

export type TraceLevel = 'conversation' | 'router' | 'specialist' | 'tool' | 'llm';

export interface OrchestrAITraceMetadata {
  conversationId: string;
  userId?: string | null;
  threadId: string;
  domain?: string | null;
  specialist?: SpecialistId | string | null;
  intent?: string | null;
  workflowStatus?: string | null;
  verificationStatus?: string | null;
  handoffCount?: number;
  level: TraceLevel;
  environment: string;
}

export interface SanitizedTraceMetadata extends Record<string, unknown> {
  conversationId: string;
  userId: string | null;
  threadId: string;
  domain: string | null;
  specialist: string | null;
  intent: string | null;
  workflowStatus: string | null;
  verificationStatus: string | null;
  handoffCount: number;
  level: TraceLevel;
  environment: string;
}
