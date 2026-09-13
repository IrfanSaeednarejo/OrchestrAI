// This test requires Docker Postgres to be running locally,
// and will fail with a connection error if it's not.

import { describe, it, expect, afterAll } from 'vitest';
import { db, pgPool } from './client.js';
import { healthCheck } from './schema.js';
import { eq, desc } from 'drizzle-orm';

describe('Health Check Integration', () => {
  let insertedId: number | undefined;

  it('should insert a row and query it back', async () => {
    const testNote = 'test-insert';

    // Insert a row
    const rows = await db
      .insert(healthCheck)
      .values({ note: testNote })
      .returning({ id: healthCheck.id });

    const inserted = rows[0];
    expect(inserted).toBeDefined();
    if (!inserted) throw new Error('Insert returned no rows');
    insertedId = inserted.id;

    // Query it back by selecting the most recent row
    const results = await db
      .select()
      .from(healthCheck)
      .orderBy(desc(healthCheck.id))
      .limit(1);

    const row = results[0];
    expect(row).toBeDefined();
    if (!row) throw new Error('Select returned no rows');
    expect(row.note).toBe(testNote);
  });

  afterAll(async () => {
    if (insertedId !== undefined) {
      await db.delete(healthCheck).where(eq(healthCheck.id, insertedId));
    }
    await pgPool.end();
  });
});
