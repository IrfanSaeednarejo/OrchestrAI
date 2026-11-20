/**
 * server/src/persistence/repositories/knowledge.repository.ts
 * Implements Part C (Dense/Sparse queries with pgvector relaxed_order, transactional upserts with supersession).
 */

import {
  sql,
  eq,
  and,
  count,
  inArray,
  isNotNull,
  cosineDistance,
  type InferInsertModel,
  type InferSelectModel,
} from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  knowledgeChunks,
  knowledgeDocVersions,
  knowledgeDocuments,
  type KnowledgeDomain,
} from '../db/schema.js';
import { assertValidEmbedding } from '../../knowledge/embeddings-client.js';

export type { KnowledgeDomain };
export type KnowledgeDocument = InferSelectModel<typeof knowledgeDocuments>;
export type NewKnowledgeDocument = InferInsertModel<typeof knowledgeDocuments>;

export interface KnowledgeSearchRow {
  id: string;
  versionId: string;
  domain: KnowledgeDomain;
  topic: string;
  sectionPath: string;
  content: string;
  version: string;
  effectiveDate: Date;
  distance?: number;
  rank?: number;
}

export interface ChunkInsertPayload {
  sectionPath: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  embedding: number[];
}

export interface DocumentVersionInsertPayload {
  docId: string;
  domain: KnowledgeDomain;
  topic: string;
  documentType: string;
  version: string;
  effectiveDate: Date;
  fileHash: string;
}

/**
 * Searches dense candidates via HNSW with local transaction GUCs and relaxed_order iterative scan.
 */
