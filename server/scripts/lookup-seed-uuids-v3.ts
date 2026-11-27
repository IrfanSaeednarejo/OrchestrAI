/**
 * server/scripts/lookup-seed-uuids-v3.ts
 *
 * Phase 37c.2.5 — Post-Ingest Seed UUID Lookup (Gate 5)
 *
 * Reads eval/seed-labels-resolved.v3-preingest.json and queries active
 * knowledge_chunks joined with active knowledge_doc_versions by (doc_id, chunk_key)
 * to produce eval/seed-labels-resolved.v3.json with real Postgres UUIDs.
 *
 * Usage: npx tsx scripts/lookup-seed-uuids-v3.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

interface PreingestMatch {
  doc_id: string;
  chunk_key: string;
  chunk_index: number;
  section_path: string;
}

interface PreingestEntry {
  seed_id: string;
  doc_id: string;
  snippet_text: string;
  matches: PreingestMatch[];
  match_type: string;
}

interface PreingestFile {
  generatedAt: string;
  seedCount: number;
  resolved: PreingestEntry[];
}

interface ResolvedV3Entry {
  seed_id: string;
  doc: string;
  status: 'resolved';
  n_matches: number;
  chunks: string[];
  chunk_keys: string[];
  sections: string[];
  primary_chunk_id: string;
  primary_section: string;
}

async function main(): Promise<void> {
  const preingestPath = path.resolve(process.cwd(), '../eval/seed-labels-resolved.v3-preingest.json');
  const outPath = path.resolve(process.cwd(), '../eval/seed-labels-resolved.v3.json');

  const preingest = JSON.parse(fs.readFileSync(preingestPath, 'utf-8')) as PreingestFile;

  const rows = await db.execute(sql`
    SELECT kc.id, kdv.doc_id, kc.chunk_key, kc.section_path
    FROM knowledge_chunks kc
    JOIN knowledge_doc_versions kdv ON kc.version_id = kdv.id
    WHERE kc.status = 'active'
      AND kdv.status = 'active'
      AND kc.chunk_key IS NOT NULL
  `);

  const chunkMap = new Map<string, { id: string; sectionPath: string }>();
  for (const r of rows.rows) {
    const key = `${String(r.doc_id)}::${String(r.chunk_key)}`;
    chunkMap.set(key, {
      id: String(r.id),
      sectionPath: String(r.section_path),
    });
  }

  const output: ResolvedV3Entry[] = [];
  let missingCount = 0;

  for (const entry of preingest.resolved) {
    if (entry.matches.length === 0) {
      console.error(`ERROR: ${entry.seed_id} has 0 preingest matches`);
      missingCount++;
      continue;
    }

    const chunkIds: string[] = [];
    const chunkKeys: string[] = [];
    const sections: string[] = [];

    for (const m of entry.matches) {
      const key = `${m.doc_id}::${m.chunk_key}`;
      const found = chunkMap.get(key);
      if (!found) {
        console.error(`ERROR: Missing active chunk in DB for ${entry.seed_id}: ${key}`);
        missingCount++;
        continue;
      }
      chunkIds.push(found.id);
      chunkKeys.push(m.chunk_key);
      sections.push(found.sectionPath);
    }

    if (chunkIds.length === 0) continue;

    output.push({
      seed_id: entry.seed_id,
      doc: entry.doc_id,
      status: 'resolved',
      n_matches: chunkIds.length,
      chunks: chunkIds,
      chunk_keys: chunkKeys,
      sections,
      primary_chunk_id: chunkIds[0]!,
      primary_section: sections[0]!,
    });
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${output.length} resolved seeds to ${outPath}`);
  console.log(`Active chunks indexed from DB: ${chunkMap.size}`);
  console.log(`Resolved: ${output.length}/${preingest.seedCount}, Missing: ${missingCount}`);

  if (output.length !== preingest.seedCount || missingCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
