/**
 * server/src/knowledge/ingest.ts
 * Production CLI ingestion script for PDF knowledge base documents.
 * Usage: npm run knowledge:ingest -- --dir docs/knowledge-base
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parsePdfDocument } from './pdf-parser.js';
import { chunkDocument, DocumentChunk } from './chunker.js';
import { embedBatch } from './embeddings-client.js';
import {
  findActiveDocVersionByHash,
  findExistingChunkEmbedding,
  upsertKnowledgeVersion,
  ChunkInsertPayload,
  DocumentVersionInsertPayload,
} from '../persistence/repositories/knowledge.repository.js';
import { KnowledgeDomain } from '../persistence/db/schema.js';

// ── Peak RSS tracking ─────────────────────────────────────────────────────────
let _peakRss = 0;
function sampleRss(): void {
  const rss = process.memoryUsage().rss;
  if (rss > _peakRss) _peakRss = rss;
}
process.on('exit', () => {
  if (process.env.LOG_PEAK_RSS !== '1') return;
  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync('logs/peak_rss.log', `${Math.round(_peakRss / (1024 * 1024))}\n`);
});

function parseCliArgs(): { targetDir: string; concurrency: number; dryRun: boolean; candidateFactor: number } {
  const args = process.argv.slice(2);
  let targetDir = '../docs/knowledge-base';
  let concurrency = 3;
  let dryRun = false;
  let candidateFactor = 3;

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    const next = args[i + 1];
    if (current === '--dir' && next) {
      targetDir = next;
      i++;
    }
    if (current === '--concurrency' && next) {
      concurrency = parseInt(next, 10);
      i++;
    }
    if (current === '--dry-run') {
      dryRun = true;
    }
    if (current === '--candidate-factor' && next) {
      candidateFactor = parseInt(next, 10);
      i++;
    }
  }

  // Resolve directory relative to cwd
  const resolvedDir = path.resolve(process.cwd(), targetDir);
  return { targetDir: resolvedDir, concurrency, dryRun, candidateFactor };
}

export async function ingestPdfKnowledgeBase(
  targetDir: string,
  concurrency = 3,
  dryRun = false,
  candidateFactor = 3
) {
  console.log(`\n=== OrchestrAI PDF Knowledge Ingestion ===`);
  console.log(`Source directory: ${targetDir}`);
  if (candidateFactor !== 3) {
    console.log(`Candidate factor: ${candidateFactor}`);
  }
  if (dryRun) console.log(`[DRY-RUN] Mode active — no embeddings or DB writes.`);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  const files = fs
    .readdirSync(targetDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `INGEST_ERROR_NO_PDFS: No PDF documents found in target directory "${targetDir}". Run 'npx tsx scripts/generate-policy-pdfs.ts' first, or ensure PDFs are committed.`
    );
  }

  console.log(`Found ${files.length} PDF document(s) to process.\n`);

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalChunksIngested = 0;
  let totalEmbeddingsComputed = 0;
  let totalEmbeddingsReused = 0;

  // Dynamic import of p-limit for concurrent PDF processing
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrency);

  const results = await Promise.all(
    files.map((file) =>
      limit(async () => {
        const fullPath = path.join(targetDir, file);
        console.log(`Processing: ${file}...`);
        sampleRss();

        const pdfBuffer = fs.readFileSync(fullPath);
        const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

        // 1. Check idempotency: Has this exact file been ingested as active?
        if (!dryRun) {
          const existingVersion = await findActiveDocVersionByHash(fileHash);
          if (existingVersion) {
            console.log(`  ↷ Skipped: identical file hash already active (version: ${existingVersion.version}).`);
            return { processed: 0, skipped: 1, chunksIngested: 0, embeddingsComputed: 0, embeddingsReused: 0 };
          }
        }

        // 2. Parse PDF and extract XMP metadata & structured sections
        const parsed = await parsePdfDocument(pdfBuffer);
        const meta = parsed.metadata;
        console.log(`  Metadata: [${meta.domain} / ${meta.topic}] v${meta.version} (${meta.docId})`);
        sampleRss();

        // 3. Chunk sections with breadcrumb headers & overlap
        const chunks: DocumentChunk[] = chunkDocument(parsed, {
          targetTokens: 350,
          overlapTokens: 50,
        });
        console.log(`  Generated ${chunks.length} section chunk(s).`);

        // Dry-run: cost estimate and early exit
        if (dryRun) {
          const tokenEstimate = chunks.reduce((s, c) => s + Math.ceil(c.content.length / 4), 0);
          const cost = (tokenEstimate / 1000) * 0.0002;
          console.log(
            `  [DRY-RUN] ${file}: ${chunks.length} chunks, ~${tokenEstimate} tokens, ESTIMATE: $${cost.toFixed(6)}`
          );
          return { processed: 0, skipped: 0, chunksIngested: 0, embeddingsComputed: 0, embeddingsReused: 0 };
        }

        // 4. Check for chunk embedding reuse across versions
        const chunksToEmbed: { chunk: DocumentChunk; index: number }[] = [];
        const preparedChunks: { chunk: DocumentChunk; embedding?: number[] }[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk) continue;
          const existingEmbedding = await findExistingChunkEmbedding(chunk.contentHash);
          if (existingEmbedding) {
            preparedChunks[i] = { chunk, embedding: existingEmbedding };
          } else {
            chunksToEmbed.push({ chunk, index: i });
          }
        }

        let embeddingsComputed = 0;
        const embeddingsReused = chunks.length - chunksToEmbed.length;

        // 5. Generate embeddings for new or changed chunks (sequential batches per PDF)
        if (chunksToEmbed.length > 0) {
          console.log(`  Computing embeddings for ${chunksToEmbed.length} new/modified chunk(s)...`);
          const textsToEmbed = chunksToEmbed.map((item) => item.chunk.content);
          const embeddings = await embedBatch(textsToEmbed);

          for (let i = 0; i < chunksToEmbed.length; i++) {
            const item = chunksToEmbed[i];
            const emb = embeddings[i];
            if (!item || !emb) continue;
            preparedChunks[item.index] = { chunk: item.chunk, embedding: emb };
          }
          embeddingsComputed = chunksToEmbed.length;
          sampleRss();
        }

        // 6. Assemble transactional payload
        const versionPayload: DocumentVersionInsertPayload = {
          docId: meta.docId,
          domain: meta.domain as KnowledgeDomain,
          topic: meta.topic,
          documentType: meta.documentType,
          version: meta.version,
          effectiveDate: new Date(meta.effectiveDate),
          fileHash,
        };

        const chunkPayloads: ChunkInsertPayload[] = preparedChunks.map((item) => {
          if (!item.embedding) {
            throw new Error(`Missing embedding for chunk index ${item.chunk.chunkIndex}`);
          }
          return {
            sectionPath: item.chunk.sectionPath,
            chunkIndex: item.chunk.chunkIndex,
            chunkKey: String(item.chunk.chunkIndex + 1).padStart(2, '0'),
            content: item.chunk.content,
            contentHash: item.chunk.contentHash,
            embedding: item.embedding,
          };
        });

        // 7. Atomic transaction: supersede previous active version and activate new version
        const result = await upsertKnowledgeVersion(versionPayload, chunkPayloads);
        console.log(`  ✓ Activated version ${meta.version} (${result.chunksInserted} chunks active).`);

        return {
          processed: 1,
          skipped: 0,
          chunksIngested: result.chunksInserted,
          embeddingsComputed,
          embeddingsReused,
        };
      })
    )
  );

  for (const r of results) {
    totalProcessed += r.processed;
    totalSkipped += r.skipped;
    totalChunksIngested += r.chunksIngested;
    totalEmbeddingsComputed += r.embeddingsComputed;
    totalEmbeddingsReused += r.embeddingsReused;
  }

  console.log(`\n=== Knowledge Ingestion Complete ===`);
  console.log(`Processed:           ${totalProcessed} file(s)`);
  console.log(`Skipped (Unchanged): ${totalSkipped} file(s)`);
  console.log(`Chunks Ingested:     ${totalChunksIngested}`);
  console.log(`Embeddings Reused:   ${totalEmbeddingsReused}`);
  console.log(`Embeddings Computed: ${totalEmbeddingsComputed}\n`);

  return {
    processed: totalProcessed,
    skipped: totalSkipped,
    chunksIngested: totalChunksIngested,
  };
}

/**
 * Named convenience export for integration tests.
 * The fixture PDF must already have XMP injected with the matching domain/topic.
 * This does NOT modify the PDF — domain and topic come from the XMP metadata embedded
 * in the PDF. PDF-source-of-truth is preserved: ingest reads and parses the PDF;
 * no code path imports documents.ts.
 */
export async function ingestDirectory(opts: {
  dir: string;
  domain?: string; // logging hint only — actual domain comes from XMP
  topic?: string; // logging hint only — actual topic comes from XMP
}): Promise<{ processed: number; skipped: number; chunksIngested: number }> {
  const resolvedDir = path.resolve(process.cwd(), opts.dir);
  if (opts.domain || opts.topic) {
    console.log(
      `[ingestDirectory] scope hint: domain=${opts.domain ?? '?'} topic=${opts.topic ?? '?'} (actual from XMP)`
    );
  }
  return ingestPdfKnowledgeBase(resolvedDir);
}

async function main() {
  try {
    const { targetDir, concurrency, dryRun, candidateFactor } = parseCliArgs();
    await ingestPdfKnowledgeBase(targetDir, concurrency, dryRun, candidateFactor);
    process.exit(0);
  } catch (err) {
    console.error('Knowledge ingestion failed:', err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('ingest.ts') || process.argv[1]?.endsWith('ingest.js')) {
  main();
}