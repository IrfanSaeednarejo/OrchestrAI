// src/knowledge/specialist-scope.ts
//
// Locked mapping from the RAG Permission Matrix (decisions-and-principles.md).
// This is a v1 one-document-per-specialist simplification: each specialist can
// access at most one {domain, topic} pair. The topic strings must exactly match
// the values used in documents.ts — do not invent new ones.

import type { KnowledgeDomain } from '../persistence/repositories/knowledge.repository.js';

export type SpecialistName =
  | 'order_tracking'
  | 'returns'
  | 'payment'
  | 'refund'
  | 'account_access'
  | 'profile';

export type KnowledgeScope = { domain: KnowledgeDomain; topic: string } | null;

// Record (not Partial<Record>) — omitting any specialist is a compile error.
const SPECIALIST_KNOWLEDGE_SCOPE: Record<SpecialistName, KnowledgeScope> = {
  order_tracking: { domain: 'orders', topic: 'shipping' },
  returns:        { domain: 'orders', topic: 'returns' },
  payment:        { domain: 'payments', topic: 'payments' },
  refund:         { domain: 'payments', topic: 'refunds' },
  account_access: { domain: 'account', topic: 'account_security' },
  profile:        null,
};

export { SPECIALIST_KNOWLEDGE_SCOPE };

export function getKnowledgeScope(specialist: SpecialistName): KnowledgeScope {
  return SPECIALIST_KNOWLEDGE_SCOPE[specialist];
}
