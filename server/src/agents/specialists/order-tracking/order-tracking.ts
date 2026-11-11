// src/agents/specialists/order-tracking/order-tracking.ts
// Phase 9: Order Tracking specialist subgraph.
// Handles Scenarios 1 (simple order status) and 2 (ambiguous order reference).
//
// Phased workflow (all in one node — state has no "extracted args" field):
//   Phase A: Extract orderId from last user message via LLM (temp 0.0).
//            If none found → WAITING_FOR_USER_INPUT with clarification.
//   Phase B: Call get_order then get_shipment_status via gatedExecuteTool.
//            LIGHT verification required. BLOCKED → Pattern C.
//   Phase C: Retrieve grounded knowledge (orders/shipping), generate LLM
//            customer-facing response (temp 0.2).

import crypto from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import {
  StateGraph,
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
} from '../../../state/conversation-state.js';
import { generateStructuredOutput } from '../../llm/client.js';
import { loadPrompt } from '../../prompts/template-loader.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import { createBlockedResponse } from '../../../state/blocked-workflow.js';
import { retrieveKnowledge } from '../../../knowledge/retrieval.js';
import { recordAgentExecution } from '../../../routing/events.js';
import {
  getOrder,
  getOrderMetadata,
  getShipmentStatus,
  getShipmentStatusMetadata,
  type GetOrderOutput,
  type GetShipmentStatusOutput,
} from '../../../tools/queries/order.tools.js';

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

export const ORDER_TRACKING_TEMPLATE = {
  sections: {
    Identity: `You are the Order Tracking specialist for an e-commerce customer support platform.
You have read-only access to order status and shipment information.`,

    Objective: `Provide customers with accurate, grounded information about their order status
and shipment tracking. Never invent or guess order details.`,

    Scope: `IN SCOPE: order status (pending/paid/shipped/delivered/cancelled/returned),
shipment carrier, tracking number, estimated delivery date.
OUT OF SCOPE: returns, refunds, payments, account changes — hand those to the appropriate specialist.`,

    'Phased-Workflow': `1. Identify the orderId from the conversation context.
2. Retrieve order and shipment data from the system.
3. Ground your response in retrieved shipping policy knowledge.
4. Respond clearly: status, tracking details, and next steps if applicable.`,

    Guidelines: `- Never answer from memory when tool results are available.
- If order not found, apologise and ask the customer to verify the order reference.
- Keep responses concise and customer-friendly.
- Do not expose internal IDs or technical error codes to the customer.`,
  },
};

// ---------------------------------------------------------------------------
// Zod schema for LLM orderId extraction
// ---------------------------------------------------------------------------

const OrderIdExtractionSchema = z.object({
  orderId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
});

type OrderIdExtraction = z.infer<typeof OrderIdExtractionSchema>;

// ---------------------------------------------------------------------------
// Private helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Extracts the last user message text from state.
 * Returns empty string if none found.
 */
export function extractLastUserText(state: Pick<ConversationState, 'messages'>): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg && msg._getType() === 'human' && typeof msg.content === 'string') {
      return msg.content;
    }
  }
  return '';
}

/**
 * Calls LLM to extract a UUID orderId from raw user text.
 * Returns null if no confident UUID is found.
 * Never throws — returns null on any error.
 */
export async function extractOrderId(
  userText: string
): Promise<OrderIdExtraction> {
  if (userText.trim().length === 0) {
    return { orderId: null, confidence: 0 };
  }

  // Fast path: deterministic UUID regex extraction
  const uuidMatch = userText.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
  );
  if (uuidMatch) {
    return { orderId: uuidMatch[0].toLowerCase(), confidence: 1.0 };
  }

  const prompt = `Extract the order ID (a UUID) from the following customer message.
If a valid UUID order ID is present, return it. If not found or unclear, return null.

Customer message: "${userText}"

Respond with JSON: { "orderId": "<uuid or null>", "confidence": <0.0-1.0> }`;

  const result = await generateStructuredOutput(OrderIdExtractionSchema, prompt, {
    temperature: 0.0,
  });

  if (result.success) {
    return result.data;
  }

  return { orderId: null, confidence: 0 };
}

/**
 * Builds a grounded customer-facing response using retrieved knowledge and tool data.
 * Falls back to a plain-text summary if LLM call fails.
 */
