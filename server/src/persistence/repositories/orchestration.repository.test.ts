import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/client.js';
import { users, conversations, agentExecutions } from '../db/schema.js';
import { createAgentExecution, getAgentExecutionsByConversationId, AgentExecution } from './orchestration.repository.js';
import { eq } from 'drizzle-orm';

describe('Orchestration Repository', () => {
  let testUserId: string;
  let testConversationId: string;
  let testExecution: AgentExecution;

  beforeAll(async () => {
    const uResult = await db.insert(users).values({
      name: 'Orch Test User',
      email: `orch-test-${Date.now()}@example.com`,
      defaultAddress: 'Orch St',
    }).returning();
    testUserId = uResult[0] ? uResult[0].id : '';

    const cResult = await db.insert(conversations).values({
      userId: testUserId,
      status: 'active',
    }).returning();
    testConversationId = cResult[0] ? cResult[0].id : '';
  });

  afterAll(async () => {
    if (testExecution) {
      await db.delete(agentExecutions).where(eq(agentExecutions.id, testExecution.id));
    }
    if (testConversationId) {
      await db.delete(conversations).where(eq(conversations.id, testConversationId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should create and fetch an agent execution', async () => {
    const created = await createAgentExecution({
      conversationId: testConversationId,
      agent: 'test_agent',
      status: 'success',
    });

    expect(created.id).toBeDefined();
    expect(created.agent).toBe('test_agent');

    testExecution = created;

    const fetchedList = await getAgentExecutionsByConversationId(testConversationId);
    expect(fetchedList.length).toBeGreaterThan(0);
    expect(fetchedList[0]?.id).toBe(created.id);
  });
});
