import { embedQuery } from './embeddings-client.js';
import { searchKnowledgeByEmbedding, KnowledgeDomain } from '../persistence/repositories/knowledge.repository.js';
import { z } from 'zod';
import { ToolResult } from '../tools/types.js';

export const retrieveKnowledgeSchema = z.object({
  query: z.string().min(1),
  domains: z.array(z.enum(['orders', 'payments', 'account'])).min(1),
  topK: z.number().int().min(1).max(5).default(3),
  minSimilarity: z.number().min(-1).max(1).optional(),
});

export type KnowledgeHit = {
  id: string;
  domain: KnowledgeDomain;
  documentType: string;
  topic: string;
  version: string;
  content: string;
  similarity: number;
};

export async function retrieveKnowledge(rawInput: unknown): Promise<ToolResult<KnowledgeHit[]>> {
  const parsed = retrieveKnowledgeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message }
    };
  }

  const { query, domains, topK, minSimilarity } = parsed.data;

  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (error) {
    return {
      success: false,
      error: { code: 'EMBEDDING_ERROR', message: error instanceof Error ? error.message : String(error) }
    };
  }

  try {
    const rows = await searchKnowledgeByEmbedding(embedding, domains as KnowledgeDomain[], topK);
    
    let hits: KnowledgeHit[] = rows.map(row => ({
      id: row.id,
      domain: row.domain,
      documentType: row.documentType,
      topic: row.topic,
      version: row.version,
      content: row.content,
      similarity: 1 - row.distance,
    }));

    if (typeof minSimilarity === 'number') {
      hits = hits.filter(hit => hit.similarity >= minSimilarity);
    }

    return {
      success: true,
      data: hits
    };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) }
    };
  }
}
