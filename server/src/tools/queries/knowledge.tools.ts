/**
 * server/src/tools/queries/knowledge.tools.ts
 * Implements Part D.12: Extended search_knowledge schema with section, version,
 * effectiveDate, and relevanceScore (content and backward compatibility preserved).
 */

import { z } from 'zod';
import { ToolResult, ToolMetadata } from '../types.js';
import { retrieveKnowledge } from '../../knowledge/retrieval.js';

export const MIN_SIMILARITY = 0.6;

export const SearchKnowledgeInputSchema = z.object({
  query: z.string().min(1),
  domains: z.array(z.enum(['orders', 'payments', 'account'])).min(1),
  topK: z.number().int().min(1).max(5).default(3),
  topics: z.array(z.string().min(1)).optional(),
});

export const SearchKnowledgeOutputSchema = z.array(
  z.object({
    id: z.string(),
    domain: z.enum(['orders', 'payments', 'account']),
    documentType: z.string(),
    topic: z.string(),
    sectionPath: z.string().optional(),
    version: z.string(),
    effectiveDate: z.date().optional(),
    content: z.string(),
    similarity: z.number().optional(),
    relevanceScore: z.number().optional(),
  })
);

export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;
export type SearchKnowledgeOutput = z.infer<typeof SearchKnowledgeOutputSchema>;

export async function searchKnowledge(
  rawInput: unknown
): Promise<ToolResult<SearchKnowledgeOutput>> {
  const parsed = SearchKnowledgeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  const result = await retrieveKnowledge({
    query: parsed.data.query,
    domains: parsed.data.domains,
    topK: parsed.data.topK,
    minSimilarity: MIN_SIMILARITY,
    topics: parsed.data.topics,
  });

  if (!result.success) {
    return result;
  }

  const mapped = result.data.map((item) => ({
    id: item.id,
    domain: item.domain,
    documentType: item.documentType,
    topic: item.topic,
    sectionPath: item.sectionPath,
    version: item.version,
    effectiveDate: item.effectiveDate,
    content: item.content,
    similarity: item.similarity,
    relevanceScore: item.relevanceScore,
  }));

  return { success: true, data: mapped };
}

export const searchKnowledgeMetadata: ToolMetadata = {
  name: 'search_knowledge',
  requiredVerification: 'NONE',
};
