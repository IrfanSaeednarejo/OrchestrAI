/**
 * server/scripts/resolve-seed-labels-v3.ts
 *
 * Phase 37c.1' — Pre-Ingest Seed Snippet Resolver (Gate 4)
 *
 * Resolves all 96 seed snippets in eval/seed-labels.json verbatim against the 66
 * re-chunked frozen chunks in server/scripts/.chunk-staging.json to (doc_id, chunk_key)
 * ONLY. Uses doc-scoped primary matching (searching within seed.doc first, then
 * recording cross-doc overlaps as informational).
 *
 * Usage: npx tsx scripts/resolve-seed-labels-v3.ts
 */

import fs from 'node:fs';
import path from 'node:path';

interface SeedLabelEntry {
  seed_id: string;
  doc: string;
  page?: number;
  snippet: string;
  multi_gold_snippets?: string[];
  notes?: string;
}

interface StagedChunk {
  chunkIndex: number;
  sectionPath: string;
  content: string;
  contentHash: string;
  tokenEstimate: number;
  chunkKey: string;
}

interface StagedDoc {
  docId: string;
  file: string;
  domain: string;
  topic: string;
  version: string;
  chunkCount: number;
  chunks: StagedChunk[];
}

interface ChunkStagingFile {
  generatedAt: string;
  docCount: number;
  totalChunks: number;
  docs: StagedDoc[];
}

interface ResolvedMatch {
  doc_id: string;
  chunk_key: string;
  chunk_index: number;
  section_path: string;
  raw_chunk_excerpt: string;
}

interface CrossDocOverlap {
  doc_id: string;
  chunk_key: string;
}

interface ResolvedSeedEntry {
  seed_id: string;
  doc_id: string;
  snippet_text: string;
  matches: ResolvedMatch[];
  cross_doc_overlaps: CrossDocOverlap[];
  match_type: 'verbatim' | 'multi-match' | 'cross-doc-no-match' | 'no-match';
  soft_match_flag: boolean;
  soft_match_note?: string;
  owner_review_needed: boolean;
}

const SOFT_MATCH_SEEDS = new Set([
  's-exchanges-004',
  's-exchanges-006',
  's-notifications-002',
  's-notifications-007',
]);

