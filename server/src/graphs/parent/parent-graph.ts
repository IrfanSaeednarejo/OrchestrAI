// src/graphs/parent/parent-graph.ts
// Phase 8: Master orchestrator parent graph and stateful router.
// Coordinates customer conversation routing, deterministic safety guards,
// LLM intent classification, and dynamic Command(goto) specialist dispatch.

import crypto from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import {
  StateGraph,
  Command,
  START,
  END,
  type BaseCheckpointSaver,
} from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import {
  ConversationStateAnnotation,
  type ConversationState,
  type ConversationStateUpdate,
} from '../../state/conversation-state.js';
import {
  evaluatePreClassificationGuards,
  isRoutingLoop,
} from '../../routing/guards.js';
import { classifyMessage } from '../../routing/classifier/classifier.js';
import { isGreetingMessage } from '../../routing/classifier/taxonomy.js';
import { generateStructuredOutput } from '../../agents/llm/client.js';
import {
  recordRoutingEvent,
  toRoutingStateUpdate,
  type RoutingEvent,
} from '../../routing/events.js';
import { SPECIALIST_STUBS } from '../../agents/specialists/stubs.js';
import { orderTrackingNode } from '../../agents/specialists/order-tracking/order-tracking.js';
import { returnsNode } from '../../agents/specialists/returns/returns.js';
import { paymentNode } from '../../agents/specialists/payment/payment.js';
import { refundNode } from '../../agents/specialists/refund/refund.js';
import { profileNode } from '../../agents/specialists/profile/profile.js';
import { accountAccessNode } from '../../agents/specialists/account-access/account-access.js';
import type { SpecialistId } from '../../tools/permissions.js';

// ---------------------------------------------------------------------------
// Service options type (embedded in AIMessage.additional_kwargs for transport)
// ---------------------------------------------------------------------------

export interface ServiceOption {
  label: string;
  message: string;
}

/** Zod schema for the LLM-generated greeting + service options. */
const GreetingResponseSchema = z.object({
  greeting: z.string().min(1),
  options: z.array(
    z.object({
      label: z.string().min(1),
      message: z.string().min(1),
    })
  ),
});

/** Default service options shown when LLM generation fails. */
const DEFAULT_SERVICE_OPTIONS: ServiceOption[] = [
  { label: 'Track an Order', message: 'I need to track my order' },
  { label: 'Request a Return', message: 'I would like to request a return' },
  { label: 'Request a Refund', message: 'I need help with a refund' },
  { label: 'Manage Payments', message: 'I have a question about a payment' },
  { label: 'Update Profile', message: 'I need to update my profile' },
  { label: 'Account Security', message: 'I need help with my account or password' },
];

/** Fallback static greeting used when LLM call fails. */
const FALLBACK_GREETING =
  "Hi! How can I help you today? Please choose from one of the options below or type your question.";

/**
 * Generates a short, natural greeting and a set of interactive service options
 * via the LLM. Falls back to static defaults if the LLM call fails.
 */
