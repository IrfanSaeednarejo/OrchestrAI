import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../persistence/db/client.js';
import { users, conversations, agentExecutions, routingHistory, toolExecutions } from '../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  toRoutingHistoryRecord,
  toRoutingStateUpdate,
  recordRoutingEvent,
  recordAgentExecution,
  recordToolExecution,
  type RoutingEvent,
  type AgentExecutionEvent,
  type ToolExecutionEvent,
} from './events.js';
import { getRoutingHistoryByConversationId } from '../persistence/repositories/orchestration.repository.js';

// ---------------------------------------------------------------------------
// Test fixtures — created once, cleaned up in afterAll
// ---------------------------------------------------------------------------
let testUserId: string;
let testConversationId: string;
let testAgentExecutionId: string;

beforeAll(async () => {
  const uResult = await db.insert(users).values({
    name: 'Events Test User',
    email: `events-test-${Date.now()}@example.com`,
    defaultAddress: 'Events St',
  }).returning();
  if (!uResult[0]) throw new Error('Failed to create test user');
  testUserId = uResult[0].id;

  const cResult = await db.insert(conversations).values({
    userId: testUserId,
    status: 'active',
  }).returning();
  if (!cResult[0]) throw new Error('Failed to create test conversation');
  testConversationId = cResult[0].id;

  const aeResult = await db.insert(agentExecutions).values({
    conversationId: testConversationId,
    agent: 'fixture_agent',
    status: 'success',
  }).returning();
  if (!aeResult[0]) throw new Error('Failed to create test agent execution');
  testAgentExecutionId = aeResult[0].id;
});

afterAll(async () => {
  // FK-safe order: tool_executions -> agent_executions -> routing_history -> conversations -> users
  await db.delete(toolExecutions).where(eq(toolExecutions.agentExecutionId, testAgentExecutionId));
  await db.delete(agentExecutions).where(eq(agentExecutions.conversationId, testConversationId));
  await db.delete(routingHistory).where(eq(routingHistory.conversationId, testConversationId));
  await db.delete(conversations).where(eq(conversations.id, testConversationId));
  await db.delete(users).where(eq(users.id, testUserId));
});

// ---------------------------------------------------------------------------
// Pure function tests — no DB needed
// ---------------------------------------------------------------------------
describe('toRoutingStateUpdate', () => {
  const baseEvent: RoutingEvent = {
    conversationId: 'c1',
    sourceAgent: 'agent-a',
    destinationAgent: 'agent-b',
    intent: 'track_order',
    decisionType: 'HANDOFF',
    reason: 'Escalating to specialist',
  };

  it('HANDOFF: sets handoffCount delta to 1', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, decisionType: 'HANDOFF' });
    expect(update.routing?.handoffCount).toBe(1);
  });

  it('RE_ROUTE: sets handoffCount delta to 1', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, decisionType: 'RE_ROUTE' });
    expect(update.routing?.handoffCount).toBe(1);
  });

  it('INITIAL_ROUTE: does NOT include handoffCount', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, decisionType: 'INITIAL_ROUTE' });
    expect(Object.prototype.hasOwnProperty.call(update.routing, 'handoffCount')).toBe(false);
  });

  it('ESCALATION: does NOT include handoffCount', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, decisionType: 'ESCALATION' });
    expect(Object.prototype.hasOwnProperty.call(update.routing, 'handoffCount')).toBe(false);
  });

  it('FALLBACK: does NOT include handoffCount', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, decisionType: 'FALLBACK' });
    expect(Object.prototype.hasOwnProperty.call(update.routing, 'handoffCount')).toBe(false);
  });

  it('omits currentDomain entirely when newDomain not provided', () => {
    const update = toRoutingStateUpdate(baseEvent);
    expect(Object.prototype.hasOwnProperty.call(update, 'currentDomain')).toBe(false);
  });

  it('includes currentDomain when newDomain is provided', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, newDomain: 'marketplace' });
    expect(Object.prototype.hasOwnProperty.call(update, 'currentDomain')).toBe(true);
    expect(update.currentDomain).toBe('marketplace');
  });

  it('omits currentIntent when intent is null', () => {
    const update = toRoutingStateUpdate({ ...baseEvent, intent: null });
    expect(Object.prototype.hasOwnProperty.call(update, 'currentIntent')).toBe(false);
  });

  it('includes currentIntent when intent is non-null', () => {
    const update = toRoutingStateUpdate(baseEvent);
    expect(Object.prototype.hasOwnProperty.call(update, 'currentIntent')).toBe(true);
    expect(update.currentIntent).toBe('track_order');
  });

  it('always sets routing.currentAgent, previousAgent, history, visitedAgents', () => {
    const update = toRoutingStateUpdate(baseEvent);
    expect(update.routing?.currentAgent).toBe('agent-b');
    expect(update.routing?.previousAgent).toBe('agent-a');
    expect(update.routing?.history).toHaveLength(1);
    expect(update.routing?.history?.[0]?.toAgent).toBe('agent-b');
    expect(update.routing?.visitedAgents).toEqual(['agent-b']);
  });
});

