import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/client.js';
import { users, conversations, reviewRequests, orders, payments } from '../db/schema.js';
import {
  createReviewRequest,
  getReviewRequestsByConversationId,
  getReviewRequestsByUserId,
  getReviewRequestById,
  type ReviewRequest,
} from './review-request.repository.js';
import { eq, inArray } from 'drizzle-orm';

describe('ReviewRequest Repository', () => {
  let testUserId: string;
  let testConversationId: string;
  let testOrderId: string;
  let testPaymentId: string;
  const createdReviewIds: string[] = [];

  beforeAll(async () => {
    const userRes = await db
      .insert(users)
      .values({
        name: 'Review Req Test User',
        email: `review-test-${Date.now()}@example.com`,
        defaultAddress: '100 Review Blvd',
      })
      .returning();
    const createdUser = userRes[0];
    if (!createdUser) throw new Error('Failed to create test user');
    testUserId = createdUser.id;

    const convRes = await db
      .insert(conversations)
      .values({
        userId: testUserId,
        status: 'active',
      })
      .returning();
    const createdConv = convRes[0];
    if (!createdConv) throw new Error('Failed to create test conversation');
    testConversationId = createdConv.id;

    const orderRes = await db
      .insert(orders)
      .values({
        userId: testUserId,
        status: 'paid',
        shippingAddressSnapshot: '100 Review Blvd',
        totalAmount: '99.99',
      })
      .returning();
    const createdOrder = orderRes[0];
    if (!createdOrder) throw new Error('Failed to create test order');
    testOrderId = createdOrder.id;

    const paymentRes = await db
      .insert(payments)
      .values({
        orderId: testOrderId,
        amount: '99.99',
        status: 'captured',
        method: 'credit_card',
      })
      .returning();
    const createdPayment = paymentRes[0];
    if (!createdPayment) throw new Error('Failed to create test payment');
    testPaymentId = createdPayment.id;
  });

  afterAll(async () => {
    if (createdReviewIds.length > 0) {
      await db.delete(reviewRequests).where(inArray(reviewRequests.id, createdReviewIds));
    }
    if (testPaymentId) {
      await db.delete(payments).where(eq(payments.id, testPaymentId));
    }
    if (testOrderId) {
      await db.delete(orders).where(eq(orders.id, testOrderId));
    }
    if (testConversationId) {
      await db.delete(conversations).where(eq(conversations.id, testConversationId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('creates and fetches review request by id, conversationId, and userId', async () => {
    const created: ReviewRequest = await createReviewRequest({
      conversationId: testConversationId,
      userId: testUserId,
      orderId: testOrderId,
      paymentId: testPaymentId,
      duplicatePaymentId: null,
      amount: '99.99',
      status: 'pending',
      reason: 'Duplicate charge reported by user',
    });

    createdReviewIds.push(created.id);

    expect(created.id).toBeDefined();
    expect(created.conversationId).toBe(testConversationId);
    expect(created.userId).toBe(testUserId);
    expect(created.orderId).toBe(testOrderId);
    expect(created.status).toBe('pending');
    expect(created.amount).toBe('99.99');
    expect(created.reason).toBe('Duplicate charge reported by user');

    const byId = await getReviewRequestById(created.id);
    expect(byId).not.toBeNull();
    expect(byId?.id).toBe(created.id);
    expect(byId?.amount).toBe('99.99');

    const byConv = await getReviewRequestsByConversationId(testConversationId);
    expect(byConv.some((r) => r.id === created.id)).toBe(true);

    const byUser = await getReviewRequestsByUserId(testUserId);
    expect(byUser.some((r) => r.id === created.id)).toBe(true);
  });
});