async function generateGreetingResponse(userText: string): Promise<{
  greeting: string;
  options: ServiceOption[];
}> {
  const prompt =
    `You are a friendly customer support assistant for an e-commerce platform.\n` +
    `The customer just said: "${userText}"\n\n` +
    `Respond with a brief, warm greeting (1–2 sentences max) and provide exactly 6 service options ` +
    `the customer can choose from. Keep the greeting natural and conversational — do NOT list all ` +
    `services in the greeting text; the options array handles that.\n\n` +
    `Respond with JSON:\n` +
    `{\n` +
    `  "greeting": "<1-2 sentence greeting>",\n` +
    `  "options": [\n` +
    `    { "label": "Track an Order", "message": "I need to track my order" },\n` +
    `    { "label": "Request a Return", "message": "I would like to request a return" },\n` +
    `    { "label": "Request a Refund", "message": "I need help with a refund" },\n` +
    `    { "label": "Manage Payments", "message": "I have a question about a payment" },\n` +
    `    { "label": "Update Profile", "message": "I need to update my profile" },\n` +
    `    { "label": "Account Security", "message": "I need help with my account or password" }\n` +
    `  ]\n` +
    `}`;

  const result = await generateStructuredOutput(GreetingResponseSchema, prompt, {
    temperature: 0.2,
  });

  if (result.success) {
    return { greeting: result.data.greeting, options: result.data.options };
  }

  return { greeting: FALLBACK_GREETING, options: DEFAULT_SERVICE_OPTIONS };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractConversationId(config?: RunnableConfig): string {
  const configurable = config?.configurable;
  if (typeof configurable === 'object' && configurable !== null) {
    const convId = configurable['conversationId'];
    if (typeof convId === 'string' && convId.length > 0) {
      return convId;
    }
    const threadId = configurable['thread_id'];
    if (typeof threadId === 'string' && threadId.length > 0) {
      return threadId;
    }
  }
  return crypto.randomUUID();
}

function extractLastUserMessage(state: ConversationState): string {
  if (state.messages.length === 0) {
    return '';
  }
  const last = state.messages[state.messages.length - 1];
  return typeof last?.content === 'string' ? last.content : '';
}

async function logRoutingEventSafely(
  event: RoutingEvent
): Promise<ConversationStateUpdate> {
  try {
    return await recordRoutingEvent(event);
  } catch {
    // If DB logging fails (e.g. fast in-memory unit tests without DB fixtures),
    // compute the exact pure state update without halting execution.
    return toRoutingStateUpdate(event);
  }
}

// ---------------------------------------------------------------------------
// Router Node
// ---------------------------------------------------------------------------

export async function routerNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate | Command> {
  const conversationId = extractConversationId(config);
  const guardOutcome = evaluatePreClassificationGuards(state);

  // 1. Guard check: ESCALATE
  if (guardOutcome.outcome === 'ESCALATE') {
    const routingEvent: RoutingEvent = {
      conversationId,
      sourceAgent: state.routing.currentAgent,
      destinationAgent: 'escalation',
      intent: state.currentIntent,
      decisionType: 'ESCALATION',
      reason: guardOutcome.reason,
    };

    const routingUpdate = await logRoutingEventSafely(routingEvent);
    return {
      ...routingUpdate,
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage(
          'I am connecting you with a human specialist who can assist further with your request.'
        ),
      ],
    };
  }

  // 2. Guard check: RESUME active workflow (exempt from loop detection, OD-24c)
  if (guardOutcome.outcome === 'RESUME') {
    const routingEvent: RoutingEvent = {
      conversationId,
      sourceAgent: state.routing.currentAgent,
      destinationAgent: guardOutcome.targetSpecialist,
      intent: state.currentIntent,
      decisionType: 'RE_ROUTE',
      reason: guardOutcome.reason,
      newDomain: guardOutcome.returnTo.domain,
    };

    const routingUpdate = await logRoutingEventSafely(routingEvent);
    return new Command({
      goto: guardOutcome.targetSpecialist,
      update: {
        ...routingUpdate,
        workflowStatus: 'ACTIVE',
      },
    });
  }

  // 3. PROCEED: Classify user message via LLM or greeting check
  const userText = extractLastUserMessage(state);
  let targetSpecialist: SpecialistId = 'order_tracking';
  let detectedIntent = 'GENERAL_INQUIRY';
  let routingReason = 'Initial default routing';
  let isFallback = false;

  const uuidOnlyMatch = userText.trim().match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );

  if (isGreetingMessage(userText)) {
    detectedIntent = 'GREETING';
    routingReason = 'Customer greeting and general triage';
  } else if (
    // 3a. Sticky verification guard: when active workflow is awaiting identity verification,
    // route directly to account_access without invoking LLM classification.
    state.activeWorkflow?.currentStep === 'verify_identity' &&
    state.activeWorkflow?.blockedBy !== null &&
    state.activeWorkflow?.blockedBy !== undefined
  ) {
    targetSpecialist = 'account_access';
    detectedIntent = 'ACCOUNT_SECURITY';
    routingReason = 'Sticky routing to account_access for pending identity verification';
  } else if (
    // 3b. Order tracking continuation guard: when specialist is awaiting an order ID,
    // route back directly without re-classifying through the LLM.
    state.routing.currentAgent === 'order_tracking' &&
    state.workflowStatus === 'WAITING_FOR_USER_INPUT'
  ) {
    targetSpecialist = 'order_tracking';
    detectedIntent = state.currentIntent ?? 'ORDER_STATUS';
    routingReason = 'Continuing order ID collection for active order_tracking session';
  } else if (
    // 3c. Duplicate charge confirmation guard: when payment specialist is awaiting confirmation,
    // route back directly to payment without re-classifying through the LLM.
    state.routing.currentAgent === 'payment' &&
    state.workflowStatus === 'WAITING_FOR_USER_INPUT' &&
    state.activeWorkflow?.resumeContext?.['awaitingDuplicateConfirmation'] === true
  ) {
    targetSpecialist = 'payment';
    detectedIntent = 'DUPLICATE_CHARGE';
    routingReason = 'Continuing duplicate charge confirmation for active payment session';
  } else if (
    uuidOnlyMatch &&
    state.routing.currentAgent &&
    state.routing.currentAgent !== 'router' &&
    state.routing.currentAgent !== 'escalation'
  ) {
    // Pure UUID follow-up message provided to an active specialist
    targetSpecialist = state.routing.currentAgent as SpecialistId;
    detectedIntent = state.currentIntent ?? 'ORDER_STATUS';
    routingReason = `Follow-up UUID reference provided for active specialist ${state.routing.currentAgent}`;
  } else if (userText.trim().length > 0) {
    const classification = await classifyMessage(userText, {
      currentDomain: state.currentDomain,
      previousAgent: state.routing.previousAgent,
    });

    if (classification.success) {
      targetSpecialist = classification.data.specialist;
      detectedIntent = classification.data.intent;
      routingReason = classification.data.reasoning;
    } else {
      isFallback = true;
      routingReason = `Classifier fallback: ${classification.error.message}`;
    }
  }

  // 3b. Interactive greeting: respond directly from supervisor without forcing specialist dispatch
  if (detectedIntent === 'GREETING') {
    const routingEvent: RoutingEvent = {
      conversationId,
      sourceAgent: state.routing.currentAgent,
      destinationAgent: 'router',
      intent: 'GREETING',
      decisionType: 'INITIAL_ROUTE',
      reason: routingReason,
    };

    const routingUpdate = await logRoutingEventSafely(routingEvent);

    // Generate a natural, short LLM greeting with interactive service options.
    const { greeting, options } = await generateGreetingResponse(userText);

    // Encode options in additional_kwargs so the message controller can read them
    // from the final state snapshot and forward them to the SSE routing event.
    const greetingMessage = new AIMessage({
      content: greeting,
      additional_kwargs: { options },
    });

    return {
      ...routingUpdate,
      currentIntent: 'GREETING',
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [greetingMessage],
    };
  }

  // 4. Guard check: Loop detection on proposed target
  if (isRoutingLoop(state.routing, targetSpecialist)) {
    const loopEvent: RoutingEvent = {
      conversationId,
      sourceAgent: state.routing.currentAgent,
      destinationAgent: 'escalation',
      intent: detectedIntent,
      decisionType: 'ESCALATION',
      reason: `Routing loop detected for specialist '${targetSpecialist}'. Escalating.`,
    };
    const routingUpdate = await logRoutingEventSafely(loopEvent);
    return {
      ...routingUpdate,
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage('I am escalating your request to human customer support to resolve this issue.'),
      ],
    };
  }

  // 5. Normal route dispatch
  const isInitialRoute = state.routing.currentAgent === null || state.routing.currentAgent === 'router';
  const isHandoff = !isInitialRoute && state.routing.currentAgent !== targetSpecialist;
  const decisionType = isFallback
    ? 'FALLBACK'
    : isHandoff
      ? 'HANDOFF'
      : 'INITIAL_ROUTE';

  const routingEvent: RoutingEvent = {
    conversationId,
    sourceAgent: state.routing.currentAgent,
    destinationAgent: targetSpecialist,
    intent: detectedIntent,
    decisionType,
    reason: routingReason,
    newDomain: targetSpecialist,
  };

  const routingUpdate = await logRoutingEventSafely(routingEvent);

  return new Command({
    goto: targetSpecialist,
    update: routingUpdate,
  });
}