describe('toRoutingHistoryRecord', () => {
  it('maps all fields to the correct repository shape', () => {
    const event: RoutingEvent = {
      conversationId: 'c1',
      sourceAgent: null,
      destinationAgent: 'router',
      intent: 'initial',
      decisionType: 'INITIAL_ROUTE',
      reason: 'First dispatch',
    };
    const record = toRoutingHistoryRecord(event);
    expect(record.conversationId).toBe('c1');
    expect(record.sourceAgent).toBeNull();
    expect(record.destinationAgent).toBe('router');
    expect(record.intent).toBe('initial');
    expect(record.decisionType).toBe('INITIAL_ROUTE');
    expect(record.reason).toBe('First dispatch');
    // Timestamp is handled by the table default — must not appear in the insert record
    expect(Object.prototype.hasOwnProperty.call(record, 'timestamp')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — real DB
// ---------------------------------------------------------------------------
describe('recordRoutingEvent', () => {
  it('creates a routing_history row and returns the correct state update', async () => {
    const event: RoutingEvent = {
      conversationId: testConversationId,
      sourceAgent: null,
      destinationAgent: 'router-agent',
      intent: 'test_intent',
      decisionType: 'INITIAL_ROUTE',
      reason: 'events.test integration',
    };

    const stateUpdate = await recordRoutingEvent(event);

    // Confirm the record was persisted
    const rows = await getRoutingHistoryByConversationId(testConversationId);
    expect(rows.length).toBeGreaterThan(0);
    const created = rows.find(r => r.destinationAgent === 'router-agent');
    expect(created).toBeDefined();
    expect(created?.reason).toBe('events.test integration');

    // Confirm returned state update matches the pure function output
    const expected = toRoutingStateUpdate(event);
    expect(stateUpdate.routing?.currentAgent).toBe(expected.routing?.currentAgent);
    expect(stateUpdate.routing?.history).toHaveLength(1);
    // INITIAL_ROUTE — no handoffCount key
    expect(Object.prototype.hasOwnProperty.call(stateUpdate.routing, 'handoffCount')).toBe(false);
  });

  it('throws and returns nothing when the FK constraint is violated', async () => {
    const badEvent: RoutingEvent = {
      conversationId: '00000000-0000-0000-0000-000000000000', // nonexistent
      sourceAgent: null,
      destinationAgent: 'router',
      intent: null,
      decisionType: 'INITIAL_ROUTE',
      reason: 'should fail',
    };

    await expect(recordRoutingEvent(badEvent)).rejects.toThrow();
  });
});

describe('recordAgentExecution', () => {
  it('creates an agent_execution row and returns the created record', async () => {
    const event: AgentExecutionEvent = {
      conversationId: testConversationId,
      agent: 'test-agent',
      inputSummary: 'User asked about order',
      outputSummary: 'Order status fetched',
      duration: 123,
      status: 'success',
    };
    const result = await recordAgentExecution(event);
    expect(result.id).toBeDefined();
    expect(result.agent).toBe('test-agent');
    expect(result.status).toBe('success');
    expect(result.duration).toBe(123);
  });
});

describe('recordToolExecution', () => {
  it('creates a tool_execution row and returns the created record', async () => {
    const event: ToolExecutionEvent = {
      agentExecutionId: testAgentExecutionId,
      tool: 'get_order_status',
      input: { orderId: 'abc' },
      output: { status: 'delivered' },
      duration: 55,
      status: 'success',
    };
    const result = await recordToolExecution(event);
    expect(result.id).toBeDefined();
    expect(result.tool).toBe('get_order_status');
    expect(result.status).toBe('success');
    expect(result.duration).toBe(55);
  });
});