export async function searchDenseScoped(
  embedding: number[],
  domain: KnowledgeDomain,
  topic: string,
  topK: number
): Promise<KnowledgeSearchRow[]> {
  assertValidEmbedding(embedding);
  const limitCandidates = topK * 3;
  const embeddingJson = JSON.stringify(embedding);

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL hnsw.iterative_scan = relaxed_order;
      SET LOCAL hnsw.ef_search = 100;
      SET LOCAL hnsw.max_scan_tuples = 40000;
    `);

    const result = await tx.execute(sql`
      SELECT 
        c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
        v.version, v.effective_date AS "effectiveDate",
        (c.embedding <=> ${embeddingJson}::vector) AS distance
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = ${domain}
        AND c.topic = ${topic}
        AND c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT ${limitCandidates};
    `);

    return result.rows as unknown as KnowledgeSearchRow[];
  });
}

/**
 * Searches sparse candidates via PostgreSQL tsvector full-text search.
 */
export async function searchSparseScoped(
  queryText: string,
  domain: KnowledgeDomain,
  topic: string,
  topK: number
): Promise<KnowledgeSearchRow[]> {
  const limitCandidates = topK * 3;

  const result = await db.execute(sql`
    SELECT 
      c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
      v.version, v.effective_date AS "effectiveDate",
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${queryText})) AS rank
    FROM knowledge_chunks c
    JOIN knowledge_doc_versions v ON c.version_id = v.id
    WHERE c.domain = ${domain}
      AND c.topic = ${topic}
      AND c.status = 'active'
      AND c.search_vector @@ websearch_to_tsquery('english', ${queryText})
    ORDER BY rank DESC
    LIMIT ${limitCandidates};
  `);

  return result.rows as unknown as KnowledgeSearchRow[];
}

/**
 * Count active chunks for a given scope (used for eval recall testing).
 */
export async function getActiveScopedChunkCount(scope: {
  domain: KnowledgeDomain;
  topic: string;
}): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.domain, scope.domain),
        eq(knowledgeChunks.topic, scope.topic),
        eq(knowledgeChunks.status, 'active')
      )
    );

  return Number(res[0]?.value ?? 0);
}

/**
 * Find an existing chunk's embedding by content hash to reuse embeddings.
 */
export async function findExistingChunkEmbedding(contentHash: string): Promise<number[] | null> {
  const result = await db
    .select({ embedding: knowledgeChunks.embedding })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.contentHash, contentHash))
    .limit(1);

  return (result[0]?.embedding as number[]) ?? null;
}

/**
 * Check if an active document version with this file hash already exists.
 */
export async function findActiveDocVersionByHash(fileHash: string): Promise<{ id: string; version: string } | null> {
  const result = await db
    .select({ id: knowledgeDocVersions.id, version: knowledgeDocVersions.version })
    .from(knowledgeDocVersions)
    .where(
      and(
        eq(knowledgeDocVersions.fileHash, fileHash),
        eq(knowledgeDocVersions.status, 'active')
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Atomically upserts a new document version and its chunks.
 * Supersedes older active versions of the same (domain, topic) non-destructively.
 */
export async function upsertKnowledgeVersion(
  versionMeta: DocumentVersionInsertPayload,
  chunks: ChunkInsertPayload[]
): Promise<{ versionId: string; chunksInserted: number }> {
  return db.transaction(async (tx) => {
    // 1. Insert new version record as draft first
    const [insertedVersion] = await tx
      .insert(knowledgeDocVersions)
      .values({
        docId: versionMeta.docId,
        domain: versionMeta.domain,
        topic: versionMeta.topic,
        documentType: versionMeta.documentType,
        version: versionMeta.version,
        effectiveDate: versionMeta.effectiveDate,
        fileHash: versionMeta.fileHash,
        status: 'draft',
      })
      .returning({ id: knowledgeDocVersions.id });

    if (!insertedVersion) {
      throw new Error(`Failed to insert document version for ${versionMeta.docId}`);
    }

    const versionId = insertedVersion.id;

    // 2. Insert all chunks marked draft
    if (chunks.length > 0) {
      await tx.insert(knowledgeChunks).values(
        chunks.map((c) => ({
          versionId,
          domain: versionMeta.domain,
          topic: versionMeta.topic,
          sectionPath: c.sectionPath,
          chunkIndex: c.chunkIndex,
          content: c.content,
          contentHash: c.contentHash,
          embedding: c.embedding,
          status: 'draft' as const,
        }))
      );
    }

    // 3. Demote currently active versions of this domain & topic to 'superseded'
    await tx
      .update(knowledgeDocVersions)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(knowledgeDocVersions.domain, versionMeta.domain),
          eq(knowledgeDocVersions.topic, versionMeta.topic),
          eq(knowledgeDocVersions.status, 'active')
        )
      );

    await tx
      .update(knowledgeChunks)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(knowledgeChunks.domain, versionMeta.domain),
          eq(knowledgeChunks.topic, versionMeta.topic),
          eq(knowledgeChunks.status, 'active')
        )
      );

    // 4. Promote new version and chunks to 'active'
    await tx
      .update(knowledgeDocVersions)
      .set({ status: 'active' })
      .where(eq(knowledgeDocVersions.id, versionId));

    await tx
      .update(knowledgeChunks)
      .set({ status: 'active' })
      .where(eq(knowledgeChunks.versionId, versionId));

    return { versionId, chunksInserted: chunks.length };
  });
}

/**
 * Legacy support for pre-existing tests and seeders.
 */
export async function createKnowledgeDocument(input: NewKnowledgeDocument): Promise<KnowledgeDocument> {
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values(input)
    .returning();

  if (!doc) {
    throw new Error('Failed to create knowledge document');
  }

  return doc;
}

export interface LegacyKnowledgeSearchRow {
  id: string;
  domain: KnowledgeDomain;
  documentType: string;
  topic: string;
  version: string;
  content: string;
  distance: number;
}

export async function searchKnowledgeByEmbedding(
  embedding: number[],
  domains: KnowledgeDomain[],
  limit: number,
  topics?: string[]
): Promise<LegacyKnowledgeSearchRow[]> {
  if (domains.length === 0) {
    return [];
  }

  const dist = cosineDistance(knowledgeDocuments.embedding, embedding);

  const topicFilter =
    topics && topics.length > 0 ? inArray(knowledgeDocuments.topic, topics) : undefined;

  const results = await db
    .select({
      id: knowledgeDocuments.id,
      domain: knowledgeDocuments.domain,
      documentType: knowledgeDocuments.documentType,
      topic: knowledgeDocuments.topic,
      version: knowledgeDocuments.version,
      content: knowledgeDocuments.content,
      distance: dist,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        inArray(knowledgeDocuments.domain, domains),
        isNotNull(knowledgeDocuments.embedding),
        topicFilter
      )
    )
    .orderBy(dist)
    .limit(limit);

  return results.map((row) => ({
    ...row,
    domain: row.domain as KnowledgeDomain,
    distance: typeof row.distance === 'string' ? parseFloat(row.distance) : Number(row.distance),
  }));
}
