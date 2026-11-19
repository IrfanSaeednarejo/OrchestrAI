/**
 * server/src/knowledge/rrf-reranker.ts
 * Implements Part C (Reciprocal Rank Fusion k=60).
 */

import { KnowledgeSearchRow } from '../persistence/repositories/knowledge.repository.js';

export interface RankedKnowledgeHit extends KnowledgeSearchRow {
  rrfScore: number;
  denseRank: number | null;
  sparseRank: number | null;
}

export function fuseRrf(
  denseHits: KnowledgeSearchRow[],
  sparseHits: KnowledgeSearchRow[],
  k = 60,
  topK = 3
): RankedKnowledgeHit[] {
  const scoreMap = new Map<
    string,
    {
      row: KnowledgeSearchRow;
      score: number;
      denseRank: number | null;
      sparseRank: number | null;
    }
  >();

  // Process dense hits
  denseHits.forEach((hit, idx) => {
    const rank = idx + 1;
    const rrfContribution = 1.0 / (k + rank);

    const existing = scoreMap.get(hit.id);
    if (existing) {
      existing.score += rrfContribution;
      existing.denseRank = rank;
    } else {
      scoreMap.set(hit.id, {
        row: hit,
        score: rrfContribution,
        denseRank: rank,
        sparseRank: null,
      });
    }
  });

  // Process sparse hits
  sparseHits.forEach((hit, idx) => {
    const rank = idx + 1;
    const rrfContribution = 1.0 / (k + rank);

    const existing = scoreMap.get(hit.id);
    if (existing) {
      existing.score += rrfContribution;
      existing.sparseRank = rank;
    } else {
      scoreMap.set(hit.id, {
        row: hit,
        score: rrfContribution,
        denseRank: null,
        sparseRank: rank,
      });
    }
  });

  // Convert to array and sort descending by combined RRF score
  const ranked = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => ({
      ...item.row,
      rrfScore: item.score,
      denseRank: item.denseRank,
      sparseRank: item.sparseRank,
    }));

  return ranked;
}
