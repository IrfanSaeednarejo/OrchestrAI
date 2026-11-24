/**
 * server/src/knowledge/layer-b-cte.test.ts
 *
 * Phase 36 Step 4: Layer B CTE Equivalence & Retrieval Test.
 * Confirms that searchHybridScopedCTE combines dense vector search, sparse full-text search,
 * and Reciprocal Rank Fusion (RRF k=60) in a single database round-trip statement with
 * deterministic tie-breaking.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from '../persistence/db/client.js';
import { knowledgeDocVersions, knowledgeChunks } from '../persistence/db/schema.js';
import { sql } from 'drizzle-orm';
import {
  searchHybridScopedCTE,
} from '../persistence/repositories/knowledge.repository.js';
import { retrieveKnowledge } from './retrieval.js';
import crypto from 'node:crypto';

vi.mock('./embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn(),
  assertValidEmbedding: vi.fn(),
}));

import { embedQuery } from './embeddings-client.js';
const mockedEmbedQuery = embedQuery as ReturnType<typeof vi.fn>;

const TEST_VERSION = 'layer-b-cte-1.0.0';
const insertedVersionIds: string[] = [];

beforeAll(async () => {
  // Clean up any stale data
  await db.execute(sql`DELETE FROM knowledge_doc_versions WHERE version = ${TEST_VERSION}`);

  // Seed a version
  const [ver] = await db
    .insert(knowledgeDocVersions)
    .values({
      docId: 'layer-b-test-doc',
      domain: 'orders',
      topic: 'returns_cte_eval',
      documentType: 'policy',
      version: TEST_VERSION,
      effectiveDate: new Date('2026-01-01T00:00:00Z'),
      fileHash: crypto.createHash('sha256').update(TEST_VERSION).digest('hex'),
      status: 'active',
    })
    .returning({ id: knowledgeDocVersions.id });

  if (ver) {
    insertedVersionIds.push(ver.id);

    const vector1 = new Array(768).fill(0.01);
    const vector2 = new Array(768).fill(0.02);

    await db.insert(knowledgeChunks).values([
      {
        versionId: ver.id,
        domain: 'orders',
        topic: 'returns_cte_eval',
        sectionPath: 'Eligibility / 30-day Window',
        chunkIndex: 0,
        content: 'Customers may return eligible items within 30 days of delivery for a full refund.',
        contentHash: crypto.createHash('sha256').update('chunk0').digest('hex'),
        embedding: sql`${JSON.stringify(vector1)}::vector`,
        status: 'active',
      },
      {
        versionId: ver.id,
        domain: 'orders',
        topic: 'returns_cte_eval',
        sectionPath: 'Exceptions / Non-Returnable Items',
        chunkIndex: 1,
        content: 'Perishable goods, gift cards, and downloadable software products cannot be returned.',
        contentHash: crypto.createHash('sha256').update('chunk1').digest('hex'),
        embedding: sql`${JSON.stringify(vector2)}::vector`,
        status: 'active',
      },
    ] as never);
  }
});

afterAll(async () => {
  if (insertedVersionIds.length > 0) {
    await db.execute(sql`DELETE FROM knowledge_doc_versions WHERE version = ${TEST_VERSION}`);
  }
});

describe('Phase 36 Layer B — Single-CTE Hybrid Retrieval', () => {
  it('searchHybridScopedCTE executes a single query combining dense and sparse with RRF scores', async () => {
    const vector = new Array(768).fill(0.01);
    const hits = await searchHybridScopedCTE(vector, 'return eligible refund', 'orders', 'returns_cte_eval', 3);

    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);

    const [first] = hits;
    expect(first).toBeDefined();
    if (!first) return;

    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('content');
    expect(first).toHaveProperty('rrfScore');
    expect(typeof first.rrfScore).toBe('number');
    expect(first.rrfScore).toBeGreaterThan(0);
    expect(first).toHaveProperty('distance');
    expect(first.domain).toBe('orders');
    expect(first.topic).toBe('returns_cte_eval');
  });

  it('retrieveKnowledge successfully resolves using the single-CTE retrieval path', async () => {
    const vector = new Array(768).fill(0.01);
    mockedEmbedQuery.mockResolvedValueOnce(vector);

    const result = await retrieveKnowledge({
      query: 'return eligible refund',
      domains: ['orders'],
      topics: ['returns_cte_eval'],
      topK: 2,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.length).toBeLessThanOrEqual(2);
    expect(result.data[0]).toHaveProperty('id');
    expect(result.data[0]).toHaveProperty('relevanceScore');
    expect(result.data[0]).toHaveProperty('similarity');
    expect(result.data[0]?.domain).toBe('orders');
    expect(result.data[0]?.topic).toBe('returns_cte_eval');
  });

  it('maintains deterministic ranking order', async () => {
    const vector = new Array(768).fill(0.01);
    const run1 = await searchHybridScopedCTE(vector, 'return eligible refund', 'orders', 'returns_cte_eval', 2);
    const run2 = await searchHybridScopedCTE(vector, 'return eligible refund', 'orders', 'returns_cte_eval', 2);

    expect(run1.map((h) => h.id)).toEqual(run2.map((h) => h.id));
    expect(run1.map((h) => h.rrfScore)).toEqual(run2.map((h) => h.rrfScore));
  });

  it('asserts set and order equality against production pre-CTE baseline fixture', async () => {
    const fixturePath = fileURLToPath(new URL('./fixtures/layer-b-pre-cte-baseline.json', import.meta.url));
    const baseline = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    expect(baseline.length).toBe(30);

    for (const q of baseline) {
      const hash = crypto.createHash('sha256').update(q.query).digest();
      const vector: number[] = new Array(768);
      for (let i = 0; i < 768; i++) {
        const byte = hash[i % hash.length] ?? 0;
        vector[i] = Math.sin(byte + i + 1) / Math.sqrt(768);
      }

      const hits = await searchHybridScopedCTE(vector, q.query, q.domain, q.topic, 3);
      const hitIds = hits.map((h) => h.id);
      const expectedIds = q.top3.map((h: { id: string }) => h.id);

      expect(hitIds).toEqual(expectedIds);

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const expected = q.top3[i];
        expect(hit).toBeDefined();
        expect(expected).toBeDefined();
        if (hit && expected) {
          expect(Math.abs(Number(hit.rrfScore) - expected.rrfScore)).toBeLessThanOrEqual(0.001);
        }
      }
    }
  }, 45000);
});
