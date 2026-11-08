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

  // 2. Guard check: RESUME active workflow
  if (guardOutcome.outcome === 'RESUME') {
    if (isRoutingLoop(state.routing, guardOutcome.targetSpecialist)) {
      const loopEvent: RoutingEvent = {
        conversationId,
        sourceAgent: state.routing.currentAgent,
        destinationAgent: 'escalation',
        intent: state.currentIntent,
        decisionType: 'ESCALATION',
        reason: `Loop detected while resuming to '${guardOutcome.targetSpecialist}'.`,
      };
      const routingUpdate = await logRoutingEventSafely(loopEvent);
      return {
        ...routingUpdate,
        workflowStatus: 'ESCALATED',
        messages: [
          new AIMessage('I detected repeated routing issues and am connecting you with a supervisor.'),
        ],
      };
    }

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
    return {
      ...routingUpdate,
      currentIntent: 'GREETING',
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          "Hello! I am OrchestrAI's autonomous customer support assistant. " +
            'I can help you with tracking orders, processing returns, managing payments and refunds, ' +
            'updating your profile, or account security issues. How can I assist you today?'
        ),
      ],
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

