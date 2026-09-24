// src/knowledge/scoped-retrieval.test.ts
//
// Topic-filtering correctness proof: for each shared-domain pair (orders, payments),
// the WRONG-topic document is seeded at HIGHER similarity than the correct one.
// A test that passes here proves inArray(topic) is actually filtering, not just
// benefiting from ranking coincidence.
//
// Anchor dimension: 100 (distinct from retrieval.test.ts [0] and knowledge.tools.test.ts [50])
// Topics match exact production values from documents.ts / specialist-scope.ts
// Cleanup: by ID array (primary) + version prefix 'test-scope-1.0' (belt-and-suspenders)

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../persistence/db/client.js';
import { knowledgeDocuments } from '../persistence/db/schema.js';
import { inArray, like } from 'drizzle-orm';
import { createKnowledgeDocument } from '../persistence/repositories/knowledge.repository.js';
import { searchKnowledgeForSpecialist } from './scoped-retrieval.js';

// ---------------------------------------------------------------------------
// Mock embeddings-client — same pattern as retrieval.test.ts
// ---------------------------------------------------------------------------

vi.mock('./embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn(),
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

// ---------------------------------------------------------------------------
// Fixtures
//
// Topics MUST match the exact production values used in documents.ts and referenced
// by specialist-scope.ts: 'shipping', 'returns', 'payments', 'refunds', 'account_security'.
// Cleanup uses the row ID array (primary) and a LIKE on content prefix (belt-and-suspenders),
// since content is unique to these test rows.
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const TEST_CONTENT_PREFIX = 'scoped-retrieval-test:';

// orders domain:  shipping (correct for order_tracking) at 0.80, returns (wrong) at 0.97
let idOrdersShipping: string;  // similarity 0.80 — the correct doc for order_tracking
let idOrdersReturns: string;   // similarity 0.97 — the wrong doc (higher raw score!)

// payments domain: payments (correct for payment) at 0.80, refunds (wrong) at 0.97
let idPaymentsPayments: string; // similarity 0.80 — correct for payment
let idPaymentsRefunds: string;  // similarity 0.97 — wrong doc (higher raw score!)

// account domain: account_security (correct for account_access) at 0.90
let idAccountSecurity: string;

const allInsertedIds: string[] = [];

beforeAll(async () => {
  // Belt-and-suspenders cleanup before seeding: delete any leftover rows
  await db.delete(knowledgeDocuments).where(
    like(knowledgeDocuments.content, `${TEST_CONTENT_PREFIX}%`)
  );

  // orders / shipping — similarity 0.80 (dim 101 spread)
  // topic = 'shipping' matches specialist-scope.ts order_tracking scope exactly
  const docShipping = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: 'shipping',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: `${TEST_CONTENT_PREFIX} shipping`,
    embedding: docVec(0.80, 101),
  });
  idOrdersShipping = docShipping.id;

  // orders / returns — similarity 0.97 (dim 102 spread) — HIGHER than shipping!
  // topic = 'returns' matches specialist-scope.ts returns scope exactly
  const docReturns = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: 'returns',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: `${TEST_CONTENT_PREFIX} returns`,
    embedding: docVec(0.97, 102),
  });
  idOrdersReturns = docReturns.id;

  // payments / payments topic — similarity 0.80 (dim 103 spread)
  // topic = 'payments' matches specialist-scope.ts payment scope exactly
  const docPayments = await createKnowledgeDocument({
    domain: 'payments',
    documentType: 'policy',
    topic: 'payments',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: `${TEST_CONTENT_PREFIX} payments`,
    embedding: docVec(0.80, 103),
  });
  idPaymentsPayments = docPayments.id;

  // payments / refunds — similarity 0.97 (dim 104 spread) — HIGHER than payments!
  // topic = 'refunds' matches specialist-scope.ts refund scope exactly
  const docRefunds = await createKnowledgeDocument({
    domain: 'payments',
    documentType: 'policy',
    topic: 'refunds',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: `${TEST_CONTENT_PREFIX} refunds`,
    embedding: docVec(0.97, 104),
  });
  idPaymentsRefunds = docRefunds.id;

  // account / account_security — similarity 0.90 (dim 105 spread)
  // topic = 'account_security' matches specialist-scope.ts account_access scope exactly
  const docAccount = await createKnowledgeDocument({
    domain: 'account',
    documentType: 'policy',
    topic: 'account_security',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: `${TEST_CONTENT_PREFIX} account_security`,
    embedding: docVec(0.90, 105),
  });
  idAccountSecurity = docAccount.id;

  allInsertedIds.push(idOrdersShipping, idOrdersReturns, idPaymentsPayments, idPaymentsRefunds, idAccountSecurity);

  // embedQuery returns unitVec(100) — the anchor for all similarity measurements
  mockedEmbedQuery.mockResolvedValue(unitVec(100));
});

afterAll(async () => {
  if (allInsertedIds.length > 0) {
    await db.delete(knowledgeDocuments).where(inArray(knowledgeDocuments.id, allInsertedIds));
  }
  // Belt-and-suspenders: wipe any remaining test rows by content prefix
  await db.delete(knowledgeDocuments).where(
    like(knowledgeDocuments.content, `${TEST_CONTENT_PREFIX}%`)
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchKnowledgeForSpecialist', () => {
  describe('order_tracking — sees shipping (0.80) but NOT returns (0.97)', () => {
    it('contains the shipping doc (0.80) in results', async () => {
      const result = await searchKnowledgeForSpecialist('order_tracking', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idOrdersShipping);
    });

    it('does NOT contain the returns doc (0.97) despite its higher raw similarity', async () => {
      const result = await searchKnowledgeForSpecialist('order_tracking', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idOrdersReturns);
    });
  });

  describe('returns — sees returns (0.97) but NOT shipping (0.80)', () => {
    it('contains the returns doc (0.97) in results', async () => {
      const result = await searchKnowledgeForSpecialist('returns', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idOrdersReturns);
    });

    it('does NOT contain the shipping doc (0.80)', async () => {
      const result = await searchKnowledgeForSpecialist('returns', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idOrdersShipping);
    });
  });

  describe('payment — sees payments (0.80) but NOT refunds (0.97)', () => {
    it('contains the payments doc (0.80) in results', async () => {
      const result = await searchKnowledgeForSpecialist('payment', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idPaymentsPayments);
    });

    it('does NOT contain the refunds doc (0.97) despite its higher raw similarity', async () => {
      const result = await searchKnowledgeForSpecialist('payment', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idPaymentsRefunds);
    });
  });

  describe('refund — sees refunds (0.97) but NOT payments (0.80)', () => {
    it('contains the refunds doc (0.97) in results', async () => {
      const result = await searchKnowledgeForSpecialist('refund', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).toContain(idPaymentsRefunds);
    });

    it('does NOT contain the payments doc (0.80)', async () => {
      const result = await searchKnowledgeForSpecialist('refund', { query: 'test', topK: 5 });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const ids = result.data.map(h => h.id);
      expect(ids).not.toContain(idPaymentsPayments);
    });
  });

  describe('account_access — sees account_security doc', () => {
    it('contains the account_security doc in results', async () => {
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
