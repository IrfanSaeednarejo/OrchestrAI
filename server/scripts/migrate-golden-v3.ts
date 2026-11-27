/**
 * server/scripts/migrate-golden-v3.ts
 *
 * Phase 37c.3 — Golden Dataset Migration (v2 -> v3) & Equivalence Check
 *
 * Maps all 263 queries in eval/knowledge-golden-dataset.v2.json to real
 * post-ingest v3 chunk UUIDs via eval/seed-labels-resolved.v3.json,
 * verifies v2<->v3 equivalence and DB active status for every UUID,
 * and writes eval/knowledge-golden-dataset.v3.json.
 *
 * Usage: npx tsx scripts/migrate-golden-v3.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/persistence/db/client.js';
import { sql } from 'drizzle-orm';

interface GoldenQuery {
  id: string;
  query: string;
  doc: string | null;
  answerable: boolean;
  difficulty: 'keyword' | 'paraphrase' | 'hard' | 'negative';
  variant_type: 'paraphrase' | 'messy' | 'negative';
  variant_of: string | null;
  gold_chunk_ids: string[];
  status: 'active' | 'excluded' | 'pending_pilot_scale';
}

interface GoldenDatasetFile {
  dataset_version: string;
  built_at: string;
  corpus_chunk_count: number;
  seed_count: number;
  active_with_gold: number;
  queries: GoldenQuery[];
}

interface ResolvedSeedV3 {
  seed_id: string;
  doc: string;
  status: string;
  n_matches: number;
  chunks: string[];
  chunk_keys: string[];
  sections: string[];
  primary_chunk_id: string;
  primary_section: string;
}

async function main(): Promise<void> {
  const v2Path = path.resolve(process.cwd(), '../eval/knowledge-golden-dataset.v2.json');
  const seedsPath = path.resolve(process.cwd(), '../eval/seed-labels-resolved.v3.json');
  const v3Path = path.resolve(process.cwd(), '../eval/knowledge-golden-dataset.v3.json');

  const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf-8')) as GoldenDatasetFile;
  const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf-8')) as ResolvedSeedV3[];

  const seedMap = new Map<string, ResolvedSeedV3>();
  for (const s of seeds) {
    seedMap.set(s.seed_id, s);
  }

  // Fetch all active chunk UUIDs and their doc_ids from DB for strict verification
  const dbRows = await db.execute(sql`
    SELECT kc.id, kdv.doc_id
    FROM knowledge_chunks kc
    JOIN knowledge_doc_versions kdv ON kc.version_id = kdv.id
    WHERE kc.status = 'active' AND kdv.status = 'active'
  `);
  const activeChunkDoc = new Map<string, string>();
  for (const r of dbRows.rows) {
    activeChunkDoc.set(String(r.id), String(r.doc_id));
  }

  const v3Queries: GoldenQuery[] = [];
  let activeWithGold = 0;
  let negativeNulls = 0;
  let mismatches = 0;

  for (const q of v2.queries) {
    if (q.variant_of === null) {
      if (q.answerable || q.gold_chunk_ids.length !== 0) {
        console.error(`EQUIVALENCE ERROR: negative/null query ${q.id} unexpected fields`);
        mismatches++;
      }
      negativeNulls++;
      v3Queries.push({ ...q, gold_chunk_ids: [] });
      continue;
    }

    const seed = seedMap.get(q.variant_of);
    if (!seed) {
      console.error(`MISSING SEED: query ${q.id} references unknown variant_of=${q.variant_of}`);
      mismatches++;
      continue;
    }

    if (seed.doc !== q.doc) {
      console.error(`DOC MISMATCH: query ${q.id} doc=${q.doc} vs seed.doc=${seed.doc}`);
      mismatches++;
    }

    if (seed.chunks.length === 0) {
      console.error(`EMPTY CHUNKS: seed ${seed.seed_id} has 0 chunks`);
      mismatches++;
    }

    for (const uuid of seed.chunks) {
      const dbDoc = activeChunkDoc.get(uuid);
      if (!dbDoc) {
        console.error(`INACTIVE/MISSING UUID: ${uuid} for ${q.id} (${seed.seed_id})`);
        mismatches++;
      } else if (dbDoc !== q.doc) {
        console.error(`DB DOC MISMATCH: ${uuid} is in ${dbDoc}, expected ${q.doc}`);
        mismatches++;
      }
    }

    if (q.status === 'active' && seed.chunks.length > 0) {
      activeWithGold++;
    }

    v3Queries.push({
      ...q,
      gold_chunk_ids: [...seed.chunks],
    });
  }

  if (mismatches > 0) {
    console.error(`\nFAILED with ${mismatches} equivalence/DB errors.`);
    process.exit(1);
  }

  const v3: GoldenDatasetFile = {
    dataset_version: 'v3.0.0',
    built_at: new Date().toISOString(),
    corpus_chunk_count: activeChunkDoc.size,
    seed_count: seeds.length,
    active_with_gold: activeWithGold,
    queries: v3Queries,
  };

  fs.writeFileSync(v3Path, JSON.stringify(v3, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${v3Path}`);
  console.log(`Total queries: ${v3Queries.length} (v2: ${v2.queries.length})`);
  console.log(`Active with gold UUIDs: ${activeWithGold} (expected: 249)`);
  console.log(`Negatives (null/empty gold): ${negativeNulls} (expected: 14)`);
  console.log(`Corpus active chunks in DB: ${activeChunkDoc.size}`);
  console.log(`Equivalence & DB active UUID check: PASS (0 mismatches)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
