/**
 * server/scripts/stage-existing-chunks.ts
 *
 * Phase 37a Step 3:
 * Re-chunks only the 12 existing frozen PDFs using the fixed chunker
 * and writes staging output to server/scripts/.chunk-staging.json (gitignored).
 * Zero database writes.
 *
 * Usage: npx tsx scripts/stage-existing-chunks.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { parsePdfDocument } from '../src/knowledge/pdf-parser.js';
import { chunkDocument, type DocumentChunk } from '../src/knowledge/chunker.js';

interface StagedDoc {
  docId: string;
  file: string;
  domain: string;
  topic: string;
  version: string;
  chunkCount: number;
  chunks: DocumentChunk[];
}

async function main(): Promise<void> {
  const kbDir = path.resolve(process.cwd(), '../docs/knowledge-base');
  const outPath = path.resolve(process.cwd(), 'scripts/.chunk-staging.json');

  const pdfFiles = fs.readdirSync(kbDir).filter((f) => f.endsWith('.pdf')).sort();
  if (pdfFiles.length !== 12) {
    console.warn(`Expected 12 existing PDFs in ${kbDir}, found ${pdfFiles.length}`);
  }

  const docs: StagedDoc[] = [];
  let totalChunks = 0;

  for (const file of pdfFiles) {
    const buf = fs.readFileSync(path.join(kbDir, file));
    const parsed = await parsePdfDocument(buf);
    const chunks = chunkDocument(parsed, { targetTokens: 350, overlapTokens: 50 });

    docs.push({
      docId: parsed.metadata.docId,
      file,
      domain: parsed.metadata.domain,
      topic: parsed.metadata.topic,
      version: parsed.metadata.version,
      chunkCount: chunks.length,
      chunks,
    });

    totalChunks += chunks.length;
    console.log(`  ${parsed.metadata.docId} (${file}): ${chunks.length} chunks`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    docCount: docs.length,
    totalChunks,
    docs,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\nStaged ${totalChunks} chunks across ${docs.length} docs -> ${outPath}`);
}

main().catch((err) => {
  console.error('Staging failed:', err);
  process.exit(1);
});
