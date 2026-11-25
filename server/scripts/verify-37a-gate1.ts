/**
 * server/scripts/verify-37a-gate1.ts
 *
 * Read-only verification script for Gate 1 asks:
 * - ASK 1: Compare the 6 affected production chunks + all 66 chunks vs .chunk-staging.json
 * - FOLLOW-UP A: Print 3 staging entries with chunk_key format
 * - FOLLOW-UP B: Print the 4 extra markdown-nonmatching chunks vs markdown source
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { Pool } from 'pg';

const AFFECTED_IDS = new Set([
  '64aafead-a454-4aab-a048-ac8e8a461c03',
  '9fbc24e7-6805-44a2-8e57-056b44a4b4c5',
  'f638b0c3-2dc9-4909-87f1-703439071f0e',
  '859759ac-73e9-456c-87a3-3d6964264e4a',
  '1f440385-d30e-49fa-a385-bec701da2780',
  'db883c4f-04c1-479e-be39-0af5045f9dd6',
]);

interface ProdRow {
  chunk_id: string;
  doc_id: string;
  chunk_index: number;
  section_path: string;
  content: string;
  prod_len: number;
}

interface StagedFile {
  totalChunks: number;
  docs: Array<{
    docId: string;
    chunks: Array<{
      chunkIndex: number;
      chunkKey: string;
      sectionPath: string;
      content: string;
    }>;
  }>;
}

function stripBreadcrumb(content: string): string {
  const idx = content.indexOf('\n');
  if (idx === -1) return content;
  return content.slice(0, idx).startsWith('[Policy:') ? content.slice(idx + 1) : content;
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set');

  const stagingPath = path.resolve(process.cwd(), 'scripts/.chunk-staging.json');
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf-8')) as StagedFile;

  const stagedByKey = new Map<string, { chunkKey: string; content: string; sectionPath: string }>();
  let totalStagedChars = 0;
  for (const doc of staging.docs) {
    for (const c of doc.chunks) {
      stagedByKey.set(`${doc.docId}::${c.chunkIndex}`, c);
      totalStagedChars += c.content.length;
    }
  }

  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  const { rows } = await pool.query<ProdRow>(`
    SELECT
      kc.id AS chunk_id,
      kdv.doc_id,
      kc.chunk_index,
      kc.section_path,
      kc.content,
      LENGTH(kc.content)::int AS prod_len
    FROM knowledge_chunks kc
    JOIN knowledge_doc_versions kdv ON kc.version_id = kdv.id
    WHERE kc.status = 'active' AND kdv.status = 'active'
    ORDER BY kdv.doc_id ASC, kc.chunk_index ASC
  `);
  await pool.end();

  let totalProdChars = 0;
  let affectedDeltaSum = 0;

  console.log('\n=== ASK 1: 6 Affected Chunks Comparison ===');
  console.log('chunk_id | doc_id | chunk_index | prod_length | staged_length | delta');
  for (const row of rows) {
    totalProdChars += row.prod_len;
    if (AFFECTED_IDS.has(row.chunk_id)) {
      const staged = stagedByKey.get(`${row.doc_id}::${row.chunk_index}`);
      const stagedLen = staged ? staged.content.length : 0;
      const delta = stagedLen - row.prod_len;
      affectedDeltaSum += delta;
      console.log(
        `${row.chunk_id} | ${row.doc_id} | ${row.chunk_index} | ${row.prod_len} | ${stagedLen} | +${delta}`
      );
    }
  }
  console.log(`Total delta across 6 affected chunks: +${affectedDeltaSum} chars`);
  console.log(`Total chars in staging (all ${staging.totalChunks} chunks): ${totalStagedChars}`);
  console.log(`Total chars in production (all ${rows.length} chunks): ${totalProdChars}`);
  console.log(`Total corpus delta (staged - prod): +${totalStagedChars - totalProdChars} chars`);

  console.log('\n=== FOLLOW-UP A: 3 Staging Entries (chunk_key format) ===');
  const sampleDocs = staging.docs.slice(0, 3);
  for (const d of sampleDocs) {
    const c = d.chunks[0];
    if (c) {
      console.log(
        `doc_id=${d.docId} | chunk_index=${c.chunkIndex} | chunk_key=${c.chunkKey} | content_80=${JSON.stringify(c.content.slice(0, 80))}`
      );
    }
  }

  console.log('\n=== FOLLOW-UP B: 4 Extra Markdown-Nonmatching Chunks (Match PDF, Mismatch Raw MD) ===');
  const srcDir = path.resolve(process.cwd(), '../docs/knowledge-base/src');
  const mdByDocId = new Map<string, string>();
  for (const f of fs.readdirSync(srcDir).filter((n) => n.endsWith('.md'))) {
    const { data, content } = matter(fs.readFileSync(path.join(srcDir, f), 'utf-8'));
    mdByDocId.set(String(data.docId), content);
  }

  for (const row of rows) {
    if (AFFECTED_IDS.has(row.chunk_id)) continue;
    const body = normalizeWs(stripBreadcrumb(row.content));
    const mdRaw = mdByDocId.get(row.doc_id) ?? '';
    if (!normalizeWs(mdRaw).includes(body)) {
      // Find matching section in markdown
      const secHeading = row.section_path.split(' > ').pop() ?? row.section_path;
      const secIdx = mdRaw.indexOf(secHeading);
      const mdSnippet =
        secIdx !== -1
          ? normalizeWs(mdRaw.slice(secIdx, secIdx + 220))
          : normalizeWs(mdRaw.slice(0, 150));
      console.log(`- chunk_id=${row.chunk_id} | doc_id=${row.doc_id} | idx=${row.chunk_index} | section="${row.section_path}"`);
      console.log(`  (a) prod_chunk[0..100]: ${JSON.stringify(body.slice(0, 100))}`);
      console.log(`  (b) md_source[0..100]:  ${JSON.stringify(mdSnippet.slice(0, 100))}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
