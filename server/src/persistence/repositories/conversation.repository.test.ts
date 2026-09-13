import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/client.js';
import { users, conversations } from '../db/schema.js';
import { createConversation, getConversationById, Conversation } from './conversation.repository.js';
import { eq } from 'drizzle-orm';

describe('Conversation Repository', () => {
  let testUserId: string;
  let testConversation: Conversation;

  beforeAll(async () => {
    const result = await db.insert(users).values({
      name: 'Conv Test User',
      email: `conv-test-${Date.now()}@example.com`,
      defaultAddress: 'Conv St',
    }).returning();
    testUserId = result[0]!.id;
  });

  afterAll(async () => {
    if (testConversation) {
      await db.delete(conversations).where(eq(conversations.id, testConversation.id));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should create and fetch a conversation', async () => {
    const created = await createConversation({
      userId: testUserId,
      status: 'active',
    });

    expect(created.id).toBeDefined();
    expect(created.userId).toBe(testUserId);
    expect(created.status).toBe('active');

    testConversation = created;

    const fetched = await getConversationById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.id);
  });
});
