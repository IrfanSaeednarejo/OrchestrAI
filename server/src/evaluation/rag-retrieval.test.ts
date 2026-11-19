import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assertEvalSetNotStale, GoldenDataset } from './rag-eval-resolver.js';
import { retrieveKnowledge } from '../knowledge/retrieval.js';
import { getActiveScopedChunkCount } from '../persistence/repositories/knowledge.repository.js';
import { KnowledgeDomain } from '../persistence/db/schema.js';

describe('RAG Retrieval & Evaluation Suite', () => {
  const goldenDatasetPath = path.resolve(process.cwd(), '../eval/knowledge-golden-dataset.json');
  let goldenDataset: GoldenDataset;

  try {
    const raw = fs.readFileSync(goldenDatasetPath, 'utf8');
    goldenDataset = JSON.parse(raw);
  } catch {
    // Fallback if running from repo root
    const fallbackPath = path.resolve(process.cwd(), 'eval/knowledge-golden-dataset.json');
    goldenDataset = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  }

  describe('Bidirectional Staleness Guard', () => {
    it('passes staleness check against currently ingested document versions in DB', async () => {
      const { warnings } = await assertEvalSetNotStale(goldenDataset);
      expect(warnings).toHaveLength(0);
    });

    it('rejects with error on forward drift when database has newer version than eval set', async () => {
      const driftedSet: GoldenDataset = {
        ...goldenDataset,
        createdAgainstDocVersions: {
          ...goldenDataset.createdAgainstDocVersions,
          'pol-orders-returns-001': '0.9.0', // DB has 1.0.0 > 0.9.0
        },
      };

      await expect(assertEvalSetNotStale(driftedSet)).rejects.toThrow(
        /STALE_EVAL_SET_FORWARD_DRIFT/
      );
    });

    it('warns (does not throw) on backward drift when database has older version than eval set', async () => {
      const driftedSet: GoldenDataset = {
        ...goldenDataset,
        createdAgainstDocVersions: {
          ...goldenDataset.createdAgainstDocVersions,
          'pol-orders-returns-001': '2.0.0', // DB has 1.0.0 < 2.0.0
        },
      };

      const { warnings } = await assertEvalSetNotStale(driftedSet);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('EVAL_BACKWARD_DRIFT');
    });
  });

  describe('Scoped Retrieval Accuracy & Recall Guard', () => {
    it.each(goldenDataset.queries)(
      'eval query $id retrieves relevant chunks strictly within $domain / $topic scope',
      async (testCase) => {
        const topK = 3;
        const domain = testCase.domain as KnowledgeDomain;
        const topic = testCase.topic;

        const scopedChunkCount = await getActiveScopedChunkCount({ domain, topic });
        expect(scopedChunkCount).toBeGreaterThan(0);

        const result = await retrieveKnowledge({
          query: testCase.query,
          domains: [domain],
          topics: [topic],
          topK,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;

        // Recall Guard: returned rows must be at least Math.min(topK, scopedChunkCount)
        expect(result.data.length).toBeGreaterThanOrEqual(
          Math.min(topK, scopedChunkCount)
        );

        // Scope verification: every hit must strictly match domain and topic
        for (const hit of result.data) {
          expect(hit.domain).toBe(domain);
          expect(hit.topic).toBe(topic);
          expect(hit.relevanceScore).toBeGreaterThan(0);
        }

        // Pacing delay to avoid saturating Gemini API rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      },
      120000
    );
  });
});
