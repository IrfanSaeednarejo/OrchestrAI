/**
 * server/scripts/diagnostic-explain.ts
 * Captures EXPLAIN ANALYZE plans and latencies for dense, sparse, and hybrid retrieval paths.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

async function main() {
  const cacheDir = path.resolve(import.meta.dirname, '.embed-cache');
  const cacheFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  if (cacheFiles.length === 0) {
    throw new Error('No cached embeddings found.');
  }

  const sampleCache = JSON.parse(fs.readFileSync(path.join(cacheDir, cacheFiles[0]), 'utf8'));
  const embedding = sampleCache.embedding;
  const embeddingJson = JSON.stringify(embedding);
  const sampleText = sampleCache.text;

  console.log('='.repeat(70));
  console.log(`EXPLAIN ANALYZE Diagnostic for Sample Query: "${sampleText}"`);
  console.log(`Embedding dimensions: ${embedding.length}`);
  console.log('='.repeat(70));

  // 1. Dense Scoped (default planner)
  console.log('\n--- 1. Dense Scoped (default planner) ---');
  const t0Scoped = performance.now();
  const res1 = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL hnsw.iterative_scan = relaxed_order;
      SET LOCAL hnsw.ef_search = 100;
      SET LOCAL hnsw.max_scan_tuples = 40000;
    `);
    return await tx.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
      SELECT 
        c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
        v.version, v.effective_date AS "effectiveDate",
        (c.embedding <=> ${embeddingJson}::vector) AS distance
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = 'orders'
        AND c.topic = 'returns'
        AND c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT 9;
    `);
  });
  const tScopedMs = performance.now() - t0Scoped;
  console.log(`Client Round-Trip: ${tScopedMs.toFixed(2)} ms`);
  console.log(res1.rows.map(r => (r as any)['QUERY PLAN']).join('\n'));

  // 2. Dense Scoped (enable_seqscan = off)
  console.log('\n--- 2. Dense Scoped (SET LOCAL enable_seqscan = off) ---');
  const t0ScopedNoSeq = performance.now();
  const res2 = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL enable_seqscan = off;
      SET LOCAL hnsw.iterative_scan = relaxed_order;
      SET LOCAL hnsw.ef_search = 100;
      SET LOCAL hnsw.max_scan_tuples = 40000;
    `);
    return await tx.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
      SELECT 
        c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
        v.version, v.effective_date AS "effectiveDate",
        (c.embedding <=> ${embeddingJson}::vector) AS distance
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = 'orders'
        AND c.topic = 'returns'
        AND c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT 9;
    `);
  });
  const tScopedNoSeqMs = performance.now() - t0ScopedNoSeq;
  console.log(`Client Round-Trip: ${tScopedNoSeqMs.toFixed(2)} ms`);
  console.log(res2.rows.map(r => (r as any)['QUERY PLAN']).join('\n'));

  // 3. Dense Unscoped (default planner)
  console.log('\n--- 3. Dense Unscoped (default planner) ---');
  const t0Unscoped = performance.now();
  const res3 = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL hnsw.iterative_scan = relaxed_order;
      SET LOCAL hnsw.ef_search = 100;
      SET LOCAL hnsw.max_scan_tuples = 40000;
    `);
    return await tx.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
      SELECT 
        c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
        v.version, v.effective_date AS "effectiveDate",
        (c.embedding <=> ${embeddingJson}::vector) AS distance
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT 9;
    `);
  });
  const tUnscopedMs = performance.now() - t0Unscoped;
  console.log(`Client Round-Trip: ${tUnscopedMs.toFixed(2)} ms`);
  console.log(res3.rows.map(r => (r as any)['QUERY PLAN']).join('\n'));

  // 4. Dense Unscoped (enable_seqscan = off)
  console.log('\n--- 4. Dense Unscoped (SET LOCAL enable_seqscan = off) ---');
  const t0UnscopedNoSeq = performance.now();
  const res4 = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SET LOCAL enable_seqscan = off;
      SET LOCAL hnsw.iterative_scan = relaxed_order;
      SET LOCAL hnsw.ef_search = 100;
      SET LOCAL hnsw.max_scan_tuples = 40000;
    `);
    return await tx.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
      SELECT 
        c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
        v.version, v.effective_date AS "effectiveDate",
        (c.embedding <=> ${embeddingJson}::vector) AS distance
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.status = 'active'
      ORDER BY c.embedding <=> ${embeddingJson}::vector
      LIMIT 9;
    `);
  });
  const tUnscopedNoSeqMs = performance.now() - t0UnscopedNoSeq;
  console.log(`Client Round-Trip: ${tUnscopedNoSeqMs.toFixed(2)} ms`);
  console.log(res4.rows.map(r => (r as any)['QUERY PLAN']).join('\n'));

  // 5. Sparse Scoped
  console.log('\n--- 5. Sparse Scoped ---');
  const t0Sparse = performance.now();
  const res5 = await db.execute(sql`
    EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
    SELECT 
      c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
      v.version, v.effective_date AS "effectiveDate",
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${sampleText})) AS rank
    FROM knowledge_chunks c
    JOIN knowledge_doc_versions v ON c.version_id = v.id
    WHERE c.domain = 'orders'
      AND c.topic = 'returns'
      AND c.status = 'active'
      AND c.search_vector @@ websearch_to_tsquery('english', ${sampleText})
    ORDER BY rank DESC
    LIMIT 9;
  `);
  const tSparseMs = performance.now() - t0Sparse;
  console.log(`Client Round-Trip: ${tSparseMs.toFixed(2)} ms`);
  console.log(res5.rows.map(r => (r as any)['QUERY PLAN']).join('\n'));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
