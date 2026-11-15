// src/agents/specialists/refund/refund.ts
// Phase 10: Refund specialist subgraph.
// Handles refund inquiries, checks return status, processes authorized refunds
// (duplicate charges with returnId: null, and approved returns), and triggers Pattern B
// lateral handoffs to Returns when no return exists for a requested refund.

import crypto from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import {
  StateGraph,
  START,
  END,
  Command,
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
import { createBlockedResponse } from '../../../state/blocked-workflow.js';
import { retrieveKnowledge } from '../../../knowledge/retrieval.js';
import { recordAgentExecution } from '../../../routing/events.js';
import {
  createRefund,
  createRefundMetadata,
  type CreateRefundOutput,
} from '../../../tools/mutations/refund.tools.js';
import {
  getRefundStatus,
  getRefundStatusMetadata,
  getPayment,
  getPaymentMetadata,
} from '../../../tools/queries/payment.tools.js';
import {
  getReturnByOrder,
  getReturnByOrderMetadata,
  type GetReturnByOrderOutput,
} from '../../../tools/queries/return.tools.js';

// ---------------------------------------------------------------------------
// Prompt template (5 required sections)
// ---------------------------------------------------------------------------

export const REFUND_TEMPLATE = {
  sections: {
    Identity: `You are the Refund specialist for an e-commerce customer support platform.
You handle refund status checks, refund processing, and return-linked refund inquiries.`,

    Objective: `Ensure customers receive timely, accurate assistance with refund requests and status updates.
Execute authorized refunds strictly in accordance with policy and verify return linkage where required.`,

    Scope: `IN SCOPE: processing refunds for approved returns, processing duplicate charge refunds, checking refund status.
OUT OF SCOPE: evaluating return eligibility from scratch (handled by Returns specialist), shipping tracking, profile updates.`,

    'Phased-Workflow': `1. Check for incoming handoff context (e.g. duplicate charge refund).
2. For return-linked refunds, verify an approved return exists via system tools.
3. If no return exists, hand off to the Returns specialist.
4. When authorized, execute the refund creation.
5. Ground all customer explanations in refund policy knowledge.`,

    Guidelines: `- Never invent refund numbers or issue refunds without verifying payment and return conditions.
- If a return has not been initiated, direct or hand off the customer to the Returns team.
- For confirmed duplicate charges, process the refund promptly with returnId set to null.
- Maintain a polite, empathetic, and professional tone.`,
  },
};

// ---------------------------------------------------------------------------
// Zod schemas for extraction
// ---------------------------------------------------------------------------

export const RefundExtractionSchema = z.object({
  orderId: z.string().uuid().nullable(),
  refundId: z.string().uuid().nullable(),
  intent: z
    .enum(['refund_status', 'refund_request', 'general_inquiry'])
    .default('refund_request'),
  confidence: z.number().min(0).max(1),
});

export type RefundExtraction = z.infer<typeof RefundExtractionSchema>;

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

export async function extractRefundIntent(userText: string): Promise<RefundExtraction> {
  if (userText.trim().length === 0) {
    return { orderId: null, refundId: null, intent: 'refund_request', confidence: 0 };
  }

  const prompt = `Extract the order ID (a UUID), refund ID (a UUID, if mentioned), and customer intent from the customer message.
Recognized intents:
- 'refund_status': Customer asks where their refund is, refund timing, or status.
- 'refund_request': Customer wants a refund for an order or returned item.
- 'general_inquiry': General question about refunds or policy.

Customer message: "${userText}"

Respond with JSON:
{
  "orderId": "<uuid or null>",
  "refundId": "<uuid or null>",
  "intent": "refund_status" | "refund_request" | "general_inquiry",
  "confidence": <0.0-1.0>
}`;

  const result = await generateStructuredOutput(RefundExtractionSchema, prompt, {
    temperature: 0.0,
  });

  if (result.success) {
    return result.data;
  }

  return { orderId: null, refundId: null, intent: 'refund_request', confidence: 0 };
}

export async function generateRefundResponse(params: {
  refund: CreateRefundOutput;
  userText: string;
  isDuplicate?: boolean;
}): Promise<string> {
  const { refund, userText, isDuplicate } = params;

  const basePrompt = loadPrompt(REFUND_TEMPLATE, {});

  const reasonDesc = isDuplicate
    ? 'duplicate charge refund'
    : 'refund for your approved return';

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Processed Refund Data\n` +
    `Refund ID: ${refund.id}\n` +
    `Amount: $${refund.amount}\n` +
    `Status: ${refund.status}\n` +
    `Type: ${reasonDesc}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Inform the customer clearly and courteously that their refund of $${refund.amount} has been processed. ` +
    `Mention that it typically takes 3-5 business days to appear on their original payment method.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  // Graceful degradation fallback
  return (
    `I have successfully processed your refund of $${refund.amount} (${reasonDesc}). ` +
    `Your refund status is currently ${refund.status}. Please allow 3-5 business days for funds to reflect on your original payment method.`
  );
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'refund'
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
// Main Refund Node
// ---------------------------------------------------------------------------

export async function refundNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate | Command> {
  const specialist = 'refund' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);
  const userText = extractLastUserText(state);

  // ── Branch 1: Incoming Handoff from Payment (Scenario 3 Duplicate Charge) ──
  const resumeContext = state.activeWorkflow?.resumeContext;
  if (
    resumeContext &&
    typeof resumeContext['paymentId'] === 'string' &&
    typeof resumeContext['amount'] === 'string' &&
    resumeContext['returnId'] === null
  ) {
    const paymentId = resumeContext['paymentId'];
    const amount = resumeContext['amount'];

    const refundResult = await gatedExecuteTool(
      createRefund,
      createRefundMetadata,
      { paymentId, returnId: null, amount },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (refundResult.gate.outcome === 'BLOCKED') {
      const returnTo: ReturnTo = {
        domain: specialist,
        agent: specialist,
        workflowStep: 'create_refund',
      };
      return createBlockedResponse(
        {
          decision: refundResult.gate,
          returnTo,
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'create_refund',
          resumeContext,
        },
        'To process your refund request, we need to verify your identity. Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
      );
    }

    if (refundResult.gate.outcome === 'DENIED') {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('I am unable to process refunds at this time.')],
      };
    }

    if (!refundResult.success) {
      return {
        workflowStatus: 'ESCALATED',
        messages: [
          new AIMessage(
            `I encountered a technical issue processing the duplicate charge refund: ${refundResult.error.message}. I am escalating your request to human customer support for assistance.`
          ),
        ],
      };
    }

    const response = await generateRefundResponse({
      refund: refundResult.data,
      userText,
      isDuplicate: true,
    });

    return {
      workflowStatus: 'COMPLETED',
      activeWorkflow: null, // Clear activeWorkflow upon successful completion
      messages: [new AIMessage(response)],
    };
  }

  // ── Branch 2: Standard Refund Inquiry / Resolution ────────────────────────
  let orderId: string | null = null;
  let refundId: string | null = null;

  if (
    state.activeWorkflow?.returnTo?.agent === specialist &&
    resumeContext &&
    typeof resumeContext['orderId'] === 'string'
  ) {
    orderId = resumeContext['orderId'];
  }

  if (!orderId) {
    const extraction = await extractRefundIntent(userText);
    orderId = extraction.orderId;
    refundId = extraction.refundId;
  }

  // Direct refund status check by refundId
  if (refundId) {
    const statusResult = await gatedExecuteTool(
      getRefundStatus,
      getRefundStatusMetadata,
      { refundId },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (statusResult.gate.outcome === 'BLOCKED') {
      const returnTo: ReturnTo = {
        domain: specialist,
        agent: specialist,
        workflowStep: 'get_refund_status',
      };
      return createBlockedResponse(
        {
          decision: statusResult.gate,
          returnTo,
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'get_refund_status',
          resumeContext: { refundId },
        },
        'To view refund details, please log in to your account or confirm your identity.'
      );
    }

    if (statusResult.success) {
      const r = statusResult.data;
      return {
        workflowStatus: 'COMPLETED',
        activeWorkflow: null,
        messages: [
          new AIMessage(`Your refund of $${r.amount} is currently ${r.status}. (Refund ID: ${r.id})`),
        ],
      };
    }
  }

  if (!orderId) {
    return {
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          "I'd be happy to help with your refund. Could you please provide your order ID? " +
            'You can find it in your order confirmation email.'
        ),
      ],
    };
  }

  // ── Step 3: Check for linked returns via get_return_by_order ──────────────
  const returnsResult = await gatedExecuteTool(
    getReturnByOrder,
    getReturnByOrderMetadata,
    { orderId },
    {
      agentExecutionId,
      specialist,
      identity: state.identity,
    }
  );

  if (returnsResult.gate.outcome === 'BLOCKED') {
    const returnTo: ReturnTo = {
      domain: specialist,
      agent: specialist,
      workflowStep: 'get_return_by_order',
    };
    return createBlockedResponse(
      {
        decision: returnsResult.gate,
        returnTo,
        workflowId: null,
        originatingIntent: state.currentIntent,
        currentStep: 'get_return_by_order',
        resumeContext: { orderId },
      },
      'To check returns and refund eligibility for your order, please log in to your account or confirm your identity.'
    );
  }

  if (returnsResult.gate.outcome === 'DENIED') {
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage('I am unable to check return records for this order.')],
    };
  }

  const existingReturns = returnsResult.success ? (returnsResult.data as GetReturnByOrderOutput) : [];

  // Scenario 4: Refund inquiry with NO linked return -> Pattern B handoff to Returns
  if (existingReturns.length === 0) {
    return new Command({
      goto: 'router',
      update: {
        currentIntent: 'RETURN_REQUEST',
        currentDomain: 'returns',
        activeWorkflow: {
          workflowId: `handoff-ret-req-${orderId}`,
          originatingIntent: 'REFUND_REQUEST',
          currentStep: 'RETURN_REQUIRED',
          blockedBy: null, // NOT blocked by verification
          returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'check_return_eligibility' },
          resumeContext: { orderId },
        },
        routing: {
          previousAgent: specialist,
          handoffCount: 1, // Reducer applies delta
        },
      },
    });
  }

  // Check if any return is 'approved'
  const approvedReturn = existingReturns.find((r) => r.status === 'approved');

  if (approvedReturn) {
    // Scenario 8: Return approved, refund not yet created -> structured check -> create_refund (not RAG)
    const paymentResult = await gatedExecuteTool(
      getPayment,
      getPaymentMetadata,
      { orderId },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (paymentResult.gate.outcome === 'BLOCKED') {
      const returnTo: ReturnTo = {
        domain: specialist,
        agent: specialist,
        workflowStep: 'get_payment',
      };
      return createBlockedResponse(
        {
          decision: paymentResult.gate,
          returnTo,
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'get_payment',
          resumeContext: { orderId },
        },
        'To verify payment details for your refund request, please log in to your account or confirm your identity.'
      );
    }

    if (!paymentResult.success) {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('Could not find payment record to issue return refund.')],
      };
    }

    const payment = paymentResult.data;

    // Call createRefund
    const createResult = await gatedExecuteTool(
      createRefund,
      createRefundMetadata,
      {
        paymentId: payment.id,
        returnId: approvedReturn.id,
        amount: payment.amount,
      },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (createResult.gate.outcome === 'BLOCKED') {
      const returnTo: ReturnTo = {
        domain: specialist,
        agent: specialist,
        workflowStep: 'create_refund',
      };
      return createBlockedResponse(
        {
          decision: createResult.gate,
          returnTo,
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'create_refund',
          resumeContext: { orderId },
        },
        'To process your refund, we need to verify your identity. Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
      );
    }

    if (createResult.success) {
      const response = await generateRefundResponse({
        refund: createResult.data,
        userText,
        isDuplicate: false,
      });

      return {
        workflowStatus: 'COMPLETED',
        activeWorkflow: null,
        messages: [new AIMessage(response)],
      };
    }

    // If refund already exists
    if (createResult.error.code === 'REFUND_ALREADY_EXISTS') {
      return {
        workflowStatus: 'COMPLETED',
        activeWorkflow: null,
        messages: [
          new AIMessage(
            `A refund for your approved return on order ${orderId} has already been initiated and is being processed.`
          ),
        ],
      };
    }

    return {
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage(
          `I encountered a technical issue processing your refund: ${createResult.error.message}. I am escalating your request to human customer support for assistance.`
        ),
      ],
    };
  }

  // Returns exist but none approved (e.g. 'requested', 'in_transit', 'rejected')
  const knowledgeResult = await retrieveKnowledge({
    query: 'refund policy timeline return status approved received',
    domains: ['payments'],
    topics: ['refunds'],
    topK: 3,
  });

  const knowledgeContext =
    knowledgeResult.success && knowledgeResult.data.length > 0
      ? knowledgeResult.data.map((h) => h.content).join('\n\n')
      : '';

  const activeReturn = existingReturns[0];
  const statusMsg =
    activeReturn?.status === 'rejected'
      ? `Your return for order ${orderId} was rejected, so a refund cannot be issued under our policy.`
      : `Your return for order ${orderId} is currently '${activeReturn?.status ?? 'pending'}'. Refunds are processed automatically once the returned item is approved.`;

  return {
    workflowStatus: 'COMPLETED',
    activeWorkflow: null,
    messages: [
      new AIMessage(
        `${statusMsg} ${knowledgeContext ? '\n\nPolicy info: ' + knowledgeContext : ''}`.trim()
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Subgraph Factory
// ---------------------------------------------------------------------------

export function buildRefundSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('refund', refundNode, {
      ends: ['router', END],
    })
    .addEdge(START, 'refund')
    .addEdge('refund', END);

  return workflow.compile({ checkpointer });
}
