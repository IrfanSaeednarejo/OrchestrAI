// src/agents/specialists/returns/returns.ts
// Phase 9: Returns specialist subgraph.
// Handles Scenario 9 (ineligible return -> RAG explanation -> hard decline),
// return eligibility evaluation, and return creation (FULL-gated).

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
  type ReturnTo,
} from '../../../state/conversation-state.js';
import { generateStructuredOutput } from '../../llm/client.js';
import { loadPrompt } from '../../prompts/template-loader.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import { buildBlockedWorkflowUpdate } from '../../../state/blocked-workflow.js';
import { retrieveKnowledge } from '../../../knowledge/retrieval.js';
import { recordAgentExecution } from '../../../routing/events.js';
import {
  checkReturnEligibility,
  checkReturnEligibilityMetadata,
  createReturn,
  createReturnMetadata,
} from '../../../tools/mutations/return.tools.js';

// ---------------------------------------------------------------------------
// Prompt template (5 required sections)
// ---------------------------------------------------------------------------

export const RETURNS_TEMPLATE = {
  sections: {
    Identity: `You are the Returns specialist for an e-commerce customer support platform.
You handle return eligibility assessments, return requests, and return policies.`,

    Objective: `Assess return eligibility fairly and strictly based on policy.
Assist customers with valid returns and provide grounded policy explanations for ineligible requests.`,

    Scope: `IN SCOPE: check return eligibility, process return requests, explain return policy.
OUT OF SCOPE: order tracking, payment disputes, refunds (handled by refund specialist), profile changes.`,

    'Phased-Workflow': `1. Identify the orderId and customer return reason.
2. Evaluate return eligibility (delivery status and 30-day window).
3. If ineligible, explain the policy clearly based on retrieved knowledge and decline.
4. If eligible, proceed to return creation (requires identity verification).`,

    Guidelines: `- Always enforce the 30-day return policy and delivery requirements.
- Never approve or create a return when the system indicates it is ineligible.
- Use retrieved policy knowledge to explain decisions; never invent exceptions.
- Be polite, empathetic, but clear and firm when declining ineligible returns.`,
  },
};

// ---------------------------------------------------------------------------
// Zod schema for extraction
// ---------------------------------------------------------------------------

const ReturnExtractionSchema = z.object({
  orderId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  intent: z.enum(['create_return', 'check_eligibility', 'check_status']).default('create_return'),
  confidence: z.number().min(0).max(1),
});

export type ReturnExtraction = z.infer<typeof ReturnExtractionSchema>;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

export function extractLastUserText(state: Pick<ConversationState, 'messages'>): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg && msg._getType() === 'human' && typeof msg.content === 'string') {
      return msg.content;
    }
  }
  return '';
}

export async function extractReturnIntent(userText: string): Promise<ReturnExtraction> {
  if (userText.trim().length === 0) {
    return { orderId: null, reason: null, intent: 'create_return', confidence: 0 };
  }

  const uuidMatch = userText.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
  );
  const directOrderId = uuidMatch ? uuidMatch[0].toLowerCase() : null;

  const prompt = `Extract the order ID (a UUID), return reason, and intent from the following customer message.
If no valid UUID is found, set orderId to null.

Customer message: "${userText}"

Respond with JSON:
{
  "orderId": "<uuid or null>",
  "reason": "<customer reason or null>",
  "intent": "create_return" | "check_eligibility" | "check_status",
  "confidence": <0.0-1.0>
}`;

  const result = await generateStructuredOutput(ReturnExtractionSchema, prompt, {
    temperature: 0.0,
  });

  if (result.success) {
    return {
      ...result.data,
      orderId: result.data.orderId || directOrderId,
    };
  }

  return {
    orderId: directOrderId,
    reason: null,
    intent: 'create_return',
    confidence: directOrderId ? 0.8 : 0,
  };
}

