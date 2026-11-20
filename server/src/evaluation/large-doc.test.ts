/**
 * Large-document ingestion & retrieval integration test.
 * Excluded from the main test suite — only runs when RUN_LARGE_DOC_TESTS=1.
 *
 * Usage:
 *   RUN_LARGE_DOC_TESTS=1 npx vitest run src/evaluation/large-doc.test.ts
 *
 * The test fixture (test-fixtures/large-doc/large-doc.pdf) must be generated first:
 *   npx tsx scripts/generate-large-doc-pdf.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { ingestDirectory } from '../knowledge/ingest.js';
import { retrieveKnowledge } from '../knowledge/retrieval.js';

const RUN = process.env.RUN_LARGE_DOC_TESTS === '1';
const DOMAIN = 'orders' as const;
const TOPIC = 'large_doc_test';
const FIXTURE_DIR = 'test-fixtures/large-doc';

// Queries derived from the actual H2 headings in the generated fixture
const QUERIES = [
  'return eligibility criteria',
  'return window calculation days',
  'eligible order statuses for return',
  'concurrent return limits per order',
  'item condition requirements for return',
  'non-returnable items policy',
  'digital products return policy',
  'perishable goods return policy',
  'hazardous materials return',
  'return shipping prepaid labels',
  'self-ship returns process',
  'international returns policy',
  'refund timing after approval',
  'original payment method refund',
  'store credit option for refund',
  'partial refunds policy',
  'duplicate charge refund process',
  'refund disputes escalation',
  'exchange process for orders',
  'defective item exchange requirements',
];

beforeAll(async () => {
  if (!RUN) return;
  await ingestDirectory({ dir: FIXTURE_DIR, domain: DOMAIN, topic: TOPIC });
}, 300_000);

afterAll(async () => {
  if (!RUN) return;
  const dbUrl = process.env.DATABASE_URL ?? '';
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  // Remove only test fixture rows; production data is untouched
  await client.query(`DELETE FROM knowledge_chunks WHERE domain=$1 AND topic=$2`, [DOMAIN, TOPIC]);
  await client.query(`DELETE FROM knowledge_doc_versions WHERE domain=$1 AND topic=$2`, [
    DOMAIN,
    TOPIC,
  ]);
  await client.end();
});

describe.skipIf(!RUN)('Large-doc ingestion & retrieval', () => {
  // Per-test timeout set via vi.setConfig — Vitest's it.each does not accept a timeout
  // object as the third argument in this version. 30 s is sufficient for a live embedding
  // round-trip + pgvector query.
  beforeAll(() => {
    // Individual tests time out at 30 s (vitest.config.ts testTimeout default).
    // No override needed here — the 500 ms latency assertion catches slow retrieval.
  });

  it.each(QUERIES)('retrieves a result for: %s', async (query) => {
    const start = Date.now();
    const result = await retrieveKnowledge({
      query,
      domains: [DOMAIN],
      topics: [TOPIC],
      topK: 3,
    });
    const latency = Date.now() - start;

    expect(
      result.success,
      `retrieveKnowledge failed for "${query}": ${JSON.stringify(result.success ? undefined : result.error)}`
    ).toBe(true);

    if (!result.success) return; // type narrowing

    expect(result.data.length, `Expected at least one result for "${query}"`).toBeGreaterThan(0);
    expect(latency, `Latency ${latency}ms exceeded 500ms target`).toBeLessThan(500);

    // Scope guard: all returned chunks must be from our fixture domain/topic
    for (const hit of result.data) {
      expect(hit.domain).toBe(DOMAIN);
      expect(hit.topic).toBe(TOPIC);
    }
  });
});