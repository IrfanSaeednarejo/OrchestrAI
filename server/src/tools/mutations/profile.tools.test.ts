import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { updateProfile } from './profile.tools.js';
import { db } from '../../persistence/db/client.js';
import { users } from '../../persistence/db/schema.js';
import { createUser, getUserById } from '../../persistence/repositories/marketplace.repository.js';
import { eq } from 'drizzle-orm';

describe('update_profile', () => {
  let userId: string;

  beforeAll(async () => {
    const email = `profile-tools-mut-${Date.now()}@example.com`;
    const user = await createUser({
      email,
      name: 'Mutation Test User',
      defaultAddress: '123 Mutation St',
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it('happy path updating name only', async () => {
    const result = await updateProfile({ userId, name: 'New Name' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('New Name');
      expect(result.data.defaultAddress).toBe('123 Mutation St'); // unchanged
    }
  });

  it('happy path updating defaultAddress only', async () => {
    const result = await updateProfile({ userId, defaultAddress: '456 New Address' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('New Name'); // from previous test
      expect(result.data.defaultAddress).toBe('456 New Address');
    }
  });

  it('happy path updating both at once', async () => {
    const result = await updateProfile({ userId, name: 'Both Name', defaultAddress: 'Both Address' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Both Name');
      expect(result.data.defaultAddress).toBe('Both Address');
    }
  });

  it('INVALID_INPUT when neither name nor defaultAddress is provided', async () => {
    const result = await updateProfile({ userId });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('INVALID_INPUT for a malformed userId', async () => {
    const result = await updateProfile({ userId: 'not-a-uuid', name: 'Valid Name' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('NOT_FOUND for a nonexistent userId', async () => {
    const result = await updateProfile({ userId: '00000000-0000-0000-0000-000000000000', name: 'Some Name' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('confirms email is unchanged after an update', async () => {
    // 1. Fetch current email
    const beforeUpdate = await getUserById(userId);
    expect(beforeUpdate).toBeDefined();
    const originalEmail = beforeUpdate?.email;

    // 2. Perform an update
    const updateResult = await updateProfile({ userId, name: 'Email Test Name' });
    expect(updateResult.success).toBe(true);

    // 3. Fetch row after update and assert email equals original value
    const afterUpdate = await getUserById(userId);
    expect(afterUpdate).toBeDefined();
    expect(afterUpdate?.email).toBe(originalEmail);
    // Also assert it from the tool's returned data
    if (updateResult.success) {
      expect(updateResult.data.email).toBe(originalEmail);
    }
  });
});
