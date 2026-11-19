import { describe, it, expect } from 'vitest';
import { fuseRrf } from './rrf-reranker.js';
import { KnowledgeSearchRow } from '../persistence/repositories/knowledge.repository.js';

describe('fuseRrf', () => {
  const dummyDate = new Date('2026-01-01');

  const makeRow = (id: string, domain = 'orders' as const, topic = 'returns'): KnowledgeSearchRow => ({
    id,
    versionId: 'ver-1',
    domain,
    topic,
    sectionPath: 'Overview',
    content: `Content for ${id}`,
    version: '1.0.0',
    effectiveDate: dummyDate,
  });

  it('correctly ranks items present in both dense and sparse results higher', () => {
    const dense: KnowledgeSearchRow[] = [makeRow('chunk-A'), makeRow('chunk-B')];
    const sparse: KnowledgeSearchRow[] = [makeRow('chunk-B'), makeRow('chunk-C')];

    const fused = fuseRrf(dense, sparse, 60, 5);

    // chunk-B is in both lists: rank 2 dense + rank 1 sparse
    // chunk-A is only dense: rank 1 dense
    // chunk-C is only sparse: rank 2 sparse
    // Score chunk-B = 1/(60+2) + 1/(60+1) = 1/62 + 1/61 ≈ 0.016129 + 0.016393 = 0.032522
    // Score chunk-A = 1/(60+1) ≈ 0.016393
    // Score chunk-C = 1/(60+2) ≈ 0.016129
    expect(fused[0]?.id).toBe('chunk-B');
    expect(fused[1]?.id).toBe('chunk-A');
    expect(fused[2]?.id).toBe('chunk-C');
  });

  it('respects topK limit', () => {
    const dense: KnowledgeSearchRow[] = [makeRow('1'), makeRow('2'), makeRow('3')];
    const sparse: KnowledgeSearchRow[] = [makeRow('4'), makeRow('5')];

    const fused = fuseRrf(dense, sparse, 60, 2);
    expect(fused).toHaveLength(2);
  });

  it('handles empty dense or sparse lists gracefully', () => {
    const dense: KnowledgeSearchRow[] = [makeRow('1'), makeRow('2')];
    const sparse: KnowledgeSearchRow[] = [];

    const fused = fuseRrf(dense, sparse, 60, 5);
    expect(fused).toHaveLength(2);
    expect(fused[0]?.id).toBe('1');
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61, 5);
  });
});
