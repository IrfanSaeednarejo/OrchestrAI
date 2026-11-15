import fs from 'node:fs';
import path from 'node:path';

function getWord5Grams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const ngrams = new Set<string>();
  if (words.length < 5) {
    return ngrams;
  }
  for (let i = 0; i <= words.length - 5; i++) {
    ngrams.add(words.slice(i, i + 5).join(' '));
  }
  return ngrams;
}

function computeOverlap(queryText: string, chunkText: string): {
  queryNgramsCount: number;
  sharedCount: number;
  overlapPct: number;
} {
  const queryNgrams = getWord5Grams(queryText);
  const chunkNgrams = getWord5Grams(chunkText);
  if (queryNgrams.size === 0) {
    return { queryNgramsCount: 0, sharedCount: 0, overlapPct: 0 };
  }
  let shared = 0;
  for (const ng of queryNgrams) {
    if (chunkNgrams.has(ng)) {
      shared++;
    }
  }
  const pct = (shared / queryNgrams.size) * 100;
  return { queryNgramsCount: queryNgrams.size, sharedCount: shared, overlapPct: pct };
}

async function main() {
  const rootDir = path.resolve(process.cwd(), '..');
  const queriesPath = path.resolve(rootDir, 'eval/retrieval-queries.json');
  const chunksPath = path.resolve(rootDir, 'seed/knowledge-expanded.json');

  const queries = JSON.parse(fs.readFileSync(queriesPath, 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));

  const chunkMap = new Map<string, string>();
  for (const c of chunks) {
    chunkMap.set(c.id, c.content);
  }

  console.log(`Analyzing ${queries.length} retrieval queries against ${chunks.length} chunks...`);
  console.log('='.repeat(70));

  let flaggedCount = 0;
  const results = [];

  for (const q of queries) {
    const chunkText = chunkMap.get(q.expectedChunkId);
    if (!chunkText) {
      console.warn(`Missing chunk for query ${q.id}: ${q.expectedChunkId}`);
      continue;
    }
    const { queryNgramsCount, sharedCount, overlapPct } = computeOverlap(q.query, chunkText);
    const flagged = overlapPct > 30;
    if (flagged) flaggedCount++;

    results.push({
      id: q.id,
      domain: q.expectedDomain ?? q.domain,
      topic: q.topic,
      expectedChunkId: q.expectedChunkId,
      queryNgramsCount,
      sharedCount,
      overlapPct: Number(overlapPct.toFixed(2)),
      flagged,
      query: q.query,
    });
  }

  console.table(
    results.map((r) => ({
      id: r.id,
      domain: r.domain,
      expectedChunkId: r.expectedChunkId,
      '5-grams': r.queryNgramsCount,
      shared: r.sharedCount,
      'overlap%': `${r.overlapPct}%`,
      flagged: r.flagged ? '⚠️ >30%' : '✅',
    }))
  );

  console.log('='.repeat(70));
  console.log(`Total queries: ${queries.length}`);
  console.log(`Queries flagged (> 30% 5-gram overlap): ${flaggedCount}`);

  const outPath = path.resolve(rootDir, 'benchmarks/results/retrieval-lexical-overlap.json');
  fs.writeFileSync(outPath, JSON.stringify({ summary: { total: queries.length, flagged: flaggedCount }, results }, null, 2));
  console.log(`Saved analysis to: ${outPath}`);
}

main().catch(console.error);