// ---------------------------------------------------------------------------
// Parent Graph Factory
// ---------------------------------------------------------------------------

export const SPECIALIST_NODE_NAMES = [
  'order_tracking',
  'returns',
  'payment',
  'refund',
  'profile',
  'account_access',
] as const;

export type SpecialistNodeAction = (
  state: ConversationState,
  config?: RunnableConfig
) => Promise<ConversationStateUpdate | Command>;

function hasStubOverride(specialistId: SpecialistId, config?: RunnableConfig): boolean {
  const configurable = config?.configurable;
  if (typeof configurable !== 'object' || configurable === null) return false;
  if (configurable['useStubs'] === true) return true;
  const overrides = configurable['stubBehaviors'];
  if (typeof overrides === 'object' && overrides !== null && specialistId in overrides) {
    return true;
  }
  return 'stubBehavior' in configurable;
}

export const orderTrackingSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('order_tracking', config)) {
    return SPECIALIST_STUBS.order_tracking(state, config);
  }
  return orderTrackingNode(state, config);
};

export const returnsSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('returns', config)) {
    return SPECIALIST_STUBS.returns(state, config);
  }
  return returnsNode(state, config);
};

export const paymentSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('payment', config)) {
    return SPECIALIST_STUBS.payment(state, config);
  }
  return paymentNode(state, config);
};

