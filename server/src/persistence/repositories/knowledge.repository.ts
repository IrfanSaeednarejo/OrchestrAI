/**
 * server/src/persistence/repositories/knowledge.repository.ts
 * Implements Part C (Dense/Sparse queries with pgvector relaxed_order, transactional upserts with supersession).
 */

import {
  sql,
  eq,
  ne,
  and,
  count,
  inArray,
  isNotNull,
  cosineDistance,
  type InferInsertModel,
  type InferSelectModel,
} from 'drizzle-orm';
import { db } from '../db/client.js';
import { retrievalDb } from '../db/retrieval-client.js';
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

export interface HybridCteSearchRow extends KnowledgeSearchRow {
  rrfScore: number;
  denseRank: number | null;
  sparseRank: number | null;
}

export interface ChunkInsertPayload {
  sectionPath: string;
  chunkIndex: number;
  chunkKey: string;
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
 * Searches dense candidates via HNSW using the dedicated retrieval pool.
 *
 * Phase 36 Layer A: The retrieval pool (retrieval-client.ts) connects to Neon's
 * unpooled (direct) endpoint with HNSW GUCs set at connection level via the
 * `options` startup parameter:
 *   hnsw.ef_search        = 100
 *   hnsw.iterative_scan   = relaxed_order
 *   hnsw.max_scan_tuples  = 40000
 *
 * This eliminates the BEGIN/COMMIT transaction and 3× SET LOCAL statements
 * that previously added 4 serial round-trips (~900ms WAN) to every retrieval call.
 * The query now runs as a single autocommit statement.
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