export async function generateOrderResponse(params: {
  order: GetOrderOutput;
  shipment: GetShipmentStatusOutput | null;
  knowledgeContext: string;
  userText: string;
}): Promise<string> {
  const { order, shipment, knowledgeContext, userText } = params;

  const basePrompt = loadPrompt(ORDER_TRACKING_TEMPLATE, {});

  const shipmentSummary = shipment
    ? `Shipment status: ${shipment.status}. Carrier: ${shipment.carrier ?? 'unknown'}. ` +
      `Tracking: ${shipment.trackingNumber ?? 'not yet assigned'}. ` +
      `Estimated delivery: ${shipment.estimatedDelivery?.toISOString().split('T')[0] ?? 'unknown'}.`
    : 'No shipment record found yet.';

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Order Data\nOrder status: ${order.status}. Total: ${order.totalAmount}.\n\n` +
    `## Shipment Data\n${shipmentSummary}\n\n` +
    `## Relevant Policy Knowledge\n${knowledgeContext || 'No additional policy context available.'}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Respond helpfully to the customer based on the data above. ` +
    `Do not reveal raw IDs or technical codes. Keep it concise.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  // Graceful degradation — assemble a plain-text fallback
  return (
    `Your order is currently: ${order.status}. ` +
    (shipment
      ? `Shipment status: ${shipment.status}.` + (shipment.trackingNumber ? ` Tracking: ${shipment.trackingNumber}.` : '')
      : 'No shipment information is available yet.')
  );
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'order_tracking'
): Promise<string> {
  if (typeof conversationId === 'string' && conversationId.length > 0) {
    try {
      const record = await recordAgentExecution({
        conversationId,
        agent,
        status: 'success',
      });
      return record.id;
    } catch {
      return crypto.randomUUID();
    }
  }
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Main specialist node
// ---------------------------------------------------------------------------

export async function orderTrackingNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate> {
  const specialist = 'order_tracking' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);

  // ── Phase A: Extract orderId ─────────────────────────────────────────────
  const userText = extractLastUserText(state);
  const extraction = await extractOrderId(userText);
  const resumeOrderId =
    state.activeWorkflow?.returnTo?.agent === specialist &&
    state.activeWorkflow?.resumeContext &&
    typeof state.activeWorkflow.resumeContext['orderId'] === 'string'
      ? state.activeWorkflow.resumeContext['orderId']
      : undefined;

  const orderId = extraction.orderId || resumeOrderId;

  if (!orderId) {
    return {
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      pendingTask: {
        specialist,
        awaitingField: 'orderId',
      },
      messages: [
        new AIMessage(
          "I'd be happy to help track your order. Could you please provide your order ID? " +
            'It should be in your confirmation email as a series of letters and numbers.'
        ),
      ],
    };
  }

  // ── Phase B: Fetch order via gated tool ─────────────────────────────────
  const callerUserId = typeof state.user?.id === 'string' ? state.user.id : undefined;
  const orderResult = await gatedExecuteTool(
    getOrder,
    getOrderMetadata,
    { orderId, userId: callerUserId },
    {
      agentExecutionId,
      specialist,
      identity: state.identity,
    }
  );

  if (orderResult.gate.outcome === 'BLOCKED') {
    const returnTo = {
      domain: specialist,
      agent: specialist,
      workflowStep: 'get_order',
    };
    return createBlockedResponse(
      {
        decision: orderResult.gate,
        returnTo,
        workflowId: null,
        originatingIntent: state.currentIntent,
        currentStep: 'get_order',
        resumeContext: { orderId },
      },
      'To view order and tracking details, please log in to your account or confirm your identity.'
    );
  }

  if (orderResult.gate.outcome === 'DENIED') {
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage('I am unable to access that order information.')],
    };
  }

  // gate.outcome === 'ALLOWED' — check tool result
  if (!orderResult.success) {
    const isNotFound = orderResult.error.code === 'NOT_FOUND';
    if (isNotFound) {
      return {
        workflowStatus: 'FAILED',
        messages: [
          new AIMessage(
            "I couldn't find an order with that ID. Please double-check the order reference in your confirmation email."
          ),
        ],
      };
    }

    return {
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage(
          'I encountered repeated technical issues retrieving your order details. I am escalating your request to human customer support for assistance.'
        ),
      ],
    };
  }

  const order = orderResult.data;

  // ── Fetch shipment (best-effort, non-gated read after order access cleared) ──
  const shipmentResult = await gatedExecuteTool(
    getShipmentStatus,
    getShipmentStatusMetadata,
    { orderId },
    { agentExecutionId, specialist, identity: state.identity }
  );

  const shipment =
    shipmentResult.gate.outcome === 'ALLOWED' && shipmentResult.success
      ? shipmentResult.data
      : null;

  // ── Phase C: Retrieve knowledge + generate response ──────────────────────
  const knowledgeResult = await retrieveKnowledge({
    query: userText || 'order status shipping tracking',
    domains: ['orders'],
    topics: ['shipping'],
    topK: 3,
  });

  const knowledgeContext =
    knowledgeResult.success && knowledgeResult.data.length > 0
      ? knowledgeResult.data.map((h) => h.content).join('\n\n')
      : '';

  const responseText = await generateOrderResponse({
    order,
    shipment,
    knowledgeContext,
    userText,
  });

  return {
    workflowStatus: 'COMPLETED',
    activeWorkflow: null,
    pendingTask: null,
    lastKnownEntities: {
      orderId,
    },
    messages: [new AIMessage(responseText)],
  };
}

// ---------------------------------------------------------------------------
// Subgraph factory
// ---------------------------------------------------------------------------

export function buildOrderTrackingSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('order_tracking_node', orderTrackingNode)
    .addEdge(START, 'order_tracking_node')
    .addEdge('order_tracking_node', END);

  return workflow.compile({ checkpointer });
}