export const refundSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('refund', config)) {
    return SPECIALIST_STUBS.refund(state, config);
  }
  return refundNode(state, config);
};

export const profileSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('profile', config)) {
    return SPECIALIST_STUBS.profile(state, config);
  }
  return profileNode(state, config);
};

export const accountAccessSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('account_access', config)) {
    return SPECIALIST_STUBS.account_access(state, config);
  }
  return accountAccessNode(state, config);
};

export interface ParentGraphOptions {
  specialists?: Partial<Record<SpecialistId, SpecialistNodeAction>>;
}

export function buildParentGraph(
  checkpointer?: BaseCheckpointSaver,
  options?: ParentGraphOptions
) {
  const specialistNodes: Record<SpecialistId, SpecialistNodeAction> = {
    order_tracking: options?.specialists?.order_tracking ?? orderTrackingSpecialistNode,
    returns: options?.specialists?.returns ?? returnsSpecialistNode,
    payment: options?.specialists?.payment ?? paymentSpecialistNode,
    refund: options?.specialists?.refund ?? refundSpecialistNode,
    profile: options?.specialists?.profile ?? profileSpecialistNode,
    account_access: options?.specialists?.account_access ?? accountAccessSpecialistNode,
  };

  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('router', routerNode, {
      ends: [...SPECIALIST_NODE_NAMES, END],
    })
    .addNode('order_tracking', specialistNodes.order_tracking, {
      ends: ['router', END],
    })
    .addNode('returns', specialistNodes.returns, {
      ends: ['router', END],
    })
    .addNode('payment', specialistNodes.payment, {
      ends: ['router', END],
    })
    .addNode('refund', specialistNodes.refund, {
      ends: ['router', END],
    })
    .addNode('profile', specialistNodes.profile, {
      ends: ['router', END],
    })
    .addNode('account_access', specialistNodes.account_access, {
      ends: ['router', END],
    })
    .addEdge(START, 'router')
    .addEdge('order_tracking', END)
    .addEdge('returns', END)
    .addEdge('payment', END)
    .addEdge('refund', END)
    .addEdge('profile', END)
    .addEdge('account_access', END);

  return workflow.compile({ checkpointer });
}

