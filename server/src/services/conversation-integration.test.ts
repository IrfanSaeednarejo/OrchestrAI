import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../persistence/db/client.js';
import { users, conversations, messages, routingHistory } from '../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  startConversation,
  sendMessage,
  loadConversation,
  type AnyCompiledGraph
} from './conversation-lifecycle.service.js';
import { getRoutingHistoryByConversationId } from '../persistence/repositories/orchestration.repository.js';
import { getMessagesByConversationId } from '../persistence/repositories/conversation.repository.js';
import { recordRoutingEvent, type RoutingEvent } from '../routing/events.js';
import { pocGraph } from '../graphs/poc/poc-graph.js';

// ---------------------------------------------------------------------------
// Test fixtures — created once, cleaned up in afterAll
// ---------------------------------------------------------------------------
let testUserId: string;
let testConversationId: string;

beforeAll(async () => {
  const uResult = await db.insert(users).values({
    name: 'Integration Test User',
    email: `integration-test-${Date.now()}@example.com`,
    defaultAddress: 'Integration St',
  }).returning();
  if (!uResult[0]) throw new Error('Failed to create test user');
  testUserId = uResult[0].id;
});

afterAll(async () => {
  // FK-safe cleanup
  if (testConversationId) {
    await db.delete(routingHistory).where(eq(routingHistory.conversationId, testConversationId));
    await db.delete(messages).where(eq(messages.conversationId, testConversationId));
    await db.delete(conversations).where(eq(conversations.id, testConversationId));
  }
  if (testUserId) {
    await db.delete(users).where(eq(users.id, testUserId));
  }
});

// A single cohesive suite proving the full "create → send → persist → reload → resume" loop
describe('Phase 3 End-to-End Integration', () => {
  it('1. CREATE CONVERSATION', async () => {
    const convo = await startConversation(testUserId);
    expect(convo.id).toBeDefined();
    expect(convo.userId).toBe(testUserId);
    testConversationId = convo.id;

    // Assert the conversation exists in the `conversations` table directly
    const rows = await db.select().from(conversations).where(eq(conversations.id, testConversationId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(testConversationId);
  });

  it('2. & 3. PERSIST USER MESSAGE & INVOKE GRAPH / STATE TRANSITION', async () => {
    const result = await sendMessage({
      conversationId: testConversationId,
      role: 'user',
      content: 'Integration test message content',
      graph: pocGraph as unknown as AnyCompiledGraph,
    });

    // 2. Persisted user message
    const msgs = await getMessagesByConversationId(testConversationId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.content).toBe('Integration test message content');
    expect(msgs[0]?.id).toBe(result.message.id);

    // 3. Returned state reflects poc-graph's node behavior
    const state = result.state;
    expect(state.workflowStatus).toBe('ACTIVE');
    expect(state.currentIntent).toBe('demo_intent');
    expect(state.routing.currentAgent).toBe('poc-node-b');
    // pocGraph adds 2 history entries
    expect(state.routing.history).toHaveLength(2);
  });

  it('4. CHECKPOINT PERSISTED', async () => {
    // Independently verify the checkpoint persisted to Postgres
    // (don't just trust the in-memory return value from step 3)
    const result = await loadConversation(testConversationId, pocGraph as unknown as AnyCompiledGraph);
    expect(result.state).not.toBeNull();
    expect(result.state?.workflowStatus).toBe('ACTIVE');
    expect(result.state?.routing.currentAgent).toBe('poc-node-b');
    expect(result.state?.routing.history).toHaveLength(2);
  });

  it('5. OPERATIONAL EVENT', async () => {
    // Explicitly call recordRoutingEvent. pocGraph doesn't call this internally.
    // This proves the event layer writes operational records correctly.
    const event: RoutingEvent = {
      conversationId: testConversationId,
      sourceAgent: null,
      destinationAgent: 'poc-node-a',
      decisionType: 'INITIAL_ROUTE',
      reason: 'test integration event',
      intent: null,
    };
    const stateUpdate = await recordRoutingEvent(event);

    // Assert the routing_history row was created in Postgres
    const rows = await getRoutingHistoryByConversationId(testConversationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.destinationAgent).toBe('poc-node-a');
    expect(rows[0]?.reason).toBe('test integration event');

    // State update should match the pure rules for INITIAL_ROUTE
    expect(stateUpdate.routing?.currentAgent).toBe('poc-node-a');
  });

  it('6. & 7. RELOAD / RESUME & VERIFY CONSISTENCY', async () => {
    const result = await loadConversation(testConversationId, pocGraph as unknown as AnyCompiledGraph);

    // 6a. conversation returned correctly
    expect(result.conversation.id).toBe(testConversationId);

    // 6b. messages array contains exactly one message
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe('Integration test message content');

    // 6c. state is non-null and accumulated graph state matches
    expect(result.state).not.toBeNull();
    expect(result.state?.workflowStatus).toBe('ACTIVE');

    // 7. Verify consistency across systems
    // a. The conversation's message count in the `messages` table
    const tableMessages = await getMessagesByConversationId(testConversationId);
    expect(tableMessages).toHaveLength(1);

    // b. The checkpoint state's messages array length
    // (the graph only received the one message that was sent)
    expect(result.state?.messages).toHaveLength(1);

    // c. The routing_history table has exactly 1 row
    // WHY these numbers: routing_history has 1 row because we called recordRoutingEvent 
    // exactly once in this test (step 5). pocGraph itself modifies the graph state history 
    // but DOES NOT write to this operational table. The messages table and graph state 
    // messages both have 1 entry because we sent exactly 1 message via sendMessage.
    const routingRows = await getRoutingHistoryByConversationId(testConversationId);
    expect(routingRows).toHaveLength(1);
  });
});
