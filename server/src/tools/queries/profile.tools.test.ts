import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getProfile } from './profile.tools.js';
import { db } from '../../persistence/db/client.js';
import { users } from '../../persistence/db/schema.js';
import { createUser } from '../../persistence/repositories/marketplace.repository.js';
import { eq } from 'drizzle-orm';

describe('get_profile', () => {
  let userId: string;

  beforeAll(async () => {
    const email = `profile-tools-query-${Date.now()}@example.com`;
    const user = await createUser({
      email,
      name: 'Query Test User',
      defaultAddress: '123 Query St',
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it('returns the correct row for a valid userId', async () => {
    const result = await getProfile({ userId });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(userId);
      expect(result.data.name).toBe('Query Test User');
      expect(result.data.email).toMatch(/^profile-tools-query-/);
      expect(result.data.defaultAddress).toBe('123 Query St');
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });

  it('NOT_FOUND for a nonexistent userId', async () => {
    const result = await getProfile({ userId: '00000000-0000-0000-0000-000000000000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('INVALID_INPUT for a malformed userId', async () => {
    const result = await getProfile({ userId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });
});
