import { db } from '../db/client.js';
import { eq, asc } from 'drizzle-orm';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { conversations, messages } from '../db/schema.js';

export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;
export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

export async function getConversationById(id: string): Promise<Conversation | undefined> {
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  return result[0];
}

export async function createConversation(input: NewConversation): Promise<Conversation> {
  const result = await db.insert(conversations).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function updateConversationStatus(
  id: string,
  status: Conversation['status']
): Promise<Conversation | undefined> {
  const result = await db
    .update(conversations)
    .set({ status, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();
  return result[0];
}

export async function getMessagesByConversationId(conversationId: string): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.timestamp));
}

export async function createMessage(input: NewMessage): Promise<Message> {
  const result = await db.insert(messages).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}
