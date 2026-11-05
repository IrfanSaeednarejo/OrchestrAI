// src/graphs/parent/parent-graph-failure-handling.integration.test.ts
// Phase 13: Failure Handling & Loop Prevention Integration Suite
// Validates loop prevention, tool failure retries, max handoffs escalation,
// terminal ESCALATED state lock, and classifier fallback live against
// real PostgreSQL, pgvector, Redis, and PostgresSaver checkpointer.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '../../persistence/db/client.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import { connectRedis } from '../../persistence/redis/client.js';
import {
  users,
  orders,
  payments as paymentsTable,
  conversations,
  messages,
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../../persistence/db/schema.js';
import {
  createUser,
  createOrder,
  createPayment,
} from '../../persistence/repositories/marketplace.repository.js';
import {
  startConversation,
} from '../../services/conversation-lifecycle.service.js';
import { getRoutingHistoryByConversationId } from '../../persistence/repositories/orchestration.repository.js';
import { buildParentGraph } from './parent-graph.js';
import * as orderQueries from '../../tools/queries/order.tools.js';

// ---------------------------------------------------------------------------
// Mock @google/genai — zero external network calls in test suite
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockEmbedContent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    embeddings: [{ values: new Array(768).fill(0.01) }],
  })
);

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
        embedContent: mockEmbedContent,
      };
    },
  };
});

