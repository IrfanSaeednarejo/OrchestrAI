import { db } from '../db/client.js';
import { knowledgeDocuments } from '../db/schema.js';
import { InferInsertModel, InferSelectModel, cosineDistance, inArray, isNotNull, and } from 'drizzle-orm';

export type KnowledgeDocument = InferSelectModel<typeof knowledgeDocuments>;
export type NewKnowledgeDocument = InferInsertModel<typeof knowledgeDocuments>;

export type KnowledgeDomain = 'orders' | 'payments' | 'account';

export type KnowledgeSearchRow = {
  id: string;
  domain: KnowledgeDomain;
  documentType: string;
  topic: string;
  version: string;
  content: string;
  distance: number;
};

export async function createKnowledgeDocument(input: NewKnowledgeDocument): Promise<KnowledgeDocument> {
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values(input)
    .returning();
    
  if (!doc) {
    throw new Error('Failed to create knowledge document');
  }
  
  return doc;
}

export async function searchKnowledgeByEmbedding(
  embedding: number[],
  domains: KnowledgeDomain[],
  limit: number,
  topics?: string[]
): Promise<KnowledgeSearchRow[]> {
  if (domains.length === 0) {
    return [];
  }

  const dist = cosineDistance(knowledgeDocuments.embedding, embedding);

  const topicFilter = topics && topics.length > 0
    ? inArray(knowledgeDocuments.topic, topics)
    : undefined;

  const results = await db
    .select({
      id: knowledgeDocuments.id,
      domain: knowledgeDocuments.domain,
      documentType: knowledgeDocuments.documentType,
      topic: knowledgeDocuments.topic,
      version: knowledgeDocuments.version,
      content: knowledgeDocuments.content,
      distance: dist,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        inArray(knowledgeDocuments.domain, domains),
        isNotNull(knowledgeDocuments.embedding),
        topicFilter
      )
    )
    .orderBy(dist)
    .limit(limit);

  return results.map((row) => ({
    ...row,
    domain: row.domain as KnowledgeDomain,
    distance: typeof row.distance === 'string' ? parseFloat(row.distance) : Number(row.distance),
  }));
}
