// src/knowledge/scoped-retrieval.ts
import { retrieveKnowledge, KnowledgeHit } from './retrieval.js';
import { MIN_SIMILARITY } from '../tools/queries/knowledge.tools.js';
import { getKnowledgeScope, SpecialistName } from './specialist-scope.js';
import { ToolResult } from '../tools/types.js';

export type ScopedSearchInput = { query: string; topK?: number };

export async function searchKnowledgeForSpecialist(
  specialist: SpecialistName,
  input: ScopedSearchInput
): Promise<ToolResult<KnowledgeHit[]>> {
  const scope = getKnowledgeScope(specialist);

  // Short-circuit before calling retrieveKnowledge or embedQuery
  if (scope === null) {
    return {
      success: false,
      error: {
        code: 'NO_KNOWLEDGE_ACCESS',
        message: `Specialist '${specialist}' has no RAG permission per the locked RAG Permission Matrix.`,
      },
    };
  }

  return retrieveKnowledge({
    query: input.query,
    domains: [scope.domain],
    topics: [scope.topic],
    topK: input.topK ?? 3,
    minSimilarity: MIN_SIMILARITY,
  });
}
