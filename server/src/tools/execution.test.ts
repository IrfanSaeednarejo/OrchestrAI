import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { executeTool } from './execution.js';
import { db } from '../persistence/db/client.js';
import { users, conversations, agentExecutions, toolExecutions, orders } from '../persistence/db/schema.js';
import { createAgentExecution, AgentExecution } from '../persistence/repositories/orchestration.repository.js';
import { getOrder, getOrderMetadata } from './queries/order.tools.js';
import { verifyIdentity, verifyIdentityMetadata, startIdentityVerification, startIdentityVerificationMetadata } from './mutations/identity.tools.js';
import { eq, desc } from 'drizzle-orm';
import { ToolResult } from './types.js';
import { connectRedis } from '../persistence/redis/client.js';

describe('executeTool wrapper', () => {
  let testUserId: string;
  let testConversationId: string;
  let testExecution: AgentExecution;
  let testOrderId: string;

  beforeAll(async () => {
    await connectRedis();

    const uResult = await db.insert(users).values({
      name: 'ExecuteTool Test User',
      email: `execute-test-${Date.now()}@example.com`,
      defaultAddress: 'Exec St',
    }).returning();
    testUserId = uResult[0] ? uResult[0].id : '';

    const cResult = await db.insert(conversations).values({
      userId: testUserId,
      status: 'active',
    }).returning();
    testConversationId = cResult[0] ? cResult[0].id : '';

    testExecution = await createAgentExecution({
      conversationId: testConversationId,
      agent: 'test_agent',
      status: 'success',
    });

    const oResult = await db.insert(orders).values({
      userId: testUserId,
      status: 'pending',
      shippingAddressSnapshot: 'Exec St',
      totalAmount: '100.00',
    }).returning();
    testOrderId = oResult[0] ? oResult[0].id : '';
  });

  afterAll(async () => {
    // Delete tool executions first
    await db.delete(toolExecutions).where(eq(toolExecutions.agentExecutionId, testExecution.id));
    
    if (testExecution) {
      await db.delete(agentExecutions).where(eq(agentExecutions.id, testExecution.id));
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

  async function getLatestToolExecution() {
    const res = await db.select().from(toolExecutions)
      .where(eq(toolExecutions.agentExecutionId, testExecution.id))
      .orderBy(desc(toolExecutions.createdAt))
      .limit(1);
    return res[0];
  }

  it('Success path: wrapping a real existing tool without redaction', async () => {
    const input = { orderId: testOrderId };
    const result = await executeTool(
      getOrder,
      getOrderMetadata,
      input,
      { agentExecutionId: testExecution.id }
    );

    expect(result.success).toBe(true);

    const logRow = await getLatestToolExecution();
    expect(logRow).toBeDefined();
    expect(logRow?.status).toBe('success');
    expect(logRow?.tool).toBe(getOrderMetadata.name);
    expect(logRow?.duration).not.toBeNull();
    expect(logRow?.input).toEqual(input);
    
    if (result.success) {
      expect(logRow?.output).toEqual(JSON.parse(JSON.stringify(result.data)));
    }
  });

  it('Failure path: normal NOT_FOUND failure is recorded', async () => {
    const nonexistentId = '00000000-0000-0000-0000-000000000000';
    const input = { orderId: nonexistentId };
    const result = await executeTool(
      getOrder,
      getOrderMetadata,
      input,
      { agentExecutionId: testExecution.id }
    );

    expect(result.success).toBe(false);

    const logRow = await getLatestToolExecution();
    expect(logRow).toBeDefined();
    expect(logRow?.status).toBe('failure');
    expect(logRow?.error).toContain('NOT_FOUND');
    expect(logRow?.output).toBeNull();
  });

  it('Input redaction: wrapping verifyIdentity correctly redacts code field', async () => {
    const input = { userId: testUserId, code: '123456' };
    const result = await executeTool(
      verifyIdentity,
      verifyIdentityMetadata,
      input,
      { agentExecutionId: testExecution.id }
    );

    // Expecting CODE_EXPIRED or INVALID_CODE depending on state, but the wrapper works either way
    expect(result.success).toBe(false);

    const logRow = await getLatestToolExecution();
    expect(logRow).toBeDefined();
    expect(logRow?.input).toEqual({ userId: testUserId, code: '[REDACTED]' });
  });

  it('Output redaction: wrapping startIdentityVerification correctly redacts code in output', async () => {
    const input = { userId: testUserId };
    const result = await executeTool(
      startIdentityVerification,
      startIdentityVerificationMetadata,
      input,
      { agentExecutionId: testExecution.id }
    );

    expect(result.success).toBe(true);
    
    // The returned result to the caller should have the real code
    if (result.success) {
      expect(result.data.code).toMatch(/^\d{6}$/);
    }

    const logRow = await getLatestToolExecution();
    expect(logRow).toBeDefined();
    
    // The logged row should be redacted
    expect(logRow?.output).toEqual({ code: '[REDACTED]' });
  });

  it('Contract-violation safety net: catches synchronous throws', async () => {
    const throwingTool = async (): Promise<ToolResult<unknown>> => {
      throw new Error('boom');
    };

    const result = await executeTool(
      throwingTool,
      { name: 'thrower', requiredVerification: 'NONE' },
      { some: 'data' },
      { agentExecutionId: testExecution.id }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNEXPECTED_ERROR');
      expect(result.error.message).toBe('boom');
    }

    const logRow = await getLatestToolExecution();
    expect(logRow).toBeDefined();
    expect(logRow?.status).toBe('failure');
    expect(logRow?.error).toContain('boom');
  });

  it('Logging-failure isolation: suppresses recordToolExecution throw', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'; // Violates FK constraint on agent_executions
    
    // Silence console.error for this specific test so it doesn't clutter output
    const originalError = console.error;
    let loggedError = false;
    console.error = () => { loggedError = true; };

    const result = await executeTool(
      getOrder,
      getOrderMetadata,
      { orderId: testOrderId },
      { agentExecutionId: fakeId }
    );

    console.error = originalError;

    // Must still return the real success result
    expect(result.success).toBe(true);
    expect(loggedError).toBe(true);
  });
});
