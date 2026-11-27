/**
 * server/scripts/audit-chunk-truncation.ts
 *
 * Phase 37a Step 2 (READ-ONLY):
 * Production chunk-truncation audit against knowledge_chunks.
 * Compares every active production chunk's body against:
 *   (a) PDF-extracted text (parsePdfDocument + cleanText) — true Phase 29 ingest source
 *   (b) Raw markdown source (docs/knowledge-base/src/*.md)
 *
 * Usage: npx tsx scripts/audit-chunk-truncation.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { Pool } from 'pg';
import { parsePdfDocument } from '../src/knowledge/pdf-parser.js';
import { cleanText } from '../src/knowledge/text-cleaner.js';

interface ProductionChunkRow {
  chunk_id: string;
  doc_id: string;
  domain: string;
  topic: string;
  section_path: string;
  chunk_index: number;
  content: string;
}

interface PdfDocData {
  docId: string;
  pdfFile: string;
  fullText: string;
  sectionTexts: Map<string, string>;
}

interface MdDocData {
  docId: string;
  mdFile: string;
  rawBody: string;
  cleanedBody: string;
}

function stripBreadcrumb(content: string): string {
  const idx = content.indexOf('\n');
  if (idx === -1) return content;
  const firstLine = content.slice(0, idx);
  if (firstLine.startsWith('[Policy:')) {
    return content.slice(idx + 1);
  }
  return content;
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Estimates lost characters when chunkBody is a subsequence/truncated version of sourceSectionText.
 */