  const result = await retrievalDb.execute(sql`
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
}

/**
 * Searches sparse candidates via PostgreSQL tsvector full-text search.
 * Uses the retrieval pool (direct unpooled endpoint) for consistency with searchDenseScoped.
 */
export async function searchSparseScoped(
  queryText: string,
  domain: KnowledgeDomain,
  topic: string,
  topK: number
): Promise<KnowledgeSearchRow[]> {
  const limitCandidates = topK * 3;

  const result = await retrievalDb.execute(sql`
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
 * Phase 36 Step 4 (Layer B): Single-CTE Hybrid Retrieval with in-SQL Reciprocal Rank Fusion (RRF k=60).
 * Consolidates dense vector search, sparse full-text search, and rank-based fusion into
 * exactly ONE database round-trip statement using the retrieval pool.
 */
export async function searchHybridScopedCTE(
  embedding: number[],
  queryText: string,
  domain: KnowledgeDomain,
  topic: string,
  topK: number
): Promise<HybridCteSearchRow[]> {
  assertValidEmbedding(embedding);
  const limitCandidates = topK * 3;
  const embeddingJson = JSON.stringify(embedding);

  const result = await retrievalDb.execute(sql`
    WITH dense AS (
      SELECT 
        c.id, c.version_id, c.domain, c.topic, c.section_path, c.content,
        v.version, v.effective_date,
        (c.embedding <=> ${embeddingJson}::vector) AS distance,
        ROW_NUMBER() OVER (ORDER BY c.embedding <=> ${embeddingJson}::vector) AS dense_rank
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = ${domain} AND c.topic = ${topic} AND c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT ${limitCandidates}
    ),
    sparse AS (
      SELECT 
        c.id, c.version_id, c.domain, c.topic, c.section_path, c.content,
        v.version, v.effective_date,
        ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${queryText})) AS rank_score,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${queryText})) DESC) AS sparse_rank
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = ${domain} AND c.topic = ${topic} AND c.status = 'active'
        AND c.search_vector @@ websearch_to_tsquery('english', ${queryText})
      ORDER BY rank_score DESC
      LIMIT ${limitCandidates}
    ),
    combined AS (
      SELECT id, 1.0 / (60 + dense_rank) AS rrf_contrib, dense_rank, NULL::bigint AS sparse_rank, distance FROM dense
      UNION ALL
      SELECT id, 1.0 / (60 + sparse_rank) AS rrf_contrib, NULL::bigint AS dense_rank, sparse_rank, NULL::double precision AS distance FROM sparse
    ),
    fused AS (
      SELECT 
        id,
        SUM(rrf_contrib) AS rrf_score,
        MIN(dense_rank) AS dense_rank,
        MIN(sparse_rank) AS sparse_rank,
        MIN(distance) AS distance
      FROM combined
      GROUP BY id
    )
    SELECT 
      c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
      v.version, v.effective_date AS "effectiveDate",
      f.distance,
      f.rrf_score AS "rrfScore",
      f.dense_rank AS "denseRank",
      f.sparse_rank AS "sparseRank"
    FROM fused f
    JOIN knowledge_chunks c ON f.id = c.id
    JOIN knowledge_doc_versions v ON c.version_id = v.id
    ORDER BY f.rrf_score DESC, f.distance ASC NULLS LAST, c.id ASC
    LIMIT ${topK};
  `);

  return (result.rows as unknown as Array<{
    id: string;
    versionId: string;
    domain: KnowledgeDomain;
    topic: string;
    sectionPath: string;
    content: string;
    version: string;
    effectiveDate: Date;
    distance?: number | string | null;
    rrfScore: number | string;
    denseRank: number | string | null;
    sparseRank: number | string | null;
  }>).map((row) => ({
    ...row,
    distance: row.distance != null ? Number(row.distance) : undefined,
    rrfScore: Number(row.rrfScore),
    denseRank: row.denseRank != null ? Number(row.denseRank) : null,
    sparseRank: row.sparseRank != null ? Number(row.sparseRank) : null,
  }));
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
 * Supersedes older active versions of the same docId non-destructively (OD-37a).
 * Enforces same-version content-hash guard and idempotent (version_id, chunk_key) upsert (OD-37b).
 */
export async function upsertKnowledgeVersion(
  versionMeta: DocumentVersionInsertPayload,
  chunks: ChunkInsertPayload[]
): Promise<{ versionId: string; chunksInserted: number }> {
  return db.transaction(async (tx) => {
    // 1. Check for existing version row for (docId, version) — same-version content-hash guard
    const [existingSameVersion] = await tx
      .select({
        id: knowledgeDocVersions.id,
        fileHash: knowledgeDocVersions.fileHash,
      })
      .from(knowledgeDocVersions)
      .where(
        and(
          eq(knowledgeDocVersions.docId, versionMeta.docId),
          eq(knowledgeDocVersions.version, versionMeta.version)
        )
      )
      .limit(1);

    if (existingSameVersion && existingSameVersion.fileHash !== versionMeta.fileHash) {
      throw new Error(
        `SAME_VERSION_CONTENT_HASH_MISMATCH: ${versionMeta.docId} v${versionMeta.version} already exists with fileHash=${existingSameVersion.fileHash}, incoming=${versionMeta.fileHash}`
      );
    }

    let versionId: string;
    if (existingSameVersion) {
      versionId = existingSameVersion.id;

      // Also guard chunk-level content hashes on same-version retry
      const existingChunks = await tx
        .select({
          chunkKey: knowledgeChunks.chunkKey,
          contentHash: knowledgeChunks.contentHash,
        })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.versionId, versionId),
            eq(knowledgeChunks.status, 'active')
          )
        );
      const existingHashByKey = new Map(existingChunks.map((ec) => [ec.chunkKey, ec.contentHash]));
      for (const c of chunks) {
        const prevHash = existingHashByKey.get(c.chunkKey);
        if (prevHash !== undefined && prevHash !== c.contentHash) {
          throw new Error(
            `SAME_VERSION_CHUNK_HASH_MISMATCH: ${versionMeta.docId} v${versionMeta.version} chunk_key=${c.chunkKey} has content_hash=${prevHash}, incoming=${c.contentHash}`
          );
        }
      }
    } else {
      // Insert new version record as draft first
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
      versionId = insertedVersion.id;
    }

    // 2. Upsert chunks via ON CONFLICT (version_id, chunk_key) WHERE status = 'active'
    const targetStatus = existingSameVersion ? ('active' as const) : ('draft' as const);
    if (chunks.length > 0) {
      await tx
        .insert(knowledgeChunks)
        .values(
          chunks.map((c) => ({
            versionId,
            domain: versionMeta.domain,
            topic: versionMeta.topic,
            sectionPath: c.sectionPath,
            chunkIndex: c.chunkIndex,
            chunkKey: c.chunkKey,
            content: c.content,
            contentHash: c.contentHash,
            embedding: c.embedding,
            status: targetStatus,
          }))
        )
        .onConflictDoUpdate({
          target: [knowledgeChunks.versionId, knowledgeChunks.chunkKey],
          targetWhere: sql`status = 'active'`,
          set: {
            sectionPath: sql`excluded.section_path`,
            chunkIndex: sql`excluded.chunk_index`,
            content: sql`excluded.content`,
            contentHash: sql`excluded.content_hash`,
            embedding: sql`excluded.embedding`,
            status: sql`excluded.status`,
          },
        });
    }

    // 3. Demote currently active prior versions of THIS docId to 'superseded' (OD-37a)
    const priorActiveVersions = await tx
      .select({ id: knowledgeDocVersions.id })
      .from(knowledgeDocVersions)
      .where(
        and(
          eq(knowledgeDocVersions.docId, versionMeta.docId),
          eq(knowledgeDocVersions.status, 'active'),
          ne(knowledgeDocVersions.id, versionId)
        )
      );

    if (priorActiveVersions.length > 0) {
      const priorIds = priorActiveVersions.map((v) => v.id);
      await tx
        .update(knowledgeDocVersions)
        .set({ status: 'superseded' })
        .where(inArray(knowledgeDocVersions.id, priorIds));

      await tx
        .update(knowledgeChunks)
        .set({ status: 'superseded' })
        .where(
          and(
            inArray(knowledgeChunks.versionId, priorIds),
            eq(knowledgeChunks.status, 'active')
          )
        );
    }

    // 4. Promote new version and chunks to 'active'
    await tx
      .update(knowledgeDocVersions)
      .set({ status: 'active' })
      .where(eq(knowledgeDocVersions.id, versionId));

    await tx
      .update(knowledgeChunks)
      .set({ status: 'active' })
      .where(
        and(
          eq(knowledgeChunks.versionId, versionId),
          eq(knowledgeChunks.status, 'draft')
        )
      );

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
