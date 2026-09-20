import { z } from 'zod';
import { ToolResult, ToolMetadata } from '../types.js';
import { retrieveKnowledge } from '../../knowledge/retrieval.js';

// ---------------------------------------------------------------------------
// Similarity threshold
// ---------------------------------------------------------------------------

/**
 * Provisional similarity floor, calibrated from the 6-query Step 4 probe:
 *   noise floor (unrelated query, all domains) : ~0.50
 *   wrong-domain scoped query                  : ~0.57
 *   genuine on-topic hits                      : >= 0.68
 * To be recalibrated in the Phase 15 evaluation.
 * Not exposed as tool input — injected server-side only.
 */
export const MIN_SIMILARITY = 0.60;

// ---------------------------------------------------------------------------
// search_knowledge
// ---------------------------------------------------------------------------

export const SearchKnowledgeInputSchema = z.object({
  query: z.string().min(1),
  // `domains` is injected server-side by the specialist configuration,
  // never model-generated. Validated here for defence-in-depth.
  domains: z.array(z.enum(['orders', 'payments', 'account'])).min(1),
  topK: z.number().int().min(1).max(5).default(3),
});

export const SearchKnowledgeOutputSchema = z.array(
  z.object({
    id: z.string(),
    domain: z.enum(['orders', 'payments', 'account']),
    documentType: z.string(),
    topic: z.string(),
    version: z.string(),
    content: z.string(),
    similarity: z.number(),
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

  // Pass through to retrieveKnowledge, injecting minSimilarity server-side.
  const result = await retrieveKnowledge({
    query: parsed.data.query,
    domains: parsed.data.domains,
    topK: parsed.data.topK,
    minSimilarity: MIN_SIMILARITY,
  });

  if (!result.success) {
    return result;
  }

  return { success: true, data: result.data as SearchKnowledgeOutput };
}

export const searchKnowledgeMetadata: ToolMetadata = {
  name: 'search_knowledge',
  requiredVerification: 'NONE',
};
