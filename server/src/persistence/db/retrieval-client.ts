/**
 * server/src/persistence/db/retrieval-client.ts
 *
 * Phase 36 Step 2b-β & Task C: Dedicated retrieval pool using the unpooled direct
 * endpoint with HNSW GUC options specified via DATABASE_URL_RETRIEVAL.
 *
 * Task C Invariant:
 * Throws a clear, actionable error if DATABASE_URL_RETRIEVAL is missing.
 * Strictly does NOT fall back silently to DATABASE_URL or unpooled without GUCs,
 * because silent fallback would execute with default GUCs (ef_search=40) and produce
 * degraded recall without any operational signal.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../../shared/config.js';
import * as schema from './schema.js';

export function getRetrievalConnectionString(): string {
  const url = config.postgres.retrievalConnectionString || process.env.DATABASE_URL_RETRIEVAL;
  if (!url || url.trim() === '') {
    throw new Error(
      'DATABASE_URL_RETRIEVAL environment variable is required but missing or empty. ' +
        'Set DATABASE_URL_RETRIEVAL to Neon unpooled endpoint with HNSW GUC options ' +
        '(&options=-c%20hnsw.ef_search%3D100%20-c%20hnsw.iterative_scan%3Drelaxed_order%20-c%20hnsw.max_scan_tuples%3D40000). ' +
        'Silent fallback to DATABASE_URL is disallowed to prevent silent recall regressions.'
    );
  }
  return url;
}

export const retrievalPool = new Pool({
  connectionString: getRetrievalConnectionString(),
  max: 3,
});

export const retrievalDb = drizzle(retrievalPool, { schema });
