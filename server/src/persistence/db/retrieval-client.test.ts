/**
 * server/src/persistence/db/retrieval-client.test.ts
 *
 * Task C — Deployment Verification:
 * Asserts that getRetrievalConnectionString() throws a clear, actionable error
 * when DATABASE_URL_RETRIEVAL is missing/empty, and strictly prevents silent fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRetrievalConnectionString } from './retrieval-client.js';
import { config } from '../../shared/config.js';

describe('Task C — retrieval-client.ts Deployment Verification', () => {
  const originalEnv = process.env.DATABASE_URL_RETRIEVAL;
  const originalConfig = config.postgres.retrievalConnectionString;

  beforeEach(() => {
    delete process.env.DATABASE_URL_RETRIEVAL;
    (config.postgres as { retrievalConnectionString?: string }).retrievalConnectionString = undefined;
  });

  afterEach(() => {
    process.env.DATABASE_URL_RETRIEVAL = originalEnv;
    (config.postgres as { retrievalConnectionString?: string }).retrievalConnectionString = originalConfig;
  });

  it('throws clear, actionable error when DATABASE_URL_RETRIEVAL is missing or empty', () => {
    expect(() => getRetrievalConnectionString()).toThrowError(
      /DATABASE_URL_RETRIEVAL environment variable is required but missing or empty/
    );
  });

  it('does NOT fall back to DATABASE_URL or run silently with default GUCs', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/fake_db';
    expect(() => getRetrievalConnectionString()).toThrowError(
      /Silent fallback to DATABASE_URL is disallowed/
    );
  });

  it('returns connection string when DATABASE_URL_RETRIEVAL is validly populated', () => {
    process.env.DATABASE_URL_RETRIEVAL = 'postgresql://localhost:5432/retrieval_db?options=-c%20hnsw.ef_search%3D100';
    const conn = getRetrievalConnectionString();
    expect(conn).toBe('postgresql://localhost:5432/retrieval_db?options=-c%20hnsw.ef_search%3D100');
  });
});
