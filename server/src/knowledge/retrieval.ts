/**
 * server/src/knowledge/retrieval.ts
 * Implements Part C & D.10: Dual-branch hybrid retrieval with pgvector HNSW + FTS and RRF fusion.
 */

import { z } from 'zod';
import { embedQuery } from './embeddings-client.js';
import {
  searchDenseScoped,
  searchSparseScoped,
  searchKnowledgeByEmbedding,
} from '../persistence/repositories/knowledge.repository.js';
import { fuseRrf, RankedKnowledgeHit } from './rrf-reranker.js';
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
      // Production path: scoped dual-branch retrieval with RRF fusion
      const [denseHits, sparseHits] = await Promise.all([
        searchDenseScoped(queryEmbedding, domain, topic, topK),
        searchSparseScoped(query, domain, topic, topK),
      ]);

      if (denseHits.length > 0 || sparseHits.length > 0) {
        const fused: RankedKnowledgeHit[] = fuseRrf(denseHits, sparseHits, 60, topK);
        const denseDistanceMap = new Map<string, number>();
        for (const d of denseHits) {
          if (d.distance !== undefined) {
            denseDistanceMap.set(d.id, Number(d.distance));
          }
        }

        hits = fused.map((f) => {
          const dist = denseDistanceMap.get(f.id);
          const sim = dist !== undefined ? 1 - dist : f.rrfScore;
          return {
            id: f.id,
            domain: f.domain,
            documentType: 'policy',
            topic: f.topic,
            sectionPath: f.sectionPath,
            version: f.version,
            effectiveDate: f.effectiveDate,
            content: f.content,
            similarity: sim,
            relevanceScore: f.rrfScore,
          };
        });
      }
    }

    // Fallback to legacy if no chunks matched or no topic provided
    if (hits.length === 0) {
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
    }

    if (typeof minSimilarity === 'number') {
      hits = hits.filter((hit) => hit.similarity >= minSimilarity);
    }

    const totalDurationMs = Math.round(performance.now() - startTime);

    // Turn context logging & telemetry
    const convId = parsed.data.conversationId ?? getTurnContext()?.conversationId;
    const agentExecId = parsed.data.agentExecutionId;

    await logRetrievalExecutionSafely({
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
