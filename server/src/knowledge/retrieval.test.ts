import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../persistence/db/client.js';
import { knowledgeDocuments } from '../persistence/db/schema.js';
import { inArray, like } from 'drizzle-orm';
import {
  createKnowledgeDocument,
  searchKnowledgeByEmbedding,
} from '../persistence/repositories/knowledge.repository.js';
import { retrieveKnowledge } from './retrieval.js';

// ---------------------------------------------------------------------------
// Mock embeddings-client — embedQuery is a controllable vi.fn
// ---------------------------------------------------------------------------

vi.mock('./embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn(),
}));

import { embedQuery } from './embeddings-client.js';
const mockedEmbedQuery = embedQuery as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

/** A 768-dim unit vector with 1 at position `index`, 0 elsewhere. */
function unitVec(index: number): number[] {
  const v = new Array(768).fill(0);
  v[index] = 1;
  return v;
}

/**
 * A 768-dim unit vector with cosine similarity `s` to unitVec(0).
 * Component 0 = s, component k = sqrt(1 - s^2), rest zero.
 */
function docVec(s: number, k: number): number[] {
  const v = new Array(768).fill(0);
  v[0] = s;
  v[k] = Math.sqrt(1 - s * s);
  return v;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

let idA: string;
let idB: string;
let idC: string;
let idD: string;
let idE: string;

beforeAll(async () => {
  // Escape _ because it is a single-character wildcard in SQL LIKE
  await db.delete(knowledgeDocuments).where(like(knowledgeDocuments.topic, '\\_\\_test\\_\\_%'));

  const docA = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: '__test__A',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'test content A',
    embedding: docVec(0.95, 1),
  });
  idA = docA.id;

  const docB = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: '__test__B',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'test content B',
    embedding: docVec(0.75, 2),
  });
  idB = docB.id;

  const docC = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: '__test__C',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'test content C',
    embedding: docVec(0.45, 3),
  });
  idC = docC.id;

  const docD = await createKnowledgeDocument({
    domain: 'payments',
    documentType: 'policy',
    topic: '__test__D',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'test content D',
    embedding: docVec(0.95, 4),
  });
  idD = docD.id;

  const docE = await createKnowledgeDocument({
    domain: 'account',
    documentType: 'policy',
    topic: '__test__E',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'test content E',
    embedding: null,
  });
  idE = docE.id;
});

afterAll(async () => {
  await db.delete(knowledgeDocuments).where(
    inArray(knowledgeDocuments.id, [idA, idB, idC, idD, idE])
  );
  // Belt-and-suspenders: also wipe any remaining __test__ rows
  // Escape _ because it is a single-character wildcard in SQL LIKE
  await db.delete(knowledgeDocuments).where(like(knowledgeDocuments.topic, '\\_\\_test\\_\\_%'));
});

beforeEach(() => {
  mockedEmbedQuery.mockResolvedValue(unitVec(0));
});

// ---------------------------------------------------------------------------
// Repository-level tests (searchKnowledgeByEmbedding directly)
// ---------------------------------------------------------------------------

