import { describe, it, expect, afterAll } from 'vitest';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { createUser, getUserById, User } from './marketplace.repository.js';
import { eq } from 'drizzle-orm';

describe('Marketplace Repository', () => {
  let testUser: User;

  afterAll(async () => {
    if (testUser) {
      await db.delete(users).where(eq(users.id, testUser.id));
    }
  });

  it('should create and fetch a user', async () => {
    const email = `test-${Date.now()}@example.com`;
    const created = await createUser({
      name: 'Test User',
      email,
      defaultAddress: '123 Test St',
    });

    expect(created.id).toBeDefined();
    expect(created.email).toBe(email);

    testUser = created;

    const fetched = await getUserById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.email).toBe(email);
  });
});
