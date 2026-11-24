/**
 * server/scripts/diagnose-cte-explain.ts
 *
 * Task B — p95 Diagnosis:
 * Runs EXPLAIN (ANALYZE, BUFFERS) on the Layer B CTE query 10 times in a tight loop.
 * Reports: run#, plan_ms, exec_ms, total_wall_ms, plan_summary.
 * Analyzes plan stability, index scans vs sequential scans, and join choices.
 */

import 'dotenv/config';
import { retrievalPool } from '../src/persistence/db/retrieval-client.js';

async function main() {
  console.log('=== Task B — Layer B Single-CTE EXPLAIN (ANALYZE, BUFFERS) 10x Diagnosis ===');

  const client = await retrievalPool.connect();

  const domain = 'orders';
  const topic = 'returns';
  const topK = 3;
  const limitCandidates = topK * 3;
  const queryText = 'How long do I have to return an item?';
  const embeddingJson = JSON.stringify(new Array(768).fill(0).map((_, i) => Math.sin(i + 1) / Math.sqrt(768)));

  const explainSql = `
    EXPLAIN (ANALYZE, BUFFERS)
    WITH dense AS (
      SELECT 
        c.id, c.version_id, c.domain, c.topic, c.section_path, c.content,
        v.version, v.effective_date,
        (c.embedding <=> '${embeddingJson}'::vector) AS distance,
        ROW_NUMBER() OVER (ORDER BY c.embedding <=> '${embeddingJson}'::vector) AS dense_rank
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = '${domain}' AND c.topic = '${topic}' AND c.status = 'active'
      ORDER BY c.embedding <=> '${embeddingJson}'::vector
      LIMIT ${limitCandidates}
    ),
    sparse AS (
      SELECT 
        c.id, c.version_id, c.domain, c.topic, c.section_path, c.content,
        v.version, v.effective_date,
        ts_rank_cd(c.search_vector, websearch_to_tsquery('english', '${queryText}')) AS rank_score,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.search_vector, websearch_to_tsquery('english', '${queryText}')) DESC) AS sparse_rank
      FROM knowledge_chunks c
      JOIN knowledge_doc_versions v ON c.version_id = v.id
      WHERE c.domain = '${domain}' AND c.topic = '${topic}' AND c.status = 'active'
        AND c.search_vector @@ websearch_to_tsquery('english', '${queryText}')
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
  `;

  interface RunDiag {
    run: number;
    planMs: number;
    execMs: number;
    wallMs: number;
    summary: string;
    rawLines: string[];
  }

  const runs: RunDiag[] = [];

  try {
    // 10 tight loop executions
    for (let i = 1; i <= 10; i++) {
      const start = performance.now();
      const res = await client.query(explainSql);
      const wallMs = Number((performance.now() - start).toFixed(2));

      const lines: string[] = res.rows.map((r: Record<string, string>) => Object.values(r)[0] ?? '');
      const planTimeLine = lines.find((l) => l.includes('Planning Time:'));
      const execTimeLine = lines.find((l) => l.includes('Execution Time:'));

      const planMs = planTimeLine ? parseFloat(planTimeLine.replace(/[^0-9.]/g, '')) : 0;
      const execMs = execTimeLine ? parseFloat(execTimeLine.replace(/[^0-9.]/g, '')) : 0;

      // Extract scan and join summary
      const scanTypes: string[] = [];
      if (lines.some((l) => l.includes('Index Scan') || l.includes('Index Only Scan'))) scanTypes.push('IndexScan');
      if (lines.some((l) => l.includes('Seq Scan'))) scanTypes.push('SeqScan');
      if (lines.some((l) => l.includes('Bitmap Index Scan'))) scanTypes.push('BitmapScan');
      const joins: string[] = [];
      if (lines.some((l) => l.includes('Hash Join'))) joins.push('HashJoin');
      if (lines.some((l) => l.includes('Nested Loop'))) joins.push('NestedLoop');
      if (lines.some((l) => l.includes('Merge Join'))) joins.push('MergeJoin');

      const summary = `${scanTypes.join('+') || 'None'} / ${joins.join('+') || 'None'}`;

      runs.push({
        run: i,
        planMs,
        execMs,
        wallMs,
        summary,
        rawLines: lines,
      });
    }

    console.log('\n========================================================================================');
    console.log('                 TASK B: 10x EXPLAIN (ANALYZE, BUFFERS) DIAGNOSIS TABLE                ');
    console.log('========================================================================================');
    console.log('Run   Plan (ms)   Exec (ms)   Total Wall (ms)   DB-Total (ms)   Plan Summary');
    console.log('----------------------------------------------------------------------------------------');
    for (const r of runs) {
      const dbTotal = (r.planMs + r.execMs).toFixed(2);
      console.log(
        `${String(r.run).padStart(3)}   ${r.planMs.toFixed(2).padStart(9)}   ${r.execMs.toFixed(2).padStart(9)}   ${r.wallMs.toFixed(2).padStart(15)}   ${dbTotal.padStart(13)}   ${r.summary}`
      );
    }
    console.log('========================================================================================');

    console.log('\nRepresentative execution plan (Run 1):');
    for (const l of runs[0]!.rawLines) {
      console.log('  ' + l);
    }
  } finally {
    client.release();
    await retrievalPool.end();
  }
}

main().catch((err: unknown) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
