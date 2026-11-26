import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { knowledgeChunks, knowledgeDocVersions } from '../db/schema.js';
import { upsertKnowledgeVersion } from './knowledge.repository.js';

const TEST_PREFIX = 'od37-test-';
const DOC_A = `${TEST_PREFIX}doc-a`;
const DOC_B = `${TEST_PREFIX}doc-b`;
const DOC_C = `${TEST_PREFIX}doc-c`;
const DOC_COEXIST = `${TEST_PREFIX}coexist`;

function sha(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

const DUMMY_VEC = new Array(768).fill(0.01) as number[];

async function cleanupTestDocs(): Promise<void> {
  await db
    .delete(knowledgeDocVersions)
    .where(inArray(knowledgeDocVersions.docId, [DOC_A, DOC_B, DOC_C, DOC_COEXIST]));
}

describe('Phase 37c.2 — OD-37a & OD-37b Repository Invariants', () => {
  beforeAll(async () => {
    await cleanupTestDocs();
  });

  afterAll(async () => {
    await cleanupTestDocs();
  });

  it('OD-37a: upsertKnowledgeVersion supersedes only prior versions of the same docId, preserving siblings in (domain, topic)', async () => {
    // 1. Insert docA and docB both in (orders, od37_returns_isolation)
    const resA = await upsertKnowledgeVersion(
      {
        docId: DOC_A,
        domain: 'orders',
        topic: 'od37_returns_isolation',
        documentType: 'policy',
        version: '1.0.0',
        effectiveDate: new Date('2026-11-26T00:00:00Z'),
        fileHash: sha('docA-v1'),
      },
      [
        {
          sectionPath: 'Doc A Section 1',
          chunkIndex: 0,
          chunkKey: '01',
          content: 'Doc A v1 content',
          contentHash: sha('docA-v1-c1'),
          embedding: DUMMY_VEC,
        },
      ]
    );

    const resB1 = await upsertKnowledgeVersion(
      {
        docId: DOC_B,
        domain: 'orders',
        topic: 'od37_returns_isolation',
        documentType: 'policy',
        version: '1.0.0',
        effectiveDate: new Date('2026-11-26T00:00:00Z'),
        fileHash: sha('docB-v1'),
      },
      [
        {
          sectionPath: 'Doc B Section 1',
          chunkIndex: 0,
          chunkKey: '01',
          content: 'Doc B v1 content',
          contentHash: sha('docB-v1-c1'),
          embedding: DUMMY_VEC,
        },
      ]
    );

    // 2. Upsert docB v2.0.0
    const resB2 = await upsertKnowledgeVersion(
      {
        docId: DOC_B,
        domain: 'orders',
        topic: 'od37_returns_isolation',
        documentType: 'policy',
        version: '2.0.0',
        effectiveDate: new Date('2026-11-27T00:00:00Z'),
        fileHash: sha('docB-v2'),
      },
      [
        {
          sectionPath: 'Doc B Section 1',
          chunkIndex: 0,
          chunkKey: '01',
          content: 'Doc B v2 content',
          contentHash: sha('docB-v2-c1'),
          embedding: DUMMY_VEC,
        },
      ]
    );

    // 3. Assert docA's version and chunk remain 'active'
    const [verA] = await db
      .select({ status: knowledgeDocVersions.status })
      .from(knowledgeDocVersions)
      .where(eq(knowledgeDocVersions.id, resA.versionId));
    const chunksA = await db
      .select({ status: knowledgeChunks.status })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.versionId, resA.versionId));

    expect(verA?.status).toBe('active');
    expect(chunksA).toHaveLength(1);
    expect(chunksA[0]?.status).toBe('active');

    // 4. Assert docB v1 is 'superseded' and docB v2 is 'active'
    const [verB1] = await db
      .select({ status: knowledgeDocVersions.status })
      .from(knowledgeDocVersions)
      .where(eq(knowledgeDocVersions.id, resB1.versionId));
    const chunksB1 = await db
      .select({ status: knowledgeChunks.status })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.versionId, resB1.versionId));
    const [verB2] = await db
      .select({ status: knowledgeDocVersions.status })
      .from(knowledgeDocVersions)
      .where(eq(knowledgeDocVersions.id, resB2.versionId));
    const chunksB2 = await db
      .select({ status: knowledgeChunks.status })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.versionId, resB2.versionId));

    expect(verB1?.status).toBe('superseded');
    expect(chunksB1[0]?.status).toBe('superseded');
    expect(verB2?.status).toBe('active');
    expect(chunksB2[0]?.status).toBe('active');
  });

  it('OD-37b: active and superseded chunks coexist at the same (version_id, chunk_key), while duplicate active rows are rejected', async () => {
    const [ver] = await db
      .insert(knowledgeDocVersions)
      .values({
        docId: DOC_COEXIST,
        domain: 'payments',
        topic: 'od37_payments_isolation',
        documentType: 'faq',
        version: '1.0.0',
        effectiveDate: new Date('2026-11-26T00:00:00Z'),
        fileHash: sha('coexist-v1'),
        status: 'active',
      })
      .returning({ id: knowledgeDocVersions.id });

    if (!ver) throw new Error('Failed to create version for coexistence test');

    // Insert active (v1, '01')
    const [first] = await db
      .insert(knowledgeChunks)
      .values({
        versionId: ver.id,
        domain: 'payments',
        topic: 'od37_payments_isolation',
        sectionPath: 'Section 1',
        chunkIndex: 0,
        chunkKey: '01',
        content: 'First active chunk',
        contentHash: sha('first-active'),
        embedding: DUMMY_VEC,
        status: 'active',
      })
      .returning({ id: knowledgeChunks.id });

    if (!first) throw new Error('Failed to insert first chunk');

    // Demote to superseded
    await db
      .update(knowledgeChunks)
      .set({ status: 'superseded' })
      .where(eq(knowledgeChunks.id, first.id));

    // Insert new active (v1, '01') — must succeed
    const [second] = await db
      .insert(knowledgeChunks)
      .values({
        versionId: ver.id,
        domain: 'payments',
        topic: 'od37_payments_isolation',
        sectionPath: 'Section 1',
        chunkIndex: 0,
        chunkKey: '01',
        content: 'Second active chunk',
        contentHash: sha('second-active'),
        embedding: DUMMY_VEC,
        status: 'active',
      })
      .returning({ id: knowledgeChunks.id });

    expect(second?.id).toBeDefined();

    // Verify both rows coexist in DB
    const rows = await db
      .select({ status: knowledgeChunks.status })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.versionId, ver.id), eq(knowledgeChunks.chunkKey, '01')));
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'superseded']);

    // Inserting another active (v1, '01') must violate the partial unique index
    await expect(
      db.insert(knowledgeChunks).values({
        versionId: ver.id,
        domain: 'payments',
        topic: 'od37_payments_isolation',
        sectionPath: 'Section 1',
        chunkIndex: 0,
        chunkKey: '01',
        content: 'Duplicate active chunk',
        contentHash: sha('dup-active'),
        embedding: DUMMY_VEC,
        status: 'active',
      })
    ).rejects.toThrow();
  });

  it('OD-37b: same-version content-hash guard throws when same (docId, version) has a different fileHash', async () => {
    await upsertKnowledgeVersion(
      {
        docId: DOC_C,
        domain: 'account',
        topic: 'od37_privacy_isolation',
        documentType: 'policy',
        version: '1.0.0',
        effectiveDate: new Date('2026-11-26T00:00:00Z'),
        fileHash: sha('docC-v1-original'),
      },
      [
        {
          sectionPath: 'Section 1',
          chunkIndex: 0,
          chunkKey: '01',
          content: 'Original content',
          contentHash: sha('docC-v1-c1'),
          embedding: DUMMY_VEC,
        },
      ]
    );

    await expect(
      upsertKnowledgeVersion(
        {
          docId: DOC_C,
          domain: 'account',
          topic: 'privacy',
          documentType: 'policy',
          version: '1.0.0',
          effectiveDate: new Date('2026-11-26T00:00:00Z'),
          fileHash: sha('docC-v1-mutated'),
        },
        [
          {
            sectionPath: 'Section 1',
            chunkIndex: 0,
            chunkKey: '01',
            content: 'Mutated content',
            contentHash: sha('docC-v1-c1-mutated'),
            embedding: DUMMY_VEC,
          },
        ]
      )
    ).rejects.toThrow(/SAME_VERSION_CONTENT_HASH_MISMATCH/);
  });
});