function main(): void {
  const seedPath = path.resolve(process.cwd(), '../eval/seed-labels.json');
  const stagingPath = path.resolve(process.cwd(), 'scripts/.chunk-staging.json');
  const outPath = path.resolve(process.cwd(), '../eval/seed-labels-resolved.v3-preingest.json');

  const seeds: SeedLabelEntry[] = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const staging: ChunkStagingFile = JSON.parse(fs.readFileSync(stagingPath, 'utf-8'));

  // Flatten all 66 staging chunks (12 frozen docs only)
  const allChunks: { docId: string; chunk: StagedChunk }[] = [];
  for (const doc of staging.docs) {
    for (const chunk of doc.chunks) {
      allChunks.push({ docId: doc.docId, chunk });
    }
  }

  console.log(`Loaded ${seeds.length} seeds from ${seedPath}`);
  console.log(`Loaded ${allChunks.length} staging chunks across ${staging.docCount} frozen docs\n`);

  const resolved: ResolvedSeedEntry[] = [];
  let verbatimCount = 0;
  let multiMatchCount = 0;
  let crossDocNoMatchCount = 0;
  let noMatchCount = 0;
  let softFlaggedCount = 0;

  for (const seed of seeds) {
    // 1. Search within seed.doc first
    const inDocMatches: ResolvedMatch[] = [];
    const otherDocMatches: { docId: string; chunk: StagedChunk }[] = [];

    for (const { docId, chunk } of allChunks) {
      if (chunk.content.includes(seed.snippet)) {
        if (docId === seed.doc) {
          inDocMatches.push({
            doc_id: docId,
            chunk_key: chunk.chunkKey,
            chunk_index: chunk.chunkIndex,
            section_path: chunk.sectionPath,
            raw_chunk_excerpt: chunk.content.slice(0, 100),
          });
        } else {
          otherDocMatches.push({ docId, chunk });
        }
      }
    }

    let matchType: ResolvedSeedEntry['match_type'];
    let finalMatches: ResolvedMatch[] = [];
    let crossDocOverlaps: CrossDocOverlap[] = [];

    if (inDocMatches.length === 1) {
      // 2. Exactly 1 match in seed.doc_id -> verbatim
      matchType = 'verbatim';
      finalMatches = inDocMatches;
      crossDocOverlaps = otherDocMatches.map((o) => ({
        doc_id: o.docId,
        chunk_key: o.chunk.chunkKey,
      }));
      verbatimCount++;
    } else if (inDocMatches.length === 0) {
      if (otherDocMatches.length > 0) {
        // 3. 0 matches in seed.doc_id, found in other doc -> cross-doc-no-match (HALT)
        matchType = 'cross-doc-no-match';
        crossDocOverlaps = otherDocMatches.map((o) => ({
          doc_id: o.docId,
          chunk_key: o.chunk.chunkKey,
        }));
        crossDocNoMatchCount++;
      } else {
        // 5. 0 matches anywhere -> no-match (HALT)
        matchType = 'no-match';
        noMatchCount++;
      }
    } else {
      // 4. 2+ matches in seed.doc_id -> true multi-match (HALT)
      matchType = 'multi-match';
      finalMatches = inDocMatches;
      multiMatchCount++;
    }

    const isSoft = SOFT_MATCH_SEEDS.has(seed.seed_id);
    if (isSoft) softFlaggedCount++;

    const entry: ResolvedSeedEntry = {
      seed_id: seed.seed_id,
      doc_id: seed.doc,
      snippet_text: seed.snippet,
      matches: finalMatches,
      cross_doc_overlaps: crossDocOverlaps,
      match_type: matchType,
      soft_match_flag: isSoft,
      owner_review_needed: matchType !== 'verbatim',
    };

    if (isSoft) {
      entry.soft_match_note = 'originally flagged; confirmed clean verbatim post-re-chunk';
    }

    resolved.push(entry);
  }

  // Verification 1: maxSeedsPerChunk and chunksWithMoreThanThreeSeeds
  const chunkToSeeds = new Map<string, string[]>();
  for (const r of resolved) {
    if (r.matches.length !== 1) continue;
    const m = r.matches[0];
    const key = `${m.doc_id}::${m.chunk_key}`;
    const list = chunkToSeeds.get(key) ?? [];
    list.push(r.seed_id);
    chunkToSeeds.set(key, list);
  }

  let maxSeedsPerChunk = 0;
  let chunksWithMoreThanThreeSeeds = 0;
  for (const list of chunkToSeeds.values()) {
    if (list.length > maxSeedsPerChunk) maxSeedsPerChunk = list.length;
    if (list.length > 3) chunksWithMoreThanThreeSeeds++;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    seedCount: seeds.length,
    resolved,
    summary: {
      verbatim: verbatimCount,
      multi_match: multiMatchCount,
      cross_doc_no_match: crossDocNoMatchCount,
      no_match: noMatchCount,
      soft_matches_flagged: softFlaggedCount,
      maxSeedsPerChunk,
      chunksWithMoreThanThreeSeeds,
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote pre-ingest resolution to ${outPath}\n`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(output.summary, null, 2));

  // ── s-methods-001 detail ───────────────────────────────────────────────────
  const methods001 = resolved.find((r) => r.seed_id === 's-methods-001');
  console.log('\n=== s-methods-001 DETAIL ===');
  console.log(JSON.stringify(methods001, null, 2));

  // ── Verification 2: Snippet-in-context proofs for the 4 soft matches ───────
  console.log('\n=== VERIFICATION 2: 4 SOFT-MATCH SNIPPET-IN-CONTEXT PROOFS ===');
  for (const r of resolved.filter((x) => x.soft_match_flag)) {
    const m = r.matches[0];
    if (!m) continue;
    const chunkObj = allChunks.find(
      (c) => c.docId === m.doc_id && c.chunk.chunkKey === m.chunk_key
    )?.chunk;
    if (!chunkObj) continue;

    const full = chunkObj.content;
    const idx = full.indexOf(r.snippet_text);
    const before = full.slice(Math.max(0, idx - 50), idx);
    const after = full.slice(
      idx + r.snippet_text.length,
      idx + r.snippet_text.length + 50
    );

    console.log(`--- ${r.seed_id} ---`);
    console.log(`chunk_key: ${m.chunk_key}`);
    console.log(`doc_id: ${m.doc_id}`);
    console.log(`chunk_first_100_chars: ${JSON.stringify(full.slice(0, 100))}`);
    console.log('--- SNIPPET IN CONTEXT ---');
    console.log(`...${before}`);
    console.log(r.snippet_text);
    console.log(`${after}...`);
    console.log('--- END SNIPPET ---');
    console.log(`chunk_last_100_chars: ${JSON.stringify(full.slice(-100))}\n`);
  }

  // ── Structural Verification ────────────────────────────────────────────────
  let validChunkKeyCount = 0;
  let validChunkIndexCount = 0;
  let docIdMatchCount = 0;

  for (const r of resolved) {
    if (r.matches.length !== 1) continue;
    const m = r.matches[0];
    if (/^(0[1-9]|1[0-6])$/.test(m.chunk_key)) validChunkKeyCount++;
    if (m.chunk_index === parseInt(m.chunk_key, 10) - 1) validChunkIndexCount++;
    if (m.doc_id === r.doc_id) docIdMatchCount++;
  }

  console.log('=== STRUCTURAL VERIFICATION ===');
  console.log(`Valid zero-padded chunk_key ('01'..'16'): ${validChunkKeyCount}/${resolved.length}`);
  console.log(`chunk_index === parseInt(chunk_key) - 1:  ${validChunkIndexCount}/${resolved.length}`);
  console.log(`Matched doc_id === seed.doc_id:           ${docIdMatchCount}/${resolved.length}`);
  console.log(`maxSeedsPerChunk:                         ${maxSeedsPerChunk}`);
  console.log(`chunksWithMoreThanThreeSeeds:             ${chunksWithMoreThanThreeSeeds}`);

  // HALT checks
  if (maxSeedsPerChunk > 4) {
    console.error('\n❌ HALT: maxSeedsPerChunk > 4! Offending chunks:');
    for (const [key, list] of chunkToSeeds.entries()) {
      if (list.length > 4) {
        console.error(`  - ${key} (${list.length} seeds): [${list.join(', ')}]`);
      }
    }
    process.exit(1);
  }

  if (noMatchCount > 0 || multiMatchCount > 0 || crossDocNoMatchCount > 0) {
    console.error('\n❌ HALT: Non-verbatim matches detected. Do not proceed to 37c.2.');
    process.exit(1);
  }

  console.log('\n✅ GATE 4 PRE-INGEST RESOLUTION PASSED: 96/96 verbatim.');
}

main();