export async function generateDeclineResponse(params: {
  reason: string;
  knowledgeContext: string;
  userText: string;
}): Promise<string> {
  const { reason, knowledgeContext, userText } = params;
  const basePrompt = loadPrompt(RETURNS_TEMPLATE, {});

  const reasonExplanations: Record<string, string> = {
    ORDER_NOT_DELIVERED: 'The order has not yet been marked as delivered.',
    RETURN_WINDOW_EXPIRED: 'The 30-day return window from the delivery date has passed.',
    RETURN_ALREADY_EXISTS: 'A return request has already been submitted for this order.',
    ORDER_NOT_FOUND: 'The specified order could not be found.',
  };

  const humanReason = reasonExplanations[reason] ?? reason;

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Ineligibility Reason\n${humanReason} (${reason})\n\n` +
    `## Relevant Return Policy Knowledge\n${knowledgeContext || 'Standard policy: Returns must be initiated within 30 days of delivery.'}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Provide a polite, professional, and definitive decline explaining why the return cannot be accepted ` +
    `referencing our 30-day return policy. Do not make false promises or suggest exceptions.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  // Graceful degradation fallback
  return `I regret to inform you that your return request cannot be processed. Reason: ${humanReason}. Per our policy, items can only be returned within 30 days of delivery once delivered.`;
}

export async function generateReturnSuccessResponse(params: {
  returnId: string;
  knowledgeContext: string;
  userText: string;
}): Promise<string> {
  const { returnId, knowledgeContext, userText } = params;
  const basePrompt = loadPrompt(RETURNS_TEMPLATE, {});

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Return Created\nReturn ID: ${returnId}\nStatus: requested\n\n` +
    `## Relevant Return Instructions Knowledge\n${knowledgeContext || 'Package items securely with the return label.'}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Confirm that the return request has been submitted successfully and provide next steps for packaging and drop-off.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  return `Your return request has been submitted successfully (Return reference: ${returnId}). Please follow the return instructions sent to your email to send the item back.`;
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'returns'
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
// Main Returns Node
// ---------------------------------------------------------------------------

export async function returnsNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate> {
  const specialist = 'returns' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);

  // 1. Resolve orderId & reason (check resumeContext first, then LLM extraction)
  let orderId: string | null = null;
  let reason: string | null = null;

  if (
    state.activeWorkflow?.returnTo?.agent === specialist &&
    state.activeWorkflow.resumeContext &&
    typeof state.activeWorkflow.resumeContext['orderId'] === 'string'
  ) {
    orderId = state.activeWorkflow.resumeContext['orderId'];
    if (typeof state.activeWorkflow.resumeContext['reason'] === 'string') {
      reason = state.activeWorkflow.resumeContext['reason'];
    }
  }

  const userText = extractLastUserText(state);

  if (!orderId) {
    const extraction = await extractReturnIntent(userText);
    orderId = extraction.orderId;
    reason = extraction.reason;
  }

  if (!orderId) {
    return {
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          "I'd be glad to help you with your return. Could you please provide your order ID? " +
            'You can find it in your order confirmation email.'
        ),
      ],
    };
  }

  // 2. Check return eligibility
  const eligibilityResult = await gatedExecuteTool(
    checkReturnEligibility,
    checkReturnEligibilityMetadata,
    { orderId },
    {
      agentExecutionId,
      specialist,
      identity: state.identity,
    }
  );

  if (eligibilityResult.gate.outcome === 'BLOCKED') {
    const returnTo: ReturnTo = {
      domain: specialist,
      agent: specialist,
      workflowStep: 'check_return_eligibility',
    };
    const blockedUpdate = buildBlockedWorkflowUpdate({
      decision: eligibilityResult.gate,
      returnTo,
      workflowId: null,
      originatingIntent: state.currentIntent,
      currentStep: 'check_return_eligibility',
      resumeContext: { orderId, reason },
    });
    return {
      ...blockedUpdate,
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          'To check return eligibility, please log in to your account or confirm your identity.'
        ),
      ],
    };
  }

  if (eligibilityResult.gate.outcome === 'DENIED') {
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage('I am unable to check return eligibility for this order.')],
    };
  }

  if (!eligibilityResult.success) {
    const isOrderNotFound = eligibilityResult.error.code === 'ORDER_NOT_FOUND';
    if (isOrderNotFound) {
      return {
        workflowStatus: 'FAILED',
        messages: [
          new AIMessage(
            "I couldn't find an order matching that ID. Please check the order number and try again."
          ),
        ],
      };
    }

    return {
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage(
          'I encountered repeated technical issues checking return eligibility. I am escalating your request to human customer support for assistance.'
        ),
      ],
    };
  }

  const eligibility = eligibilityResult.data;

  // 3. Scenario 9: Ineligible return -> RAG lookup -> hard decline -> COMPLETED
  if (!eligibility.eligible) {
    const ineligibilityReason = eligibility.reason ?? 'UNKNOWN_REASON';

    const knowledgeResult = await retrieveKnowledge({
      query: `return policy ${ineligibilityReason} 30 days window delivery`,
      domains: ['orders'],
      topics: ['returns'],
      topK: 3,
    });

    const knowledgeContext =
      knowledgeResult.success && knowledgeResult.data.length > 0
        ? knowledgeResult.data.map((h) => h.content).join('\n\n')
        : '';

    const declineResponse = await generateDeclineResponse({
      reason: ineligibilityReason,
      knowledgeContext,
      userText,
    });

    return {
      workflowStatus: 'COMPLETED',
      activeWorkflow: null, // Clear any pending workflow
      messages: [new AIMessage(declineResponse)],
    };
  }

  // 4. Eligible: Attempt create_return (requires FULL verification)
  const returnReason = reason && reason.trim().length > 0 ? reason : 'Customer requested return';

  const createResult = await gatedExecuteTool(
    createReturn,
    createReturnMetadata,
    { orderId, reason: returnReason },
    {
      agentExecutionId,
      specialist,
      identity: state.identity,
    }
  );

  if (createResult.gate.outcome === 'BLOCKED') {
    // Pattern C: Gate blocked due to insufficient verification (needs FULL)
    const returnTo: ReturnTo = {
      domain: specialist,
      agent: specialist,
      workflowStep: 'create_return',
    };
    const blockedUpdate = buildBlockedWorkflowUpdate({
      decision: createResult.gate,
      returnTo,
      workflowId: null,
      originatingIntent: state.currentIntent,
      currentStep: 'create_return',
      resumeContext: { orderId, reason: returnReason },
    });
    return {
      ...blockedUpdate,
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          'Your order is eligible for return! To submit the return request, we need to verify your identity. ' +
            'Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
        ),
      ],
    };
  }

  if (createResult.gate.outcome === 'DENIED') {
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage('I am not permitted to create a return.')],
    };
  }

  if (!createResult.success) {
    return {
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage(
          `I encountered a technical issue creating your return: ${createResult.error.message || 'unknown error'}. I am escalating your request to human customer support for assistance.`
        ),
      ],
    };
  }

  // Success path: return created
  const knowledgeResult = await retrieveKnowledge({
    query: 'return packaging shipping instructions label',
    domains: ['orders'],
    topics: ['returns'],
    topK: 3,
  });

  const knowledgeContext =
    knowledgeResult.success && knowledgeResult.data.length > 0
      ? knowledgeResult.data.map((h) => h.content).join('\n\n')
      : '';

  const responseText = await generateReturnSuccessResponse({
    returnId: createResult.data.id,
    knowledgeContext,
    userText,
  });

  return {
    workflowStatus: 'COMPLETED',
    activeWorkflow: null,
    messages: [new AIMessage(responseText)],
  };
}

// ---------------------------------------------------------------------------
// Subgraph factory
// ---------------------------------------------------------------------------

export function buildReturnsSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('returns_node', returnsNode)
    .addEdge(START, 'returns_node')
    .addEdge('returns_node', END);

  return workflow.compile({ checkpointer });
}
