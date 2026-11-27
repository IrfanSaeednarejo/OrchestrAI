// src/knowledge/scoped-retrieval.test.ts
//
// Topic-filtering correctness proof: for each shared-domain pair (orders, payments),
// the WRONG-topic document is seeded at HIGHER similarity than the correct one.
// A test that passes here proves inArray(topic) is actually filtering, not just
// benefiting from ranking coincidence.
//
// Now seeds knowledge_doc_versions + knowledge_chunks (the Phase 29 scoped path).
// The legacy knowledge_documents table is NOT touched — this test proves the
// production retrieval path filters correctly.
//
// Anchor dimension: 100 (distinct from retrieval.test.ts [0] and knowledge.tools.test.ts [50])
// Topics match exact production values from documents.ts / specialist-scope.ts
// Cleanup: by versionId (cascade deletes chunks) + content LIKE prefix (belt-and-suspenders)

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../persistence/db/client.js';
import { knowledgeDocVersions, knowledgeChunks } from '../persistence/db/schema.js';
import { inArray, sql } from 'drizzle-orm';
import { searchKnowledgeForSpecialist } from './scoped-retrieval.js';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Mock embeddings-client — same pattern as retrieval.test.ts
// ---------------------------------------------------------------------------

vi.mock('./embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn(),
  // assertValidEmbedding is imported by knowledge.repository.ts; must not be undefined
  assertValidEmbedding: vi.fn(),
}));

import { embedQuery } from './embeddings-client.js';
const mockedEmbedQuery = embedQuery as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Vector helpers (anchor dim = 100)
// ---------------------------------------------------------------------------

/** A 768-dim unit vector with 1 at position `index`, 0 elsewhere. */
function unitVec(index: number): number[] {
  const v = new Array(768).fill(0);
  v[index] = 1;
  return v;
}

/**
 * A 768-dim unit vector with cosine similarity `s` to unitVec(100).
 * Component 100 = s, component spreadDim = sqrt(1 - s^2), rest zero.
 */
function docVec(s: number, spreadDim: number): number[] {
  const v = new Array(768).fill(0);
  v[100] = s;
  v[spreadDim] = Math.sqrt(1 - s * s);
  return v;
}

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Fixtures
//
// Seeds knowledge_doc_versions + knowledge_chunks (the scoped retrieval path).
// Topics must match exact production values from specialist-scope.ts.
// Cleanup: delete versions by ID (chunks cascade via ON DELETE CASCADE).
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const TEST_CONTENT_PREFIX = 'scoped-retrieval-test:';
// Unique version prefix so we can LIKE-cleanup in belt-and-suspenders afterAll
const TEST_VERSION = 'test-scope-9.9.9';

// IDs of inserted chunks (what retrieveKnowledge returns as h.id = chunk.id)
let idOrdersShipping: string;  // shipping chunk id
let idOrdersReturns: string;   // returns chunk id
let idPaymentsPayments: string;
let idPaymentsRefunds: string;
let idAccountSecurity: string;

// Version IDs (for cleanup — cascades to chunks)
const insertedVersionIds: string[] = [];

/**
 * Insert one version + one chunk into the scoped tables.
 * Returns the chunk's id (what retrieval returns as KnowledgeHit.id).
 */
async function seedChunk(opts: {
  domain: 'orders' | 'payments' | 'account';
  topic: string;
  content: string;
  embedding: number[];
}): Promise<string> {
  const docId = `test-scope-${opts.domain}-${opts.topic}`;

  // Insert version
  const [ver] = await db
    .insert(knowledgeDocVersions)
    .values({
      docId,
      domain: opts.domain,
      topic: opts.topic,
      documentType: 'policy',
      version: TEST_VERSION,
      effectiveDate: FIXED_DATE,
      fileHash: contentHash(`${docId}:${TEST_VERSION}`),
      status: 'active',
    })
    .returning({ id: knowledgeDocVersions.id });

  if (!ver) throw new Error(`Failed to insert version for ${docId}`);
  insertedVersionIds.push(ver.id);

  // Insert chunk
  const embeddingJson = JSON.stringify(opts.embedding);
  const content = opts.content;
  const hash = contentHash(content);

  const [chunk] = await db
    .insert(knowledgeChunks)
    .values({
      versionId: ver.id,
      domain: opts.domain,
      topic: opts.topic,
      sectionPath: 'Overview',
      chunkIndex: 0,
      chunkKey: '01',
      content,
      contentHash: hash,
      embedding: sql`${embeddingJson}::vector`,
      status: 'active',
    } as never)
    .returning({ id: knowledgeChunks.id });

  if (!chunk) throw new Error(`Failed to insert chunk for ${docId}`);
  return chunk.id;
}

