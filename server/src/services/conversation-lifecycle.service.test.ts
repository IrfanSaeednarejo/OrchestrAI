import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../persistence/db/client.js';
import { users, conversations, messages, routingHistory } from '../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  startConversation,
  sendMessage,
  loadConversation,
} from './conversation-lifecycle.service.js';
import { pocGraph } from '../graphs/poc/poc-graph.js';
import type { AnyCompiledGraph } from './conversation-lifecycle.service.js';

// ---------------------------------------------------------------------------
// Test fixtures — created once, cleaned up in afterAll
// ---------------------------------------------------------------------------
let testUserId: string;
let createdConversationId: string;
let createdMessageId: string | undefined;

beforeAll(async () => {
  const uResult = await db.insert(users).values({
    name: 'Lifecycle Test User',
    email: `lifecycle-test-${Date.now()}@example.com`,
    defaultAddress: 'Lifecycle St',
  }).returning();
  if (!uResult[0]) throw new Error('Failed to create test user');
  testUserId = uResult[0].id;
});

afterAll(async () => {
  // FK-safe cleanup
  if (createdMessageId) {
    await db.delete(messages).where(eq(messages.id, createdMessageId));
  }
  if (createdConversationId) {
    // Delete all messages just in case
    await db.delete(messages).where(eq(messages.conversationId, createdConversationId));
    // The POC graph may have written routing history entries during the invoke
    await db.delete(routingHistory).where(eq(routingHistory.conversationId, createdConversationId));
    await db.delete(conversations).where(eq(conversations.id, createdConversationId));
  }
  await db.delete(users).where(eq(users.id, testUserId));
});

describe('Conversation Lifecycle Service', () => {
  it('startConversation: creates a row, no checkpoint exists yet', async () => {
    const convo = await startConversation(testUserId);
    expect(convo.id).toBeDefined();
    expect(convo.userId).toBe(testUserId);
    expect(convo.status).toBe('active');
    createdConversationId = convo.id; // Save for cleanup and subsequent tests

    // Load it immediately — state must be null because no graph has run
    const result = await loadConversation(createdConversationId, pocGraph as unknown as AnyCompiledGraph);
    expect(result.conversation.id).toBe(createdConversationId);
    expect(result.messages).toHaveLength(0);
    expect(result.state).toBeNull();
  });

  it('sendMessage: persists message and invokes graph', async () => {
    const result = await sendMessage({
      conversationId: createdConversationId,
      role: 'user',
      content: 'Hello, graph!',
      graph: pocGraph as unknown as AnyCompiledGraph,
    });

    // 1. Message must be persisted and returned
    expect(result.message).toBeDefined();
    expect(result.message.id).toBeDefined();
    expect(result.message.role).toBe('user');
    expect(result.message.content).toBe('Hello, graph!');
    createdMessageId = result.message.id;

    // 2. State must reflect the graph invocation (POC graph sets ACTIVE and currentIntent demo_intent)
    expect(result.state).toBeDefined();
    expect(result.state.workflowStatus).toBe('ACTIVE');
    expect(result.state.currentIntent).toBe('demo_intent');
    expect(result.state.messages).toHaveLength(1); // The new message
  });

  it('loadConversation: returns conversation, full transcript, and non-null state after sendMessage', async () => {
    const result = await loadConversation(createdConversationId, pocGraph as unknown as AnyCompiledGraph);
    
    expect(result.conversation.id).toBe(createdConversationId);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content).toBe('Hello, graph!');
    
    expect(result.state).toBeDefined();
    expect(result.state?.workflowStatus).toBe('ACTIVE');
    expect(result.state?.currentIntent).toBe('demo_intent');
    // Ensure the state includes the message (from the LangGraph checkpoint)
    expect(result.state?.messages).toHaveLength(1);
  });
});
