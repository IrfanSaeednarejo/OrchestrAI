import { db } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { reviewRequests } from '../db/schema.js';

export type ReviewRequest = InferSelectModel<typeof reviewRequests>;
export type NewReviewRequest = InferInsertModel<typeof reviewRequests>;

export async function createReviewRequest(
  input: NewReviewRequest
): Promise<ReviewRequest> {
  const result = await db.insert(reviewRequests).values(input).returning();
  if (!result[0]) throw new Error('Failed to create review request record');
  return result[0];
}

export async function getReviewRequestsByConversationId(
  conversationId: string
): Promise<ReviewRequest[]> {
  return db
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.conversationId, conversationId))
    .orderBy(desc(reviewRequests.createdAt));
}

export async function getReviewRequestsByUserId(
  userId: string
): Promise<ReviewRequest[]> {
  return db
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.userId, userId))
    .orderBy(desc(reviewRequests.createdAt));
}

export async function getReviewRequestById(
  id: string
): Promise<ReviewRequest | null> {
  const result = await db
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.id, id));
  return result[0] ?? null;
}
