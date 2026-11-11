// src/graphs/parent/conversation-flow.test.ts
// Phase 24 Step 24.0: Regression test suite for conversational routing & sticky guard locks.
// Tests multi-turn interactions on a single thread to expose sticky guard locks and context blindness.
//
// Scenarios:
//   A: Completed order_tracking -> user asks "what else can you do?" -> must NOT route to order_tracking (FAILS on current code).
//   B: order_tracking WAITING_FOR_USER_INPUT -> user says "change my name to Alice" -> must classify and route to profile (FAILS on current code due to guard 3b).
//   C: Completed order_tracking -> user says "can I get a refund for this order?" -> classifier must receive prior turn/context and route to refund (FAILS on current code).
//   D: payment awaiting duplicate charge confirmation -> user asks unrelated "where is my package?" -> must classify and NOT route to payment (FAILS on current code due to guard 3c).
//   E: order_tracking WAITING_FOR_USER_INPUT -> pure UUID reply -> continues order_tracking (PASSES).
//   F: Pending identity verification -> pure 6-digit OTP -> routes to account_access (PASSES).

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Mock @google/genai BEFORE any import that transitively loads it
// ---------------------------------------------------------------------------
const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

import { buildParentGraph } from './parent-graph.js';
import type { ConversationState, ConversationStateUpdate } from '../../state/conversation-state.js';

