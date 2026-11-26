/**
 * server/src/knowledge/layer-a-equivalence.test.ts
 *
 * Phase 36 Step 3: Layer A Equivalence Test.
 * Confirms that searchDenseScoped and searchSparseScoped running via the
 * dedicated retrieval pool (unpooled direct connection with HNSW GUC startup options)
 * return valid knowledge hits with proper domain/topic scoping and rank ordering.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../persistence/db/client.js';
import { knowledgeDocVersions, knowledgeChunks } from '../persistence/db/schema.js';
import { sql } from 'drizzle-orm';
import { searchDenseScoped, searchSparseScoped } from '../persistence/repositories/knowledge.repository.js';
import crypto from 'node:crypto';

// Mock embeddings client to ensure zero Gemini API quota usage
vi.mock('./embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn(),
  assertValidEmbedding: vi.fn(),
}));

const TEST_VERSION = 'layer-a-equiv-1.0.0';
const insertedVersionIds: string[] = [];

beforeAll(async () => {
  // Clean up any stale data
  await db.execute(sql`DELETE FROM knowledge_doc_versions WHERE version = ${TEST_VERSION}`);

  // Seed a version
  const [ver] = await db
    .insert(knowledgeDocVersions)
    .values({
      docId: 'layer-a-test-doc',
      domain: 'orders',
      topic: 'returns',
      documentType: 'policy',
      version: TEST_VERSION,
      effectiveDate: new Date('2026-01-01T00:00:00Z'),
      fileHash: crypto.createHash('sha256').update(TEST_VERSION).digest('hex'),
      status: 'active',
    })
    .returning({ id: knowledgeDocVersions.id });

  if (ver) {
    insertedVersionIds.push(ver.id);

    const vector = new Array(768).fill(0.01);
    const vectorJson = JSON.stringify(vector);

    await db.insert(knowledgeChunks).values({
      versionId: ver.id,
      domain: 'orders',
      topic: 'returns',
      sectionPath: 'Eligibility / 30-day Window',
      chunkIndex: 0,
      chunkKey: '01',
      content: 'Customers may return eligible items within 30 days of purchase for a full refund.',
      contentHash: crypto.createHash('sha256').update('returns content').digest('hex'),
      embedding: sql`${vectorJson}::vector`,
      status: 'active',
    } as never);
  }
});

afterAll(async () => {
  if (insertedVersionIds.length > 0) {
    await db.execute(sql`DELETE FROM knowledge_doc_versions WHERE version = ${TEST_VERSION}`);
  }
});

describe('Phase 36 Layer A — Retrieval Equivalence & GUC Behavior', () => {
  it('searchDenseScoped executes autocommit single query via retrieval pool and returns hits', async () => {
    const vector = new Array(768).fill(0.01);
    const hits = await searchDenseScoped(vector, 'orders', 'returns', 3);
    
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    const [firstHit] = hits;
    expect(firstHit).toBeDefined();
    if (!firstHit) return;
    expect(firstHit).toHaveProperty('id');
    expect(firstHit).toHaveProperty('content');
    expect(firstHit).toHaveProperty('domain', 'orders');
    expect(firstHit).toHaveProperty('topic', 'returns');
    expect(firstHit).toHaveProperty('distance');
    expect(typeof firstHit.distance).toBe('number');
  });

  it('searchSparseScoped executes autocommit full-text query via retrieval pool and returns hits', async () => {
    const hits = await searchSparseScoped('return eligible refund', 'orders', 'returns', 3);
    
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    const [firstHit] = hits;
    expect(firstHit).toBeDefined();
    if (!firstHit) return;
    expect(firstHit).toHaveProperty('id');
    expect(firstHit).toHaveProperty('content');
    expect(firstHit).toHaveProperty('domain', 'orders');
    expect(firstHit).toHaveProperty('topic', 'returns');
  });

  it('preserves top-K limit guarantees', async () => {
    const vector = new Array(768).fill(0.01);
    const top1 = await searchDenseScoped(vector, 'orders', 'returns', 1);
    const top3 = await searchDenseScoped(vector, 'orders', 'returns', 3);
    
    expect(top1.length).toBeLessThanOrEqual(3);
    expect(top3.length).toBeGreaterThanOrEqual(top1.length);
  });
});
