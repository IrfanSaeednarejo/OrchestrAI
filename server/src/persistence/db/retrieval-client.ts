/**
 * server/src/persistence/db/retrieval-client.ts
 *
 * Phase 36 Step 2b-β: Dedicated retrieval pool using the unpooled (direct)
 * Neon endpoint. Direct connections accept custom GUC startup parameters via
 * the `options` query string, unlike PgBouncer in transaction mode which
 * rejects them (error 08P01).
 *
 * Sets at connection level:
 *   hnsw.ef_search        = 100   (match current SET LOCAL in searchDenseScoped)
 *   hnsw.iterative_scan   = relaxed_order
 *   hnsw.max_scan_tuples  = 40000
 *
 * This allows the BEGIN/COMMIT transaction and 3× SET LOCAL statements to be
 * removed from searchDenseScoped (Phase 36 Step 3), saving 4 round-trips (~900ms WAN).
 *
 * Pool size: max 3 (retrieval is read-only; concurrency needs are low).
 * Falls back gracefully in test environments: test-global-setup.ts already
 * overwrites DATABASE_URL_UNPOOLED → TEST_DATABASE_URL_UNPOOLED.
 *
 * NEVER import this in client.ts or any protected file.
 * ONLY used by knowledge.repository.ts for dense/sparse retrieval queries.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../../shared/config.js';
import * as schema from './schema.js';

/** Append HNSW GUC options to a Postgres connection string. */
function buildRetrievalConnectionString(base: string): string {
  // The options parameter uses libpq syntax: "-c param=value -c param=value"
  // Values are percent-encoded when placed in a URL query string.
  const gucs = [
    'hnsw.ef_search=100',
    'hnsw.iterative_scan=relaxed_order',
    'hnsw.max_scan_tuples=40000',
  ]
    .map((g) => `-c ${g}`)
    .join(' ');

  const encoded = encodeURIComponent(gucs);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}options=${encoded}`;
}

const connectionString = buildRetrievalConnectionString(
  config.postgres.unpooledConnectionString,
);

export const retrievalPool = new Pool({
  connectionString,
  max: 3,
});

export const retrievalDb = drizzle(retrievalPool, { schema });