describe('Phase 24: Conversational Routing Regression Suite', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  // -------------------------------------------------------------------------
  // Scenario A
  // -------------------------------------------------------------------------
  it('Scenario A: after completed order_tracking, "what else can you do?" must NOT route to order_tracking', async () => {
    // Turn 1: User asks order status -> classified as order_tracking
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Customer asked about order tracking.',
      }),
    });

    const checkpointer = new MemorySaver();
    const testSpecialists = {
      order_tracking: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage('Your order #11111111-1111-4111-a111-111111111111 is delivered.')],
      }),
      returns: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Returns')] }),
      payment: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Payment')] }),
      refund: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Refund')] }),
      profile: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Profile')] }),
      account_access: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Account')] }),
    };

    const graph = buildParentGraph(checkpointer, { specialists: testSpecialists });
    const threadId = crypto.randomUUID();

    const turn1Result = await graph.invoke(
      { messages: [new HumanMessage('Track order 11111111-1111-4111-a111-111111111111')] },
      { configurable: { thread_id: threadId } }
    );
    expect(turn1Result.routing.currentAgent).toBe('order_tracking');
    expect(turn1Result.workflowStatus).toBe('COMPLETED');

    // Turn 2: User asks capability question "what else can you do?"
    // On current code, classifier prompt maps general queries to order_tracking, and default is order_tracking.
    // In the new architecture, capability/general queries must route to a general assistant, NOT order_tracking.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'GENERAL_INQUIRY',
        confidence: 0.7,
        reasoning: 'User asked about capabilities; default to order_tracking on current taxonomy.',
      }),
    });

    const turn2Result = await graph.invoke(
      { messages: [new HumanMessage('what else can you do?')] },
      { configurable: { thread_id: threadId } }
    );

    // FAILURE EXPECTED on current code:
    // Turn 2 resolves to 'order_tracking'. In the target conversational design, it must NOT route to order_tracking.
    expect(turn2Result.routing.currentAgent).not.toBe('order_tracking');
  });

  // -------------------------------------------------------------------------
  // Scenario B
  // -------------------------------------------------------------------------
  it('Scenario B: order_tracking WAITING_FOR_USER_INPUT -> "change my name to Alice" must route to profile', async () => {
    // Turn 1: User asks vague order question -> order_tracking asks for order ID
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.9,
        reasoning: 'Order inquiry without ID.',
      }),
    });

    const checkpointer = new MemorySaver();
    const testSpecialists = {
      order_tracking: async (state: ConversationState): Promise<ConversationStateUpdate> => {
        // First turn without UUID asks for ID
        return {
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage('Please provide your order ID.')],
        };
      },
      profile: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage('Profile updated.')],
      }),
      returns: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Returns')] }),
      payment: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Payment')] }),
      refund: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Refund')] }),
      account_access: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Account')] }),
    };

    const graph = buildParentGraph(checkpointer, { specialists: testSpecialists });
    const threadId = crypto.randomUUID();

    const turn1Result = await graph.invoke(
      { messages: [new HumanMessage('Where is my package?')] },
      { configurable: { thread_id: threadId } }
    );
    expect(turn1Result.routing.currentAgent).toBe('order_tracking');
    expect(turn1Result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');

    // Turn 2: User switches topic to profile: "change my name to Alice"
    // Mock the classifier to return profile if invoked
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'profile',
        intent: 'UPDATE_PROFILE',
        confidence: 0.95,
        reasoning: 'User explicitly requested to update profile name.',
      }),
    });

    const turn2Result = await graph.invoke(
      { messages: [new HumanMessage('change my name to Alice')] },
      { configurable: { thread_id: threadId } }
    );

    // FAILURE EXPECTED on current code:
    // Sticky guard 3b matches (order_tracking + WAITING_FOR_USER_INPUT) and bypasses classification completely!
    // The classifier is not called (mockGenerateContent has 1 call total, from Turn 1), and currentAgent remains 'order_tracking'.
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(turn2Result.routing.currentAgent).toBe('profile');
  });

  // -------------------------------------------------------------------------
  // Scenario C
  // -------------------------------------------------------------------------
  it('Scenario C: after completed order_tracking, "can I get a refund for this order?" must receive context in classifier', async () => {
    const orderId = '22222222-2222-4222-a222-222222222222';

    // Turn 1: User tracks order
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'Track order.',
      }),
    });

    const checkpointer = new MemorySaver();
    const testSpecialists = {
      order_tracking: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage(`Order ${orderId} is delivered.`)],
      }),
      refund: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage('Refund requested.')],
      }),
      returns: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Returns')] }),
      payment: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Payment')] }),
      profile: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Profile')] }),
      account_access: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Account')] }),
    };

    const graph = buildParentGraph(checkpointer, { specialists: testSpecialists });
    const threadId = crypto.randomUUID();

    await graph.invoke(
      { messages: [new HumanMessage(`Track order ${orderId}`)] },
      { configurable: { thread_id: threadId } }
    );

    // Turn 2: User asks "can I get a refund for this order?"
    // The classifier MUST see context/history to know what "this order" refers to.
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'refund',
        intent: 'REFUND_REQUEST',
        confidence: 0.95,
        reasoning: 'User requests refund for the order discussed.',
      }),
    });

    await graph.invoke(
      { messages: [new HumanMessage('can I get a refund for this order?')] },
      { configurable: { thread_id: threadId } }
    );

    // FAILURE EXPECTED on current code:
    // Current classifier receives ONLY the single raw user string:
    // """can I get a refund for this order?""" without the prior turn or order ID context.
    const lastCall = mockGenerateContent.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const promptArg = lastCall[0]?.contents as string;

    // Must include the prior context / orderId in the classifier prompt
    expect(promptArg).toContain(orderId);
  });

  // -------------------------------------------------------------------------
  // Scenario D
  // -------------------------------------------------------------------------
  it('Scenario D: payment awaiting duplicate-charge confirmation -> unrelated question must NOT be treated as confirmation', async () => {
    // Turn 1: Payment asks for duplicate charge confirmation
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'payment',
        intent: 'DUPLICATE_CHARGE',
        confidence: 0.95,
        reasoning: 'Duplicate charge inquiry.',
      }),
    });

    const checkpointer = new MemorySaver();
    const testSpecialists = {
      payment: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        activeWorkflow: {
          workflowId: null,
          originatingIntent: 'DUPLICATE_CHARGE',
          currentStep: 'await_duplicate_confirmation',
          blockedBy: null,
          returnTo: { agent: 'payment', domain: 'payment' },
          resumeContext: { awaitingDuplicateConfirmation: true },
        },
        messages: [new AIMessage('Did you intend to place both charges? Reply YES or NO.')],
      }),
      order_tracking: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage('Here is your package tracking.')],
      }),
      returns: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Returns')] }),
      refund: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Refund')] }),
      profile: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Profile')] }),
      account_access: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Account')] }),
    };

    const graph = buildParentGraph(checkpointer, { specialists: testSpecialists });
    const threadId = crypto.randomUUID();

    const turn1Result = await graph.invoke(
      { messages: [new HumanMessage('I see two charges on my card')] },
      { configurable: { thread_id: threadId } }
    );
    expect(turn1Result.routing.currentAgent).toBe('payment');
    expect(turn1Result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');

    // Turn 2: User asks an unrelated question instead of confirming
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.95,
        reasoning: 'User asked about package delivery status.',
      }),
    });

    const turn2Result = await graph.invoke(
      { messages: [new HumanMessage('Where is my package?')] },
      { configurable: { thread_id: threadId } }
    );

    // FAILURE EXPECTED on current code:
    // Sticky guard 3c matches (payment + WAITING_FOR_USER_INPUT + awaitingDuplicateConfirmation)
    // and sends the user back to payment without calling the classifier!
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(turn2Result.routing.currentAgent).toBe('order_tracking');
  });

  // -------------------------------------------------------------------------
  // Scenario E (Must KEEP PASSING)
  // -------------------------------------------------------------------------
  it('Scenario E: pure UUID reply while specialist awaits an ID -> continues that specialist', async () => {
    const orderId = '33333333-3333-4333-a333-333333333333';

    // Turn 1: User asks order status without ID -> specialist requests ID
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'order_tracking',
        intent: 'ORDER_STATUS',
        confidence: 0.9,
        reasoning: 'Order inquiry.',
      }),
    });

    const checkpointer = new MemorySaver();
    let turnCount = 0;
    const testSpecialists = {
      order_tracking: async (state: ConversationState): Promise<ConversationStateUpdate> => {
        turnCount++;
        if (turnCount === 1) {
          return {
            workflowStatus: 'WAITING_FOR_USER_INPUT',
            messages: [new AIMessage('Please provide your order ID.')],
          };
        }
        return {
          workflowStatus: 'COMPLETED',
          messages: [new AIMessage(`Order ${orderId} is currently in transit.`)],
        };
      },
      returns: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Returns')] }),
      payment: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Payment')] }),
      refund: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Refund')] }),
      profile: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Profile')] }),
      account_access: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Account')] }),
    };

    const graph = buildParentGraph(checkpointer, { specialists: testSpecialists });
    const threadId = crypto.randomUUID();

    await graph.invoke(
      { messages: [new HumanMessage('Check my order status')] },
      { configurable: { thread_id: threadId } }
    );

    // Turn 2: User provides pure UUID
    const turn2Result = await graph.invoke(
      { messages: [new HumanMessage(orderId)] },
      { configurable: { thread_id: threadId } }
    );

    // Pure UUID payload must continue to order_tracking specialist
    expect(turn2Result.routing.currentAgent).toBe('order_tracking');
    expect(turn2Result.workflowStatus).toBe('COMPLETED');
  });

  // -------------------------------------------------------------------------
  // Scenario F (Must KEEP PASSING)
  // -------------------------------------------------------------------------
  it('Scenario F: pure 6-digit OTP code during pending identity verification -> routes to account_access', async () => {
    const checkpointer = new MemorySaver();
    const testSpecialists = {
      returns: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        activeWorkflow: {
          workflowId: null,
          originatingIntent: 'CREATE_RETURN',
          currentStep: 'verify_identity',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: { agent: 'returns', domain: 'orders' },
          resumeContext: null,
        },
        messages: [new AIMessage('Please enter the 6-digit verification code.')],
      }),
      account_access: async (): Promise<ConversationStateUpdate> => ({
        workflowStatus: 'COMPLETED',
        messages: [new AIMessage('Identity verified successfully.')],
      }),
      order_tracking: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Order')] }),
      payment: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Payment')] }),
      refund: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Refund')] }),
      profile: async () => ({ workflowStatus: 'COMPLETED', messages: [new AIMessage('Profile')] }),
    };

    const graph = buildParentGraph(checkpointer, { specialists: testSpecialists });
    const threadId = crypto.randomUUID();

    // Turn 1: Returns blocks on verification
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        specialist: 'returns',
        intent: 'CREATE_RETURN',
        confidence: 0.95,
        reasoning: 'Return request requiring verification.',
      }),
    });

    const turn1Result = await graph.invoke(
      { messages: [new HumanMessage('I want to return an item')] },
      { configurable: { thread_id: threadId } }
    );
    expect(turn1Result.routing.currentAgent).toBe('returns');
    expect(turn1Result.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');

    // Turn 2: User sends pure 6-digit OTP
    const turn2Result = await graph.invoke(
      { messages: [new HumanMessage('123456')] },
      { configurable: { thread_id: threadId } }
    );

    // Pure 6-digit OTP must route to account_access for verification
    expect(turn2Result.routing.currentAgent).toBe('account_access');
  });
});

