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
import {
  recordRoutingEvent,
  toRoutingStateUpdate,
  type RoutingEvent,
} from '../../routing/events.js';
import { SPECIALIST_STUBS } from '../../agents/specialists/stubs.js';
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

  // 3. PROCEED: Classify user message via LLM
  const userText = extractLastUserMessage(state);
  let targetSpecialist: SpecialistId = 'order_tracking';
  let detectedIntent = 'GENERAL_INQUIRY';
  let routingReason = 'Initial default routing';

  if (userText.trim().length > 0) {
    const classification = await classifyMessage(userText, {
      currentDomain: state.currentDomain,
      previousAgent: state.routing.previousAgent,
    });

    if (classification.success) {
      targetSpecialist = classification.data.specialist;
      detectedIntent = classification.data.intent;
      routingReason = classification.data.reasoning;
    } else {
      routingReason = `Classifier fallback: ${classification.error.message}`;
    }
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
  const isInitialRoute = state.routing.currentAgent === null;
  const routingEvent: RoutingEvent = {
    conversationId,
    sourceAgent: state.routing.currentAgent,
    destinationAgent: targetSpecialist,
    intent: detectedIntent,
    decisionType: isInitialRoute ? 'INITIAL_ROUTE' : 'HANDOFF',
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

export function buildParentGraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('router', routerNode, {
      ends: [...SPECIALIST_NODE_NAMES, END],
    })
    .addNode('order_tracking', SPECIALIST_STUBS.order_tracking, {
      ends: ['router', END],
    })
    .addNode('returns', SPECIALIST_STUBS.returns, {
      ends: ['router', END],
    })
    .addNode('payment', SPECIALIST_STUBS.payment, {
      ends: ['router', END],
    })
    .addNode('refund', SPECIALIST_STUBS.refund, {
      ends: ['router', END],
    })
    .addNode('profile', SPECIALIST_STUBS.profile, {
      ends: ['router', END],
    })
    .addNode('account_access', SPECIALIST_STUBS.account_access, {
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