describe('searchKnowledgeByEmbedding', () => {
  // a. Domain scoping
  it('a. domain scoping: orders domain does not return fixture D (payments) or E (account)', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), ['orders'], 10);
    const ids = rows.map(r => r.id);
    expect(ids).not.toContain(idD);
    expect(ids).not.toContain(idE);
  });

  // b. Ordering: A, B, C in descending similarity (ascending distance)
  it('b. ordering: fixtures return in order A, B, C among orders domain', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), ['orders'], 10);
    const fixtureRows = rows.filter(r => [idA, idB, idC].includes(r.id));
    expect(fixtureRows.map(r => r.id)).toEqual([idA, idB, idC]);
  });

  // c. Distance is a JS number and approx 1 - s
  it('c. distance is a JS number and approximately 1 - similarity', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), ['orders'], 10);
    const rowA = rows.find(r => r.id === idA);
    const rowB = rows.find(r => r.id === idB);
    const rowC = rows.find(r => r.id === idC);

    expect(typeof rowA?.distance).toBe('number');
    expect(typeof rowB?.distance).toBe('number');
    expect(typeof rowC?.distance).toBe('number');

    expect(rowA?.distance).toBeCloseTo(1 - 0.95, 4);
    expect(rowB?.distance).toBeCloseTo(1 - 0.75, 4);
    expect(rowC?.distance).toBeCloseTo(1 - 0.45, 4);
  });

  // d. NULL embedding: fixture E never appears even with all domains
  it('d. NULL embedding: fixture E never appears in results', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), ['orders', 'payments', 'account'], 100);
    const ids = rows.map(r => r.id);
    expect(ids).not.toContain(idE);
  });

  // e. Empty domains array returns [] immediately
  it('e. empty domains array returns [] without querying', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), [], 10);
    expect(rows).toEqual([]);
  });

  // f. Limit is respected
  it('f. limit 1 returns exactly 1 row', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), ['orders'], 1);
    expect(rows).toHaveLength(1);
  });

  // g. No returned row has an embedding key
  it('g. no returned row has an embedding key', async () => {
    const rows = await searchKnowledgeByEmbedding(unitVec(0), ['orders'], 10);
    for (const row of rows) {
      expect(Object.prototype.hasOwnProperty.call(row, 'embedding')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// retrieveKnowledge tests
// ---------------------------------------------------------------------------

describe('retrieveKnowledge', () => {
  // h. Success path: fixture hits A, B, C in order; distance/embedding absent
  it('h. success path: returns A, B, C in order for orders domain', async () => {
    const result = await retrieveKnowledge({ query: 'test', domains: ['orders'], topK: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const fixtureHits = result.data.filter(h => [idA, idB, idC].includes(h.id));
    expect(fixtureHits.map(h => h.id)).toEqual([idA, idB, idC]);

    expect(fixtureHits[0]?.similarity).toBeCloseTo(0.95, 4);
    expect(fixtureHits[1]?.similarity).toBeCloseTo(0.75, 4);
    expect(fixtureHits[2]?.similarity).toBeCloseTo(0.45, 4);

    for (const hit of fixtureHits) {
      expect(Object.prototype.hasOwnProperty.call(hit, 'distance')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(hit, 'embedding')).toBe(false);
    }
  });

  // i. minSimilarity 0.6 keeps A and B, drops C
  it('i. minSimilarity 0.6 keeps A and B but drops C', async () => {
    const result = await retrieveKnowledge({ query: 'test', domains: ['orders'], topK: 5, minSimilarity: 0.6 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ids = result.data.map(h => h.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idC);
  });

  // j. Validation: no unscoped search, bad inputs
  it('j-1. missing domains -> INVALID_INPUT', async () => {
    const result = await retrieveKnowledge({ query: 'x' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('j-2. empty domains array -> INVALID_INPUT', async () => {
    const result = await retrieveKnowledge({ query: 'x', domains: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('j-3. empty query string -> INVALID_INPUT', async () => {
    const result = await retrieveKnowledge({ query: '', domains: ['orders'] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('j-4. topK 6 (out of range) -> INVALID_INPUT', async () => {
    const result = await retrieveKnowledge({ query: 'x', domains: ['orders'], topK: 6 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('j-5. unknown domain -> INVALID_INPUT', async () => {
    const result = await retrieveKnowledge({ query: 'x', domains: ['profile'] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  // k. embedQuery rejects -> EMBEDDING_ERROR, does not throw
  it('k. embedQuery rejects -> EMBEDDING_ERROR, does not throw', async () => {
    mockedEmbedQuery.mockRejectedValueOnce(new Error('API down'));
    const result = await retrieveKnowledge({ query: 'test', domains: ['orders'] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('EMBEDDING_ERROR');
  });

  // l. Orthogonal query with minSimilarity 0.6 -> empty results
  it('l. orthogonal query (unitVec(500)) with minSimilarity 0.6 -> success true, data []', async () => {
    mockedEmbedQuery.mockResolvedValueOnce(unitVec(500));
    const result = await retrieveKnowledge({ query: 'test', domains: ['orders'], topK: 5, minSimilarity: 0.6 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const fixtureHits = result.data.filter(h => [idA, idB, idC].includes(h.id));
    expect(fixtureHits).toHaveLength(0);
  });

  // m. Cross-domain: orders + payments -> A and D both present, E absent
  it('m. cross-domain orders+payments: fixtures A and D present, E absent', async () => {
    const result = await retrieveKnowledge({ query: 'test', domains: ['orders', 'payments'], topK: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ids = result.data.map(h => h.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idD);
    expect(ids).not.toContain(idE);
  });
});
