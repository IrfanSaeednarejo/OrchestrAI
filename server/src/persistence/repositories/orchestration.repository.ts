import { db } from '../db/client.js';
import { eq, asc, and } from 'drizzle-orm';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../db/schema.js';

export type RoutingHistory = InferSelectModel<typeof routingHistory>;
export type NewRoutingHistory = InferInsertModel<typeof routingHistory>;
export type AgentExecution = InferSelectModel<typeof agentExecutions>;
export type NewAgentExecution = InferInsertModel<typeof agentExecutions>;
export type ToolExecution = InferSelectModel<typeof toolExecutions>;
export type NewToolExecution = InferInsertModel<typeof toolExecutions>;

export async function createRoutingHistoryEntry(
  input: NewRoutingHistory
): Promise<RoutingHistory> {
  const result = await db.insert(routingHistory).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function getRoutingHistoryByConversationId(
  conversationId: string
): Promise<RoutingHistory[]> {
  return db
    .select()
    .from(routingHistory)
    .where(eq(routingHistory.conversationId, conversationId))
    .orderBy(asc(routingHistory.timestamp));
}

export async function createAgentExecution(
  input: NewAgentExecution
): Promise<AgentExecution> {
  const result = await db.insert(agentExecutions).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function getAgentExecutionsByConversationId(
  conversationId: string
): Promise<AgentExecution[]> {
  return db
    .select()
    .from(agentExecutions)
    .where(eq(agentExecutions.conversationId, conversationId))
    .orderBy(asc(agentExecutions.createdAt));
}

export async function getFailedAgentExecutions(
  conversationId?: string
): Promise<AgentExecution[]> {
  let query = db.select().from(agentExecutions).$dynamic();
  
  if (conversationId) {
    query = query.where(
      and(
        eq(agentExecutions.status, 'failure'),
        eq(agentExecutions.conversationId, conversationId)
      )
    );
  } else {
    query = query.where(eq(agentExecutions.status, 'failure'));
  }
  
  return query;
}

export async function createToolExecution(
  input: NewToolExecution
): Promise<ToolExecution> {
  const result = await db.insert(toolExecutions).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function getToolExecutionsByAgentExecutionId(
  agentExecutionId: string
): Promise<ToolExecution[]> {
  return db
    .select()
    .from(toolExecutions)
    .where(eq(toolExecutions.agentExecutionId, agentExecutionId))
    .orderBy(asc(toolExecutions.createdAt));
}
