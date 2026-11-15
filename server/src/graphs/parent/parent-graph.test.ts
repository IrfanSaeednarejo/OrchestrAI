// src/graphs/parent/parent-graph.test.ts
// Phase 8: Unit tests for parent graph & stateful router.
// Fast in-memory execution with MemorySaver and mocked @google/genai.
// Phase 23: Updated greeting test for LLM-generated greeting + service options;
//           added order tracking continuation guard test.

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

import { buildParentGraph } from './parent-graph.js';
import { SPECIALIST_STUBS, type StubBehavior } from '../../agents/specialists/stubs.js';

describe('Parent Graph & Stateful Router', () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  it('routes initial order tracking message to order_tracking specialist and completes', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked about order tracking.',
      }),
    });

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Where is my package #ord-123?')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('order_tracking');
    expect(result.routing.visitedAgents).toContain('order_tracking');
    expect(result.currentIntent).toBe('ORDER_STATUS');
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('routes directly to resume target when activeWorkflow preconditions are met without calling LLM', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('I verified my identity.')],
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'sms_otp',
          verifiedAt: '2026-11-05T00:00:00Z',
        },
        activeWorkflow: {
          workflowId: 'wf-pay-1',
          originatingIntent: 'get_payment',
          currentStep: 'get_payment',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'payment', agent: 'payment', workflowStep: 'get_payment' },
          resumeContext: { orderId: 'ord-123' },
        },
      },
      { configurable: { thread_id: threadId } }
    );

    // LLM should not have been called because deterministic resume guard fired first
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('payment');
  });

  it('escalates to human agent when handoff cap (>= 3) is reached without calling LLM', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Still need help')],
        routing: {
          currentAgent: 'returns',
          previousAgent: 'order_tracking',
          history: [],
          handoffCount: 3, // at limit
          visitedAgents: ['order_tracking', 'returns'],
        },
      },
      { configurable: { thread_id: threadId } }
    );

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.workflowStatus).toBe('ESCALATED');
    expect(result.routing.currentAgent).toBe('escalation');
  });

  it('detects routing loop and escalates', async () => {
    // LLM wants to route to 'returns', but 'returns' is the previous agent and handoffCount >= 2
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.9,
        reasoning: 'Customer asked for return.',
      }),
    });

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Send me back to returns')],
        routing: {
          currentAgent: 'order_tracking',
          previousAgent: 'returns', // ping-pong target
          history: [],
          handoffCount: 2,
          visitedAgents: ['returns', 'order_tracking'],
        },
      },
      { configurable: { thread_id: threadId } }
    );

    expect(result.workflowStatus).toBe('ESCALATED');
    expect(result.routing.currentAgent).toBe('escalation');
  });

  it('handles specialist handoff back to router and re-routes to target specialist', async () => {
    // 1st LLM call: router classifies initial message to returns
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'RETURN_REQUEST',
        confidence: 0.95,
        reasoning: 'Initial returns classification',
      }),
    });

    // 2nd LLM call: after returns stub hands off with detectedIntent refund_request
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_REQUEST',
        confidence: 0.95,
        reasoning: 'Re-routing after returns handoff to refund',
      }),
    });

    const handoffBehavior: StubBehavior = {
      type: 'HANDOFF',
      handoffRequest: {
        sourceAgent: 'returns',
        handoffReason: 'Item non-returnable, issuing refund instead',
        detectedIntent: 'refund_request',
        recommendedDomain: 'refund',
        relevantContext: { orderId: 'ord-123' },
        attemptedActions: ['check_return_eligibility'],
        confidence: 0.95,
      },
    };

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('I want to return this damaged item')],
      },
      {
        configurable: {
          thread_id: threadId,
          stubBehaviors: {
            returns: handoffBehavior,
          },
        },
      }
    );

    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('refund');
    expect(result.routing.previousAgent).toBe('returns');
    expect(result.routing.handoffCount).toBe(2); // 1 from handoff + 1 from re-route
  });

  it('records FALLBACK decision when classifier fails and defaults to general_assistant', async () => {
    // Classifier throws or produces invalid response
    mockGenerateContent.mockRejectedValueOnce(new Error('LLM rate limit / network error'));

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Help with something unexpected')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('general_assistant');
    expect(result.routing.history.at(-1)?.reason).toContain('Classifier fallback');
  });

  it('terminal ESCALATED state lock: subsequent messages do NOT call LLM and stay ESCALATED', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Hello, is anyone there?')],
        workflowStatus: 'ESCALATED',
        routing: {
          currentAgent: 'escalation',
          previousAgent: 'returns',
          history: [],
          handoffCount: 1,
          visitedAgents: ['returns', 'escalation'],
        },
      },
      { configurable: { thread_id: threadId } }
    );

    // LLM must not be called because conversation is locked in ESCALATED state
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.workflowStatus).toBe('ESCALATED');
    expect(result.routing.currentAgent).toBe('escalation');
    expect(result.messages.at(-1)?.content).toMatch(/human specialist/i);
  });

  it('greets customer directly from router on "hello there" and routes to specialist on subsequent turn', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    // Mock the LLM greeting call (generateStructuredOutput inside generateGreetingResponse)
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        greeting: 'Hi there! How can I help you today?',
        options: [
          { label: 'Track an Order', message: 'I need to track my order' },
          { label: 'Request a Return', message: 'I would like to request a return' },
          { label: 'Request a Refund', message: 'I need help with a refund' },
          { label: 'Manage Payments', message: 'I have a question about a payment' },
          { label: 'Update Profile', message: 'I need to update my profile' },
          { label: 'Account Security', message: 'I need help with my account or password' },
        ],
      }),
    });

    // Turn 1: Greeting
    const turn1 = await graph.invoke(
      {
        messages: [new HumanMessage('hello there')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(turn1.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1.routing.currentAgent).toBe('router');
    expect(turn1.currentIntent).toBe('GREETING');
    // LLM-generated greeting should be short and NOT repeat the full static intro
    const greetingContent = turn1.messages.at(-1)?.content as string;
    expect(greetingContent).toBeTruthy();
    expect(greetingContent.length).toBeGreaterThan(0);
    // Service options should be encoded in additional_kwargs
    const greetingMsg = turn1.messages.at(-1) as import('@langchain/core/messages').AIMessage;
    expect(Array.isArray(greetingMsg.additional_kwargs?.['options'])).toBe(true);
    expect((greetingMsg.additional_kwargs?.['options'] as unknown[]).length).toBe(6);

    // Turn 2: Customer provides order request
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer provided order status inquiry.',
      }),
    });

    const turn2 = await graph.invoke(
      {
        messages: [new HumanMessage('Where is my package #ord-123?')],
      },
      { configurable: { thread_id: threadId } }
    );

    expect(turn2.workflowStatus).toBe('COMPLETED');
    expect(turn2.routing.currentAgent).toBe('order_tracking');
    expect(turn2.routing.handoffCount).toBe(0); // initial route from router supervisor, not lateral handoff
  });

  it('greets customer with fallback static greeting when LLM call fails', async () => {
    // LLM throws — greeting should still work via static fallback
    mockGenerateContent.mockRejectedValueOnce(new Error('LLM unavailable'));

    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const turn1 = await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: threadId } }
    );

    expect(turn1.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(turn1.routing.currentAgent).toBe('router');
    expect(turn1.currentIntent).toBe('GREETING');
    const greetingContent = turn1.messages.at(-1)?.content as string;
    expect(greetingContent.length).toBeGreaterThan(0);
    // Fallback options should still be present
    const greetingMsg = turn1.messages.at(-1) as import('@langchain/core/messages').AIMessage;
    expect(Array.isArray(greetingMsg.additional_kwargs?.['options'])).toBe(true);
  });

  it('order tracking continuation guard: routes bare UUID back to order_tracking without LLM when WAITING_FOR_USER_INPUT', async () => {
    // The bare-UUID guard fires BEFORE the classifier — no LLM call should be made
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    // Set up state that matches the guard condition:
    // currentAgent = 'order_tracking', workflowStatus = 'WAITING_FOR_USER_INPUT', message is a bare UUID
    const targetUuid = crypto.randomUUID();
    const result = await graph.invoke(
      {
        messages: [new HumanMessage(targetUuid)],
        routing: {
          currentAgent: 'order_tracking',
          previousAgent: null,
          history: [],
          handoffCount: 0,
          visitedAgents: ['order_tracking'],
        },
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        currentIntent: 'ORDER_STATUS',
      },
      { configurable: { thread_id: threadId } }
    );

    // The classifier LLM mock should NOT have been called (guard bypasses it)
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // The order_tracking stub should have been called — it returns COMPLETED
    expect(result.routing.currentAgent).toBe('order_tracking');
    expect(result.workflowStatus).toBe('COMPLETED');
  });

  it('routes directly to account_access when activeWorkflow.currentStep is verify_identity without calling LLM', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    const result = await graph.invoke(
      {
        messages: [new HumanMessage('123456')],
        activeWorkflow: {
          workflowId: 'wf-ret-1',
          originatingIntent: 'CREATE_RETURN',
          currentStep: 'verify_identity',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'create_return' },
          resumeContext: { orderId: 'ord-123' },
        },
        workflowStatus: 'WAITING_FOR_USER_INPUT',
      },
      { configurable: { thread_id: threadId } }
    );

    // Classifier LLM should not be called
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // Routed to account_access
    expect(result.routing.currentAgent).toBe('account_access');
  });

  it('resumes activeWorkflow without triggering loop detection even if previously visited', async () => {
    const checkpointer = new MemorySaver();
    const graph = buildParentGraph(checkpointer, { specialists: SPECIALIST_STUBS });
    const threadId = crypto.randomUUID();

    // Setup state where returns was already visited and in history, but now verification is satisfied
    const result = await graph.invoke(
      {
        messages: [new HumanMessage('Continue with my return')],
        identity: {
          status: 'VERIFIED',
          verificationMethod: 'otp',
          verifiedAt: new Date().toISOString(),
        },
        routing: {
          currentAgent: 'account_access',
          previousAgent: 'returns',
          history: [
            { fromAgent: 'returns', toAgent: 'account_access', reason: 'Verify', timestamp: new Date().toISOString() },
            { fromAgent: null, toAgent: 'returns', reason: 'Initial', timestamp: new Date().toISOString() },
          ],
          handoffCount: 2,
          visitedAgents: ['returns', 'account_access'],
        },
        activeWorkflow: {
          workflowId: 'wf-ret-1',
          originatingIntent: 'CREATE_RETURN',
          currentStep: 'create_return',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'create_return' },
          resumeContext: { orderId: 'ord-123' },
        },
      },
      { configurable: { thread_id: threadId } }
    );

    // Resumed to returns instead of being escalated as a loop
    expect(result.workflowStatus).toBe('COMPLETED');
    expect(result.routing.currentAgent).toBe('returns');
  });
});