beforeAll(async () => {
  // Belt-and-suspenders: wipe any leftover test versions from prior runs
  await db.execute(sql`
    DELETE FROM knowledge_doc_versions
    WHERE version = ${TEST_VERSION}
  `);

  // orders / shipping — similarity 0.80 (dim 101 spread)
  idOrdersShipping = await seedChunk({
    domain: 'orders',
    topic: 'shipping',
    content: `${TEST_CONTENT_PREFIX} shipping`,
    embedding: docVec(0.80, 101),
  });

  // orders / returns — similarity 0.97 (dim 102 spread) — HIGHER than shipping!
  idOrdersReturns = await seedChunk({
    domain: 'orders',
    topic: 'returns',
    content: `${TEST_CONTENT_PREFIX} returns`,
    embedding: docVec(0.97, 102),
  });

  // payments / payments — similarity 0.80 (dim 103 spread)
  idPaymentsPayments = await seedChunk({
    domain: 'payments',
    topic: 'payments',
    content: `${TEST_CONTENT_PREFIX} payments`,
    embedding: docVec(0.80, 103),
  });

  // payments / refunds — similarity 0.97 (dim 104 spread) — HIGHER than payments!
  idPaymentsRefunds = await seedChunk({
    domain: 'payments',
    topic: 'refunds',
    content: `${TEST_CONTENT_PREFIX} refunds`,
    embedding: docVec(0.97, 104),
  });

  // account / account_security — similarity 0.90 (dim 105 spread)
  idAccountSecurity = await seedChunk({
    domain: 'account',
    topic: 'account_security',
    content: `${TEST_CONTENT_PREFIX} account_security`,
    embedding: docVec(0.90, 105),
  });

  // embedQuery returns unitVec(100) — the anchor for all similarity measurements
  mockedEmbedQuery.mockResolvedValue(unitVec(100));
});

afterAll(async () => {
  // Primary cleanup: delete versions by ID; chunks cascade via ON DELETE CASCADE
  if (insertedVersionIds.length > 0) {
    await db.delete(knowledgeDocVersions).where(inArray(knowledgeDocVersions.id, insertedVersionIds));
  }
  // Belt-and-suspenders: wipe any remaining rows by version string
  await db.execute(sql`
    DELETE FROM knowledge_doc_versions WHERE version = ${TEST_VERSION}
  `);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchKnowledgeForSpecialist', () => {
  describe('order_tracking — sees shipping (0.80) but NOT returns (0.97)', () => {
    it('contains the shipping chunk in results', async () => {
      const result = await searchKnowledgeForSpecialist('order_tracking', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idOrdersShipping);
    });

    it('does NOT contain the returns chunk despite its higher raw similarity', async () => {
      const result = await searchKnowledgeForSpecialist('order_tracking', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idOrdersReturns);
    });
  });

  describe('returns — sees returns (0.97) but NOT shipping (0.80)', () => {
    it('contains the returns chunk in results', async () => {
      const result = await searchKnowledgeForSpecialist('returns', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idOrdersReturns);
    });

    it('does NOT contain the shipping chunk', async () => {
      const result = await searchKnowledgeForSpecialist('returns', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idOrdersShipping);
    });
  });

  describe('payment — sees payments (0.80) but NOT refunds (0.97)', () => {
    it('contains the payments chunk in results', async () => {
      const result = await searchKnowledgeForSpecialist('payment', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idPaymentsPayments);
    });

    it('does NOT contain the refunds chunk despite its higher raw similarity', async () => {
      const result = await searchKnowledgeForSpecialist('payment', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idPaymentsRefunds);
    });
  });

  describe('refund — sees refunds (0.97) but NOT payments (0.80)', () => {
    it('contains the refunds chunk in results', async () => {
      const result = await searchKnowledgeForSpecialist('refund', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idPaymentsRefunds);
    });

    it('does NOT contain the payments chunk', async () => {
      const result = await searchKnowledgeForSpecialist('refund', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idPaymentsPayments);
    });
  });

  describe('account_access — sees account_security chunk', () => {
    it('contains the account_security chunk in results', async () => {
      const result = await searchKnowledgeForSpecialist('account_access', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idAccountSecurity);
    });
  });

  describe('profile — NO_KNOWLEDGE_ACCESS short-circuit (embedQuery never called)', () => {
    it('returns NO_KNOWLEDGE_ACCESS error', async () => {
      mockedEmbedQuery.mockClear();
      const result = await searchKnowledgeForSpecialist('profile', { query: 'anything' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NO_KNOWLEDGE_ACCESS');
    });

    it('never calls embedQuery (short-circuit before any embedding/DB work)', async () => {
      mockedEmbedQuery.mockClear();
      await searchKnowledgeForSpecialist('profile', { query: 'anything' });
      expect(mockedEmbedQuery).not.toHaveBeenCalled();
    });
  });
});