describe('Phase 13: Failure Handling & Loop Prevention Integration', () => {
  let fixtureUserId: string;
  let testOrderId: string;

  const createdConversationIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];

  const parentGraph = buildParentGraph(checkpointer);

  beforeAll(async () => {
    await connectRedis();

    const user = await createUser({
      name: 'Phase 13 Failure Handling User',
      email: `p13-failure-${Date.now()}@example.com`,
      defaultAddress: '1300 Resilience Boulevard',
    });
    fixtureUserId = user.id;

    const o = await createOrder({
      userId: fixtureUserId,
      totalAmount: '150.00',
      shippingAddressSnapshot: '1300 Resilience Boulevard',
      status: 'paid',
    });
    testOrderId = o.id;
    createdOrderIds.push(o.id);

    const p = await createPayment({
      orderId: testOrderId,
      amount: '150.00',
      status: 'captured',
      method: 'credit_card',
    });
    createdPaymentIds.push(p.id);
  });

  afterAll(async () => {
    try {
      for (const cid of createdConversationIds) {
        const aRows = await db
          .select({ id: agentExecutions.id })
          .from(agentExecutions)
          .where(eq(agentExecutions.conversationId, cid));
        for (const a of aRows) {
          await db.delete(toolExecutions).where(eq(toolExecutions.agentExecutionId, a.id));
        }
        await db.delete(agentExecutions).where(eq(agentExecutions.conversationId, cid));
        await db.delete(routingHistory).where(eq(routingHistory.conversationId, cid));
        await db.delete(messages).where(eq(messages.conversationId, cid));
        await db.delete(conversations).where(eq(conversations.id, cid));
      }

      if (createdPaymentIds.length > 0) {
        await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
      }
      if (createdOrderIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, createdOrderIds));
      }
      if (fixtureUserId) {
        await db.delete(users).where(eq(users.id, fixtureUserId));
      }
    } catch (err) {
      console.warn('Phase 13 integration afterAll cleanup error:', err);
    }
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockEmbedContent.mockClear();
    vi.restoreAllMocks();
  });

  // ── 1. Scenario 10: Routing Loop Detection -> Escalation ──────────────────
  it('Scenario 10: Circular agent routing loop triggers loop detection guard -> ESCALATION', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.95,
        reasoning: 'Customer insists on returning item.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Simulate state where returns was previousAgent and handoffCount >= 2
    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Send me back to returns')],
        user: { id: fixtureUserId },
        routing: {
          currentAgent: 'payment',
          previousAgent: 'returns',
          history: [
            { fromAgent: null, toAgent: 'returns', reason: 'Initial', timestamp: new Date().toISOString() },
            { fromAgent: 'returns', toAgent: 'payment', reason: 'Payment query', timestamp: new Date().toISOString() },
            { fromAgent: 'payment', toAgent: 'returns', reason: 'Loop bounce', timestamp: new Date().toISOString() },
          ],
          handoffCount: 2,
          visitedAgents: ['returns', 'payment'],
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(state.workflowStatus).toBe('ESCALATED');
    expect(state.routing.currentAgent).toBe('escalation');
    expect(state.messages.at(-1)?.content).toMatch(/escalat|human|supervisor/i);

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.at(-1)?.decisionType).toBe('ESCALATION');
    expect(history.at(-1)?.reason).toContain('Routing loop detected');
  });

  // ── 2. Scenario 11: Tool Failure -> Retry Once -> Escalate ───────────────
  it('Scenario 11: Tool transient timeout retries once, then escalates to human support (ESCALATED)', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.98,
          reasoning: 'Customer queries order status.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: testOrderId,
          confidence: 0.99,
        }),
      });

    // Spy on getOrder and simulate a transient upstream infrastructure failure (TIMEOUT)
    let getOrderAttempts = 0;
    vi.spyOn(orderQueries, 'getOrder').mockImplementation(async () => {
      getOrderAttempts++;
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Upstream order service connection timed out after 5000ms',
        },
      };
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`What is the status of my order ${testOrderId}?`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Verified: executeTool retried once (total 2 attempts)
    expect(getOrderAttempts).toBe(2);

    // Verified: Specialist transitioned to ESCALATED with a human support message
    expect(state.workflowStatus).toBe('ESCALATED');
    expect(state.messages.at(-1)?.content).toMatch(/technical issues|escalating.*human/i);

    // Check that tool execution was logged as failure with attempt count
    const aRows = await db
      .select({ id: agentExecutions.id })
      .from(agentExecutions)
      .where(eq(agentExecutions.conversationId, convo.id));
    expect(aRows.length).toBeGreaterThan(0);

    const firstAgentExecution = aRows[0];
    expect(firstAgentExecution).toBeDefined();
    if (!firstAgentExecution) return;

    const tRows = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.agentExecutionId, firstAgentExecution.id));
    expect(tRows.length).toBeGreaterThan(0);
    const firstToolExecution = tRows[0];
    expect(firstToolExecution).toBeDefined();
    expect(firstToolExecution?.status).toBe('failure');
    expect(firstToolExecution?.error).toContain('failed after 2 attempts');
  });

  // ── 3. Scenario 12: Max Handoffs Exceeded -> Escalate ─────────────────────
  it('Scenario 12: Lateral handoff limit reached (handoffCount >= 3) -> ESCALATION', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('I still have an issue with my transaction')],
        user: { id: fixtureUserId },
        routing: {
          currentAgent: 'payment',
          previousAgent: 'refund',
          history: [
            { fromAgent: null, toAgent: 'order_tracking', reason: 'Initial', timestamp: new Date().toISOString() },
            { fromAgent: 'order_tracking', toAgent: 'returns', reason: 'Return inquiry', timestamp: new Date().toISOString() },
            { fromAgent: 'returns', toAgent: 'payment', reason: 'Payment query', timestamp: new Date().toISOString() },
          ],
          handoffCount: 3, // at limit
          visitedAgents: ['order_tracking', 'returns', 'payment'],
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Pre-classification guard fires before LLM
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(state.workflowStatus).toBe('ESCALATED');
    expect(state.routing.currentAgent).toBe('escalation');
    expect(state.messages.at(-1)?.content).toMatch(/human specialist/i);

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.at(-1)?.decisionType).toBe('ESCALATION');
    expect(history.at(-1)?.reason).toContain('Maximum lateral handoff limit reached');
  });

  // ── 4. Terminal ESCALATED State Lock (OD-13) ──────────────────────────────
  it('Terminal ESCALATED state lock: subsequent messages do NOT re-enter classifier and stay ESCALATED', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Turn 1: Force conversation into ESCALATED state via handoff cap
    const turn1State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('I need help')],
        user: { id: fixtureUserId },
        routing: {
          currentAgent: 'returns',
          previousAgent: 'order_tracking',
          history: [],
          handoffCount: 3,
          visitedAgents: ['order_tracking', 'returns'],
        },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(turn1State.workflowStatus).toBe('ESCALATED');

    // Turn 2: Customer sends another message in the same thread
    const turn2State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Is a real person going to join?')],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Must NOT call classifier; must preserve ESCALATED state
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(turn2State.workflowStatus).toBe('ESCALATED');
    expect(turn2State.routing.currentAgent).toBe('escalation');
    expect(turn2State.messages.at(-1)?.content).toMatch(/human specialist/i);

    // Turn 3: Customer sends a third message
    const turn3State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Checking in again')],
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(turn3State.workflowStatus).toBe('ESCALATED');
  });

  // ── 5. Classifier Error Fallback ──────────────────────────────────────────
  it('Classifier error fallback: LLM failure records FALLBACK decision and defaults safely', async () => {
    // Mock classifier to reject / fail
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API 503 Service Unavailable'));

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const state = await parentGraph.invoke(
      {
        messages: [new HumanMessage('I have a question about my purchase')],
        user: { id: fixtureUserId },
      },
      { configurable: { thread_id: convo.id, conversationId: convo.id } }
    );

    // Defaulted to order_tracking without crashing
    expect(state.routing.currentAgent).toBe('order_tracking');

    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBeGreaterThan(0);
    const firstHistory = history[0];
    expect(firstHistory).toBeDefined();
    expect(firstHistory?.decisionType).toBe('FALLBACK');
    expect(firstHistory?.reason).toContain('Classifier fallback');
  });
});
