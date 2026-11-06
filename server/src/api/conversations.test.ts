// src/api/conversations.test.ts
// Phase 16 Step 2: Tests for conversation lifecycle and message history endpoints.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createUser } from '../persistence/repositories/marketplace.repository.js';
import { createMessage } from '../persistence/repositories/conversation.repository.js';
import { db } from '../persistence/db/client.js';
import { users, conversations, messages } from '../persistence/db/schema.js';
import { inArray } from 'drizzle-orm';
import { DEFAULT_GUEST_USER_ID } from './middleware/auth.middleware.js';

describe('Phase 16 Step 2: Conversation Lifecycle & History Endpoints', () => {
  const app = createApp();

  let userAId: string;
  let userBId: string;
  const createdConversationIds: string[] = [];

  beforeAll(async () => {
    const userA = await createUser({
      name: 'User A',
      email: `conv-user-a-${Date.now()}@example.com`,
      defaultAddress: '100 User A Blvd',
    });
    userAId = userA.id;

    const userB = await createUser({
      name: 'User B',
      email: `conv-user-b-${Date.now()}@example.com`,
      defaultAddress: '200 User B Blvd',
    });
    userBId = userB.id;
  });

  afterAll(async () => {
    try {
      if (createdConversationIds.length > 0) {
        await db
          .delete(messages)
          .where(inArray(messages.conversationId, createdConversationIds));
        await db
          .delete(conversations)
          .where(inArray(conversations.id, createdConversationIds));
      }
      if (userAId || userBId) {
        await db.delete(users).where(inArray(users.id, [userAId, userBId]));
      }
    } catch (err) {
      console.error('Cleanup error in conversations.test.ts:', err);
    }
  });

  describe('POST /api/conversations', () => {
    it('creates a new conversation for authenticated user and returns 201', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userAId)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.conversation).toBeDefined();
      expect(res.body.conversation.id).toBeDefined();
      expect(res.body.conversation.userId).toBe(userAId);
      expect(res.body.conversation.status).toBe('active');

      createdConversationIds.push(res.body.conversation.id);
    });

    it('creates a conversation for guest user when x-user-id is omitted', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.conversation.userId).toBe(DEFAULT_GUEST_USER_ID);
      expect(res.body.conversation.status).toBe('active');

      createdConversationIds.push(res.body.conversation.id);
    });
  });

  describe('GET /api/conversations', () => {
    it('returns conversations belonging to the caller with pagination', async () => {
      const res = await request(app)
        .get('/api/conversations?limit=10&offset=0')
        .set('x-user-id', userAId);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.conversations)).toBe(true);
      expect(res.body.conversations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.offset).toBe(0);

      // Verify every returned conversation belongs to userAId
      for (const conv of res.body.conversations) {
        expect(conv.userId).toBe(userAId);
      }
    });

    it('returns empty array when user has no conversations', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('x-user-id', userBId);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toEqual([]);
      expect(res.body.pagination.count).toBe(0);
    });
  });

  describe('GET /api/conversations/:id', () => {
    let testConvId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userAId)
        .send({});
      testConvId = res.body.conversation.id;
      createdConversationIds.push(testConvId);
    });

    it('returns conversation details for conversation owner', async () => {
      const res = await request(app)
        .get(`/api/conversations/${testConvId}`)
        .set('x-user-id', userAId);

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe(testConvId);
      expect(res.body.conversation.userId).toBe(userAId);
    });

    it('returns 403 Forbidden when caller does not own the conversation', async () => {
      const res = await request(app)
        .get(`/api/conversations/${testConvId}`)
        .set('x-user-id', userBId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when guest tries to access an authenticated user conversation', async () => {
      // testConvId is owned by userAId (authenticated), not by the guest pool
      const res = await request(app)
        .get(`/api/conversations/${testConvId}`);
        // no x-user-id → guest fallback

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for non-existent conversation ID', async () => {
      const nonExistent = '00000000-0000-4000-8000-000000000099';
      const res = await request(app)
        .get(`/api/conversations/${nonExistent}`)
        .set('x-user-id', userAId);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for malformed conversation ID parameter', async () => {
      const res = await request(app)
        .get('/api/conversations/not-a-uuid')
        .set('x-user-id', userAId);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/conversations/:id/messages', () => {
    let testConvId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userAId)
        .send({});
      testConvId = res.body.conversation.id;
      createdConversationIds.push(testConvId);

      // Seed sample messages
      await createMessage({
        conversationId: testConvId,
        role: 'user',
        content: 'Hello, where is my package?',
      });

      await createMessage({
        conversationId: testConvId,
        role: 'assistant',
        content: 'Your package is on its way.',
      });
    });

    it('returns chronological messages for conversation owner', async () => {
      const res = await request(app)
        .get(`/api/conversations/${testConvId}/messages`)
        .set('x-user-id', userAId);

      expect(res.status).toBe(200);
      expect(res.body.conversationId).toBe(testConvId);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].role).toBe('user');
      expect(res.body.messages[0].content).toBe('Hello, where is my package?');
      expect(res.body.messages[1].role).toBe('assistant');
    });

    it('returns 403 Forbidden when caller does not own the conversation', async () => {
      const res = await request(app)
        .get(`/api/conversations/${testConvId}/messages`)
        .set('x-user-id', userBId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Phase 17 Step 1a: Guest ownership 403 on GET /:id/messages', () => {
    let ownedConvId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('x-user-id', userAId)
        .send({});
      ownedConvId = res.body.conversation.id;
      createdConversationIds.push(ownedConvId);
    });

    it('returns 403 Forbidden when guest tries to access an authenticated user messages', async () => {
      // ownedConvId is owned by userAId, not the guest pool
      const res = await request(app)
        .get(`/api/conversations/${ownedConvId}/messages`);
        // no x-user-id → guest fallback

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

