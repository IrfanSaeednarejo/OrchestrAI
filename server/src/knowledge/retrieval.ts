/**
 * server/src/knowledge/retrieval.ts
 * Implements Part C & D.10: Dual-branch hybrid retrieval with pgvector HNSW + FTS and RRF fusion.
 */

import { z } from 'zod';
import { embedQuery } from './embeddings-client.js';
import {
  searchHybridScopedCTE,
  searchKnowledgeByEmbedding,
} from '../persistence/repositories/knowledge.repository.js';
import { ToolResult } from '../tools/types.js';
import { logRetrievalExecutionSafely } from '../persistence/repositories/orchestration.repository.js';
import { getTurnContext, recordExecutedTool } from '../shared/turn-context.js';
import type { KnowledgeDomain } from '../persistence/db/schema.js';

export const retrieveKnowledgeSchema = z.object({
  query: z.string().min(1),
  domains: z.array(z.enum(['orders', 'payments', 'account'])).min(1),
  topK: z.number().int().min(1).max(5).default(3),
  minSimilarity: z.number().min(-1).max(1).optional(),
  topics: z.array(z.string().min(1)).min(1).optional(),
  conversationId: z.string().uuid().optional(),
  agentExecutionId: z.string().uuid().optional(),
});

export type KnowledgeHit = {
  id: string;
  domain: KnowledgeDomain;
  documentType: string;
  topic: string;
  sectionPath?: string;
  version: string;
  effectiveDate?: Date;
  content: string;
  similarity: number;
  relevanceScore: number;
};

export async function retrieveKnowledge(rawInput: unknown): Promise<ToolResult<KnowledgeHit[]>> {
  const parsed = retrieveKnowledgeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  const { query, domains, topK, minSimilarity, topics } = parsed.data;
  const domain = domains[0];
  if (!domain) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'No domain provided' },
    };
  }

  const topic = topics?.[0];
  const startTime = performance.now();

  let queryEmbedding: number[];
  const embedStart = performance.now();
  try {
    queryEmbedding = await embedQuery(query);
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'EMBEDDING_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  const embedMs = Math.round(performance.now() - embedStart);

  try {
    let hits: KnowledgeHit[] = [];

    if (topic) {
      // Phase 36 Step 4 (Layer B): Single-CTE hybrid retrieval (Dense + Sparse + RRF in 1 round-trip)
      const cteRows = await searchHybridScopedCTE(queryEmbedding, query, domain, topic, topK);

      if (cteRows.length > 0) {
        hits = cteRows.map((r) => {
          const sim = r.distance !== undefined ? 1 - r.distance : r.rrfScore;
          return {
            id: r.id,
            domain: r.domain,
            documentType: 'policy',
            topic: r.topic,
            sectionPath: r.sectionPath,
            version: r.version,
            effectiveDate: r.effectiveDate,
            content: r.content,
            similarity: sim,
            relevanceScore: r.rrfScore,
          };
        });
      }
    }

    // Fallback to legacy if no chunks matched or no topic provided
    // Guarded against 42P01 (table dropped when 0014_drop_knowledge_documents.sql runs)
    if (hits.length === 0) {
      try {
        const legacyRows = await searchKnowledgeByEmbedding(
          queryEmbedding,
          domains as KnowledgeDomain[],
          topK,
          topics
        );
        if (legacyRows.length > 0) {
          hits = legacyRows.map((row) => ({
            id: row.id,
            domain: row.domain,
            documentType: row.documentType,
            topic: row.topic,
            version: row.version,
            content: row.content,
            similarity: 1 - row.distance,
            relevanceScore: 1 - row.distance,
          }));
        }
      } catch (e: unknown) {
        if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '42P01') {
          // knowledge_documents dropped; return empty hits gracefully
          hits = [];
        } else {
          throw e;
        }
      }
    }

    if (typeof minSimilarity === 'number') {
      hits = hits.filter((hit) => hit.similarity >= minSimilarity);
    }

    const totalDurationMs = Math.round(performance.now() - startTime);

    // Turn context logging & telemetry (fire-and-forget, non-blocking)
    const convId = parsed.data.conversationId ?? getTurnContext()?.conversationId;
    const agentExecId = parsed.data.agentExecutionId;

    void logRetrievalExecutionSafely({
      conversationId: convId,
      agentExecutionId: agentExecId,
      domain,
      topic: topic ?? null,
      embedMs,
      searchMs: totalDurationMs,
      resultCount: hits.length,
      topSimilarity: hits.length > 0 ? hits[0]?.similarity ?? null : null,
    });

    recordExecutedTool({
      toolName: 'search_knowledge',
      args: { domain, topic, query },
      outcome: 'ALLOWED',
      specialist: domain,
    });

    return { success: true, data: hits };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REPOSITORY_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
