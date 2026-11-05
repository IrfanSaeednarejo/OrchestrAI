// src/graphs/parent/parent-graph-tracing.integration.test.ts
// Phase 14: Observability & Tracing Integration Test Suite
// Validates trace config propagation, metadata/tags lifecycle across turns,
// callback observability, and offline safety against real PostgreSQL, Redis,
// and PostgresSaver checkpointer with ZERO external network calls.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '../../persistence/db/client.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import { connectRedis } from '../../persistence/redis/client.js';
import {
  users,
  orders,
  shipments,
  conversations,
  messages,
  routingHistory,
  agentExecutions,
  toolExecutions,
} from '../../persistence/db/schema.js';
import {
  createUser,
  createOrder,
  createShipment,
} from '../../persistence/repositories/marketplace.repository.js';
import {
  startConversation,
} from '../../services/conversation-lifecycle.service.js';
import { getRoutingHistoryByConversationId } from '../../persistence/repositories/orchestration.repository.js';
import { buildParentGraph } from './parent-graph.js';
import { createTraceConfig } from '../../observability/tracer.js';
import { config as appConfig } from '../../shared/config.js';

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

describe('Phase 14: Parent Graph Observability & Tracing Integration', () => {
  let fixtureUserId: string;
  let testOrderId: string;

  const createdConversationIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdShipmentIds: string[] = [];

  const parentGraph = buildParentGraph(checkpointer);

  beforeAll(async () => {
    await connectRedis();

    const user = await createUser({
      name: 'Phase 14 Tracing User',
      email: `p14-tracing-${Date.now()}@example.com`,
      defaultAddress: '1400 Observability Way',
    });
    fixtureUserId = user.id;

    const o = await createOrder({
      userId: fixtureUserId,
      totalAmount: '200.00',
      shippingAddressSnapshot: '1400 Observability Way',
      status: 'shipped',
    });
    testOrderId = o.id;
    createdOrderIds.push(o.id);

    const s = await createShipment({
      orderId: testOrderId,
      status: 'in_transit',
      carrier: 'FedEx',
      trackingNumber: 'TRK-P14-TRACING',
    });
    createdShipmentIds.push(s.id);
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

      if (createdShipmentIds.length > 0) {
        await db.delete(shipments).where(inArray(shipments.id, createdShipmentIds));
      }
      if (createdOrderIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, createdOrderIds));
      }
      if (fixtureUserId) {
        await db.delete(users).where(eq(users.id, fixtureUserId));
      }
    } catch (err) {
      console.warn('Phase 14 integration afterAll cleanup error:', err);
    }
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockEmbedContent.mockClear();
    vi.restoreAllMocks();
  });

  // ── 1. Parent graph invocation receives and propagates trace config ────────
  it('receives and executes parent graph with createTraceConfig without external API calls', async () => {
    mockGenerateContent
      // Classifier routing to order_tracking
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.96,
          reasoning: 'User is asking about their order.',
        }),
      })
      // Argument extraction
      .mockResolvedValueOnce({
        text: JSON.stringify({ orderId: testOrderId, confidence: 0.98 }),
      })
      // Order tracking grounded response
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Your order ${testOrderId} is in transit with FedEx (TRK-P14-TRACING).`,
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const chainStarts: Array<{ name?: string; tags?: string[] }> = [];
    const mockCallbackHandler = {
      handleChainStart: vi.fn((_chain, _inputs, _runId, _parentRunId, tags, _metadata, runName) => {
        chainStarts.push({ name: runName, tags });
      }),
    };

    const traceConfig = createTraceConfig(
      {
        conversationId: convo.id,
        userId: fixtureUserId,
        threadId: convo.id,
        domain: 'orders',
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        workflowStatus: 'ACTIVE',
        verificationStatus: 'LIGHT',
        handoffCount: 0,
        level: 'conversation',
        environment: appConfig.env,
      },
      {
        callbacks: [mockCallbackHandler as never],
      }
    );

    // Verify offline safety: LangSmith tracing disabled in test env by default
    expect(appConfig.langsmith.tracingEnabled).toBe(false);

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
      traceConfig
    );

    expect(state).toBeDefined();
    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.routing.currentAgent).toBe('order_tracking');

    // Verify traceConfig passed to LangGraph triggered callbacks with expected tags
    expect(mockCallbackHandler.handleChainStart).toHaveBeenCalled();
    const hasOrchestrAITag = chainStarts.some((c) => c.tags?.includes('orchestrai'));
    expect(hasOrchestrAITag).toBe(true);

    // Verify persistence records correctly linked to conversation
    const history = await getRoutingHistoryByConversationId(convo.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.destinationAgent).toBe('order_tracking');
  });

  // ── 2. Multi-turn handoff correctly updates trace metadata across turns ───
  it('correctly updates trace metadata and config across multi-turn handoffs', async () => {
    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Turn 1: Order tracking inquiry
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.95,
          reasoning: 'Inquiring about order status.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ orderId: testOrderId, confidence: 0.98 }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Your order ${testOrderId} has shipped.`,
        }),
      });

    const turn1TraceConfig = createTraceConfig({
      conversationId: convo.id,
      userId: fixtureUserId,
      threadId: convo.id,
      domain: 'orders',
      specialist: 'order_tracking',
      intent: 'ORDER_STATUS',
      workflowStatus: 'ACTIVE',
      handoffCount: 0,
      level: 'conversation',
      environment: appConfig.env,
    });

    const turn1State = await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Check status for ${testOrderId}`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      turn1TraceConfig
    );

    expect(turn1State.workflowStatus).toBe('COMPLETED');
    expect(turn1State.routing.currentAgent).toBe('order_tracking');

    // Turn 2: Follow-up requesting return -> handoff to returns specialist
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'returns',
          intent: 'RETURN_REQUEST',
          confidence: 0.95,
          reasoning: 'Customer wants to return the item.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          orderId: testOrderId,
          reason: 'Defective item',
          intent: 'create_return',
          confidence: 0.95,
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: 'I will help you create a return.',
        }),
      });

    const turn2TraceConfig = createTraceConfig({
      conversationId: convo.id,
      userId: fixtureUserId,
      threadId: convo.id,
      domain: 'orders',
      specialist: 'returns',
      intent: 'RETURN_REQUEST',
      workflowStatus: 'ACTIVE',
      handoffCount: turn1State.routing.handoffCount,
      level: 'conversation',
      environment: appConfig.env,
    });

    expect(turn2TraceConfig.tags).toContain('specialist:returns');
    expect(turn2TraceConfig.tags).toContain('intent:RETURN_REQUEST');
    expect(turn2TraceConfig.metadata?.['specialist']).toBe('returns');

    const turn2State = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Actually, I would like to return this order.')],
        user: { id: fixtureUserId },
      },
      turn2TraceConfig
    );

    expect(turn2State.routing.currentAgent).toBe('returns');
    expect(turn2State.routing.previousAgent).toBe('order_tracking');
  });

  // ── 3. Guard-triggered escalation reflects in trace metadata ──────────────
  it('reflects guard-triggered escalation in trace metadata and tags', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.95,
        reasoning: 'Circular routing request.',
      }),
    });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    // Simulate loop detection condition (previousAgent returns, handoffCount >= 2)
    const escalatedState = await parentGraph.invoke(
      {
        messages: [new HumanMessage('Send me back to returns again')],
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
      {
        configurable: {
          thread_id: convo.id,
          conversationId: convo.id,
        },
      }
    );

    expect(escalatedState.workflowStatus).toBe('ESCALATED');

    // Post-escalation trace config builder reflects ESCALATED workflow status
    const postEscalationTraceConfig = createTraceConfig({
      conversationId: convo.id,
      userId: fixtureUserId,
      threadId: convo.id,
      workflowStatus: escalatedState.workflowStatus,
      handoffCount: escalatedState.routing.handoffCount,
      level: 'conversation',
      environment: appConfig.env,
    });

    expect(postEscalationTraceConfig.tags).toContain('workflow:ESCALATED');
    expect(postEscalationTraceConfig.metadata?.['workflowStatus']).toBe('ESCALATED');
  });

  // ── 4. Tool execution durations and gate outcomes align with trace context ─
  it('aligns database execution logs with trace conversation context', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          specialist: 'order_tracking',
          intent: 'ORDER_STATUS',
          confidence: 0.98,
          reasoning: 'Check order status with orderId.',
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ orderId: testOrderId, confidence: 0.98 }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          response: `Order ${testOrderId} is shipped.`,
        }),
      });

    const convo = await startConversation(fixtureUserId);
    createdConversationIds.push(convo.id);

    const traceConfig = createTraceConfig({
      conversationId: convo.id,
      userId: fixtureUserId,
      threadId: convo.id,
      domain: 'orders',
      specialist: 'order_tracking',
      intent: 'ORDER_STATUS',
      level: 'conversation',
      environment: appConfig.env,
    });

    await parentGraph.invoke(
      {
        messages: [new HumanMessage(`Status of order ${testOrderId}`)],
        user: { id: fixtureUserId },
        identity: {
          status: 'LIGHTLY_VERIFIED',
          verificationMethod: 'order_number',
          verifiedAt: new Date().toISOString(),
        },
      },
      traceConfig
    );

    // Verify agent execution was logged in database for this conversation
    const agentRows = await db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.conversationId, convo.id));

    expect(agentRows.length).toBeGreaterThanOrEqual(1);
    const firstAgent = agentRows[0];
    if (firstAgent) {
      expect(firstAgent.agent).toBe('order_tracking');
      if (firstAgent.duration !== null) {
        expect(firstAgent.duration).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
