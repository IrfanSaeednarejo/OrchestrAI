/**
 * server/scripts/dry-run-corpus.ts
 *
 * Phase 37c.2-dry-run (AM4) — Pre-Flight Dry-Run Validation (ZERO DB writes, ZERO embeddings)
 *
 * Parses and chunks all 42 PDFs in docs/knowledge-base/*.pdf using the exact
 * production pipeline (parsePdfDocument + chunkDocument), then verifies:
 *  - Total chunk count within 516 +/- 20% (413..619)
 *  - Domain distribution across orders, payments, account
 *  - Every expected (domain, topic) has >= 1 chunk
 *  - Every content_hash is unique across the 42-doc corpus
 *  - Chunk content length bounds (flags any outside 400..1200 chars)
 *  - New docs have 10..20 chunks (flags any < 10 or > 20)
 *
 * Usage: npx tsx scripts/dry-run-corpus.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { parsePdfDocument } from '../src/knowledge/pdf-parser.js';
import { chunkDocument } from '../src/knowledge/chunker.js';

const FROZEN_PDFS = new Set([
  'account-security-faq.pdf',
  'cancellations.pdf',
  'data-deletion.pdf',
  'disputes.pdf',
  'exchanges.pdf',
  'methods.pdf',
  'notifications.pdf',
  'payments-faq.pdf',
  'privacy.pdf',
  'refunds-policy.pdf',
  'returns-policy.pdf',
  'shipping-faq.pdf',
]);

const EXPECTED_TOPICS: [string, string][] = [
  ['orders', 'returns'],
  ['orders', 'shipping'],
  ['orders', 'cancellations'],
  ['orders', 'exchanges'],
  ['payments', 'payments'],
  ['payments', 'refunds'],
  ['payments', 'disputes'],
  ['payments', 'methods'],
  ['account', 'account_security'],
  ['account', 'privacy'],
  ['account', 'data_deletion'],
  ['account', 'notifications'],
];

async function main(): Promise<void> {
  const pdfDir = path.resolve(process.cwd(), '../docs/knowledge-base');
  const files = fs.readdirSync(pdfDir).filter((f) => f.endsWith('.pdf')).sort();

  console.log(`Found ${files.length} PDFs in ${pdfDir}\n`);

  const domainCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  const hashToDocs = new Map<string, string[]>();

  let totalChunks = 0;
  let minLen = Infinity;
  let maxLen = 0;
  let sumLen = 0;
  const outOfBoundsChunks: { file: string; chunkKey: string; len: number; sectionPath: string }[] = [];
  const docCountAnomalies: { file: string; docId: string; chunks: number }[] = [];

  console.log('file | type | doc_id | domain/topic | chunks | min_len | max_len');
  console.log('---|---|---|---|---|---|---');

  for (const file of files) {
    const fullPath = path.join(pdfDir, file);
    const buf = fs.readFileSync(fullPath);
    const parsed = await parsePdfDocument(buf);
    const chunks = chunkDocument(parsed, {
      targetTokens: 350,
      overlapTokens: 50,
    });
    const isFrozen = FROZEN_PDFS.has(file);

    const { docId, domain, topic } = parsed.metadata;
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + chunks.length);
    const dtKey = `${domain}/${topic}`;
    topicCounts.set(dtKey, (topicCounts.get(dtKey) ?? 0) + chunks.length);

    let docMin = Infinity;
    let docMax = 0;

    for (const c of chunks) {
      const len = c.content.length;
      if (len < minLen) minLen = len;
      if (len > maxLen) maxLen = len;
      if (len < docMin) docMin = len;
      if (len > docMax) docMax = len;
      sumLen += len;

      const chunkKey = String(c.chunkIndex + 1).padStart(2, '0');
      if (len < 400 || len > 1200) {
        outOfBoundsChunks.push({ file, chunkKey, len, sectionPath: c.sectionPath });
      }

      const list = hashToDocs.get(c.contentHash) ?? [];
      list.push(`${docId}::${chunkKey}`);
      hashToDocs.set(c.contentHash, list);
    }

    if (!isFrozen && (chunks.length < 10 || chunks.length > 20)) {
      docCountAnomalies.push({ file, docId, chunks: chunks.length });
    }

    totalChunks += chunks.length;
    console.log(
      `${file} | ${isFrozen ? 'FROZEN' : 'NEW'} | ${docId} | ${dtKey} | ${chunks.length} | ${docMin} | ${docMax}`
    );
  }

  const duplicateHashes = [...hashToDocs.entries()].filter(([, list]) => list.length > 1);
  const missingTopics = EXPECTED_TOPICS.filter(([d, t]) => (topicCounts.get(`${d}/${t}`) ?? 0) === 0);

  console.log('\n=== SUMMARY ===');
  console.log(`Total PDFs:           ${files.length} (expected 42)`);
  console.log(`Total chunks:         ${totalChunks} (target 516 +/- 20% => 413..619)`);
  console.log(`Domain distribution:  ${JSON.stringify(Object.fromEntries([...domainCounts.entries()].sort()))}`);
  console.log(`Topic distribution:   ${JSON.stringify(Object.fromEntries([...topicCounts.entries()].sort()))}`);
  console.log(`Chunk length (chars): min=${minLen}, max=${maxLen}, mean=${Math.round(sumLen / totalChunks)}`);
  console.log(`Unique content_hash:  ${hashToDocs.size}/${totalChunks} (duplicates=${duplicateHashes.length})`);
  console.log(`Missing (domain,topic): ${missingTopics.length}`);
  console.log(`New doc count anomalies (<10 or >20): ${docCountAnomalies.length}`);
  console.log(`Chunks outside 400..1200 chars: ${outOfBoundsChunks.length}`);

  if (duplicateHashes.length > 0) {
    console.log('\nDuplicate hashes:');
    for (const [h, list] of duplicateHashes) {
      console.log(`  ${h}: [${list.join(', ')}]`);
    }
  }

  if (outOfBoundsChunks.length > 0) {
    console.log('\nChunks outside 400..1200 chars:');
    for (const o of outOfBoundsChunks) {
      console.log(`  ${o.file}::${o.chunkKey} len=${o.len} (${o.sectionPath})`);
    }
  }

  // Assertions
  const inRange = totalChunks >= 413 && totalChunks <= 619;
  if (
    files.length !== 42 ||
    !inRange ||
    missingTopics.length > 0 ||
    duplicateHashes.length > 0 ||
    docCountAnomalies.length > 0 ||
    outOfBoundsChunks.length > 0
  ) {
    console.error('\n❌ DRY-RUN FAILED ASSERTIONS — see details above.');
    process.exit(1);
  }

  console.log('\n✅ 37c.2 DRY-RUN PASSED — all assertions satisfied (zero DB writes).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