function estimateTruncation(
  sourceText: string,
  chunkBody: string
): { isTruncated: boolean; lostChars: number; missingSample: string } {
  if (sourceText.includes(chunkBody)) {
    return { isTruncated: false, lostChars: 0, missingSample: '' };
  }

  // If chunkBody is shorter or has missing fragments, locate where chunkBody starts in sourceText
  // by finding the longest suffix of chunkBody or matching words.
  const normSource = normalizeWs(sourceText);
  const normChunk = normalizeWs(chunkBody);
  if (normSource.includes(normChunk)) {
    return { isTruncated: false, lostChars: 0, missingSample: '' };
  }

  // Try matching the tail of chunkBody in normSource to see if leading fragment was dropped
  const words = normChunk.split(' ');
  const tailAnchor = words.slice(-Math.min(6, words.length)).join(' ');
  const anchorIdx = normSource.indexOf(tailAnchor);

  if (anchorIdx !== -1) {
    const expectedFullEnd = anchorIdx + tailAnchor.length;
    // Find where the first matching word of normChunk appears before anchorIdx
    const headAnchor = words.slice(0, Math.min(4, words.length)).join(' ');
    const headIdx = normSource.indexOf(headAnchor);
    if (headIdx > 0 && headIdx < anchorIdx) {
      // Leading text in section was dropped!
      const missingPrefix = normSource.slice(0, headIdx).trim();
      return {
        isTruncated: true,
        lostChars: missingPrefix.length,
        missingSample: missingPrefix.slice(0, 120),
      };
    }
    const lost = Math.max(0, expectedFullEnd - normChunk.length);
    return {
      isTruncated: true,
      lostChars: lost > 0 ? lost : Math.max(1, normSource.length - normChunk.length),
      missingSample: normSource.slice(0, 120),
    };
  }

  const diff = Math.max(1, normSource.length - normChunk.length);
  return {
    isTruncated: true,
    lostChars: diff,
    missingSample: normSource.slice(0, 120),
  };
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL must be set');
  }

  const kbDir = path.resolve(process.cwd(), '../docs/knowledge-base');
  const srcDir = path.join(kbDir, 'src');

  // 1. Load & parse all PDFs
  const pdfMap = new Map<string, PdfDocData>();
  const pdfFiles = fs.readdirSync(kbDir).filter((f) => f.endsWith('.pdf')).sort();
  for (const file of pdfFiles) {
    const buf = fs.readFileSync(path.join(kbDir, file));
    const parsed = await parsePdfDocument(buf);
    const sectionTexts = new Map<string, string>();
    const allParts: string[] = [];
    for (const sec of parsed.sections) {
      const cleaned = cleanText(sec.paragraphs.join(' '));
      sectionTexts.set(sec.sectionPath, cleaned);
      if (cleaned) allParts.push(cleaned);
    }
    pdfMap.set(parsed.metadata.docId, {
      docId: parsed.metadata.docId,
      pdfFile: file,
      fullText: allParts.join(' '),
      sectionTexts,
    });
  }

  // 2. Load all markdown sources
  const mdMap = new Map<string, MdDocData>();
  const mdFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
  for (const file of mdFiles) {
    const raw = fs.readFileSync(path.join(srcDir, file), 'utf-8');
    const { data, content } = matter(raw);
    const docId = String(data.docId ?? '');
    if (docId) {
      mdMap.set(docId, {
        docId,
        mdFile: file,
        rawBody: content,
        cleanedBody: cleanText(content.replace(/^#+\s+/gm, '')),
      });
    }
  }

  // 3. Query production active chunks (READ-ONLY)
  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  const { rows } = await pool.query<ProductionChunkRow>(`
    SELECT
      c.id AS chunk_id,
      v.doc_id,
      c.domain,
      c.topic,
      c.section_path,
      c.chunk_index,
      c.content
    FROM knowledge_chunks c
    JOIN knowledge_doc_versions v ON v.id = c.version_id
    WHERE c.status = 'active' AND v.status = 'active'
    ORDER BY v.doc_id ASC, c.chunk_index ASC
  `);
  await pool.end();

  console.log(`\n=== Production Chunk-Truncation Audit (READ-ONLY) ===`);
  console.log(`Active production chunks queried: ${rows.length}`);
  console.log(`PDF sources parsed: ${pdfMap.size}`);
  console.log(`Markdown sources loaded: ${mdMap.size}\n`);

  const pdfTruncated: Array<{
    chunk_id: string;
    doc_id: string;
    section_path: string;
    chunk_index: number;
    lost_chars: number;
    missing_sample: string;
    chunk_body_preview: string;
  }> = [];

  let mdRawMismatchCount = 0;

  for (const row of rows) {
    const chunkBody = stripBreadcrumb(row.content);
    const pdfDoc = pdfMap.get(row.doc_id);
    const mdDoc = mdMap.get(row.doc_id);

    if (!pdfDoc) {
      console.warn(`WARNING: No PDF found for doc_id=${row.doc_id}`);
      continue;
    }

    const sectionText = pdfDoc.sectionTexts.get(row.section_path) ?? pdfDoc.fullText;
    const pdfCheck = estimateTruncation(sectionText, chunkBody);
    if (pdfCheck.isTruncated) {
      pdfTruncated.push({
        chunk_id: row.chunk_id,
        doc_id: row.doc_id,
        section_path: row.section_path,
        chunk_index: row.chunk_index,
        lost_chars: pdfCheck.lostChars,
        missing_sample: pdfCheck.missingSample,
        chunk_body_preview: chunkBody.slice(0, 100),
      });
    }

    if (mdDoc && !normalizeWs(mdDoc.rawBody).includes(normalizeWs(chunkBody))) {
      mdRawMismatchCount++;
    }
  }

  console.log(`--- Results ---`);
  console.log(`(a) Chunks truncated vs PDF-extracted text (pdf-parser + text-cleaner): ${pdfTruncated.length} / ${rows.length}`);
  console.log(`(b) Chunks non-matching vs raw markdown: ${mdRawMismatchCount} / ${rows.length}`);
  console.log(`    (Markdown differs due to markdown heading/formatting syntax & PDF line-wrap normalization.)\n`);

  if (pdfTruncated.length > 0) {
    console.log(`Affected Chunks (PDF-extracted comparison):`);
    for (const item of pdfTruncated) {
      console.log(
        `  - chunk_id=${item.chunk_id} | doc_id=${item.doc_id} | idx=${item.chunk_index} | section="${item.section_path}" | est_lost_chars=${item.lost_chars}`
      );
      console.log(`    missing_prefix_sample: "${item.missing_sample}"`);
      console.log(`    stored_chunk_start:    "${item.chunk_body_preview}"`);
    }
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
