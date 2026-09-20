import { db } from '../db/db.js';
import { knowledgeDocuments } from '../db/schema.js';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type KnowledgeDocument = InferSelectModel<typeof knowledgeDocuments>;
export type NewKnowledgeDocument = InferInsertModel<typeof knowledgeDocuments>;

export async function createKnowledgeDocument(input: NewKnowledgeDocument): Promise<KnowledgeDocument> {
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values(input)
    .returning();
  return doc;
}
