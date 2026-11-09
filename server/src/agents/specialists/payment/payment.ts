// src/agents/specialists/payment/payment.ts
// Phase 10: Payment specialist subgraph.
// Handles payment inquiries, duplicate charge detection, and Pattern B
// lateral handoff to the Refund specialist when duplicate charges are confirmed.

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
  getPayment,
  getPaymentMetadata,
  type GetPaymentOutput,
} from '../../../tools/queries/payment.tools.js';
import {
  detectDuplicateCharge,
  detectDuplicateChargeMetadata,
} from '../../../tools/business/duplicate-detection.js';

// ---------------------------------------------------------------------------
// Prompt template (5 required sections)
// ---------------------------------------------------------------------------

export const PAYMENT_TEMPLATE = {
  sections: {
    Identity: `You are the Payment specialist for an e-commerce customer support platform.
You handle payment status inquiries, billing questions, and duplicate charge investigations.`,

    Objective: `Assist customers with payment inquiries and investigate duplicate charges accurately.
Provide grounded payment information and coordinate with refund specialists when refunds are required.`,

    Scope: `IN SCOPE: payment status, billing details, payment methods, duplicate charge detection.
OUT OF SCOPE: issuing refunds (handled by refund specialist), returns, order tracking, profile changes.`,

    'Phased-Workflow': `1. Identify the orderId or paymentId from customer message or conversation context.
2. Retrieve payment details using secure system tools (requires verified identity).
3. If duplicate charge is suspected, run duplicate charge detection.
4. If duplicate charge is confirmed, hand off to the Refund specialist to issue a refund.
5. Ground all customer explanations in payment policy knowledge.`,

    Guidelines: `- Never answer payment policy questions from model memory when retrieval returns nothing.
- Treat financial and payment data with high confidentiality; require identity verification.
- When duplicate charges are confirmed, reassure the customer and hand off cleanly to Refund.
- Keep communications polite, professional, and clear.`,
  },
};

// ---------------------------------------------------------------------------
// Zod schemas for extraction
// ---------------------------------------------------------------------------

export const PaymentExtractionSchema = z.object({
  orderId: z.string().uuid().nullable(),
  paymentId: z.string().uuid().nullable(),
  intent: z
    .enum(['duplicate_charge', 'payment_status', 'general_inquiry'])
    .default('general_inquiry'),
  confidence: z.number().min(0).max(1),
});

export type PaymentExtraction = z.infer<typeof PaymentExtractionSchema>;

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

export async function extractPaymentIntent(userText: string): Promise<PaymentExtraction> {
  if (userText.trim().length === 0) {
    return { orderId: null, paymentId: null, intent: 'general_inquiry', confidence: 0 };
  }

  const uuidMatch = userText.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
  );
  const directOrderId = uuidMatch ? uuidMatch[0].toLowerCase() : null;

  const prompt = `Extract the order ID (a UUID), payment ID (a UUID, if mentioned), and customer intent from the following customer message.
Recognized intents:
- 'duplicate_charge': Customer reports being charged twice, multiple charges, duplicate payment, or billing dispute.
- 'payment_status': Customer asks if payment succeeded, was received, or about payment method.
- 'general_inquiry': General payment or billing inquiry.

Customer message: "${userText}"

Respond with JSON:
{
  "orderId": "<uuid or null>",
  "paymentId": "<uuid or null>",
  "intent": "duplicate_charge" | "payment_status" | "general_inquiry",
  "confidence": <0.0-1.0>
}`;

  const result = await generateStructuredOutput(PaymentExtractionSchema, prompt, {
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
    paymentId: null,
    intent: 'general_inquiry',
    confidence: directOrderId ? 0.8 : 0,
  };
}

export function isDuplicateChargeInquiry(userText: string, intent?: string | null): boolean {
  if (intent === 'duplicate_charge' || intent === 'DUPLICATE_CHARGE') {
    return true;
  }
  const lower = userText.toLowerCase();
  return (
    lower.includes('duplicate') ||
    lower.includes('charged twice') ||
    lower.includes('double charge') ||
    lower.includes('charged two times') ||
    lower.includes('two charges') ||
    lower.includes('billed twice') ||
    lower.includes('bill me twice') ||
    lower.includes('billed two times') ||
    lower.includes('bill me two times')
  );
}

export async function generatePaymentResponse(params: {
  payment: GetPaymentOutput;
  knowledgeContext: string;
  userText: string;
  duplicateChecked?: boolean;
  potentialDuplicate?: boolean;
}): Promise<string> {
  const { payment, knowledgeContext, userText, duplicateChecked, potentialDuplicate } = params;

  const basePrompt = loadPrompt(PAYMENT_TEMPLATE, {});

  const duplicateSummary = duplicateChecked
    ? potentialDuplicate
      ? 'A potential duplicate charge was detected and escalated for refund.'
      : 'We checked our records and confirmed there are no duplicate charges for this transaction within 24 hours.'
    : 'No duplicate charge investigation was requested.';

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Payment Data\n` +
    `Order ID: ${payment.orderId}\n` +
    `Payment Status: ${payment.status}\n` +
    `Amount: $${payment.amount}\n` +
    `Payment Method: ${payment.method}\n\n` +
    `## Duplicate Investigation\n${duplicateSummary}\n\n` +
    `## Relevant Payment Policy Knowledge\n${knowledgeContext || 'No additional policy context available.'}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Respond helpfully to the customer based strictly on the payment data and policy above. ` +
    `Keep it clear, concise, and professional.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  // Graceful degradation fallback
  if (duplicateChecked && !potentialDuplicate) {
    return (
      `We reviewed your transaction for order ${payment.orderId}. ` +
      `Our records show a single captured payment of $${payment.amount} using ${payment.method}. ` +
      `No duplicate charges were found on our system within the 24-hour window.`
    );
  }

  return (
    `Your payment of $${payment.amount} for order ${payment.orderId} is currently ${payment.status} ` +
    `(method: ${payment.method}).`
  );
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'payment'
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
// Main Payment Node
// ---------------------------------------------------------------------------

export async function paymentNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate | Command> {
  const specialist = 'payment' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);

  // 1. Resolve orderId & intent (check resumeContext first, then extraction)
  let orderId: string | null = null;
  let intent = state.currentIntent;

  if (
    state.activeWorkflow?.returnTo?.agent === specialist &&
    state.activeWorkflow.resumeContext &&
    typeof state.activeWorkflow.resumeContext['orderId'] === 'string'
  ) {
    orderId = state.activeWorkflow.resumeContext['orderId'];
    if (typeof state.activeWorkflow.resumeContext['intent'] === 'string') {
      intent = state.activeWorkflow.resumeContext['intent'];
    }
  }

  const userText = extractLastUserText(state);

  if (!orderId) {
    const extraction = await extractPaymentIntent(userText);
    orderId = extraction.orderId;
    if (extraction.intent !== 'general_inquiry') {
      intent = extraction.intent;
    }
  }

  if (!orderId) {
    return {
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          "I would be glad to help you with your payment inquiry. Could you please provide your order ID? " +
            'You can find it in your order confirmation email.'
        ),
      ],
    };
  }

  // 2. Fetch payment details via gated tool (requires FULL verification)
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
        resumeContext: { orderId, intent },
      },
      'To access sensitive payment details, we need to verify your identity first. ' +
        'Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
    );
  }

  if (paymentResult.gate.outcome === 'DENIED') {
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage('I am unable to access payment details for this order.')],
    };
  }

  if (!paymentResult.success) {
    const isNotFound = paymentResult.error.code === 'NOT_FOUND';
    if (isNotFound) {
      return {
        workflowStatus: 'FAILED',
        messages: [
          new AIMessage(
            "I couldn't find a payment record for that order. Please check the order number and try again."
          ),
        ],
      };
    }

    return {
      workflowStatus: 'ESCALATED',
      messages: [
        new AIMessage(
          'I encountered repeated technical issues retrieving payment details. I am escalating your request to human customer support for assistance.'
        ),
      ],
    };
  }

  const payment = paymentResult.data;

  // 3. Duplicate charge investigation branch
  const shouldCheckDuplicate = isDuplicateChargeInquiry(userText, intent);

  if (shouldCheckDuplicate) {
    const duplicateResult = await gatedExecuteTool(
      detectDuplicateCharge,
      detectDuplicateChargeMetadata,
      { paymentId: payment.id },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (duplicateResult.gate.outcome === 'BLOCKED') {
      const returnTo: ReturnTo = {
        domain: specialist,
        agent: specialist,
        workflowStep: 'detect_duplicate_charge',
      };
      return createBlockedResponse(
        {
          decision: duplicateResult.gate,
          returnTo,
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'detect_duplicate_charge',
          resumeContext: { orderId, intent },
        },
        'To access sensitive payment details, we need to verify your identity first. ' +
          'Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
      );
    }

    if (duplicateResult.gate.outcome === 'DENIED') {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('I am unable to run duplicate charge detection.')],
      };
    }

    if (!duplicateResult.success) {
      return {
        workflowStatus: 'ESCALATED',
        messages: [
          new AIMessage(
            'I encountered repeated technical issues checking for duplicate charges. I am escalating your request to human customer support for assistance.'
          ),
        ],
      };
    }

    const { potentialDuplicate, duplicatePaymentId, reason } = duplicateResult.data;

    // Pattern B Re-Route: Duplicate confirmed -> hand off to Refund specialist
    if (potentialDuplicate && duplicatePaymentId) {
      return new Command({
        goto: 'router',
        update: {
          currentIntent: 'REFUND_ACTION_REQUIRED',
          currentDomain: 'refund',
          activeWorkflow: {
            workflowId: `handoff-dup-${payment.id}`,
            originatingIntent: 'DUPLICATE_CHARGE',
            currentStep: 'REFUND_ACTION_REQUIRED',
            blockedBy: null, // NOT blocked by verification
            returnTo: { domain: 'refund', agent: 'refund', workflowStep: 'create_refund' },
            resumeContext: {
              orderId: payment.orderId,
              paymentId: duplicatePaymentId, // The second payment to refund
              duplicatePaymentId,
              originalPaymentId: payment.id,
              amount: payment.amount,
              returnId: null, // Duplicate charge refunds have returnId = null
              reason: reason ?? 'Duplicate charge confirmed within 24 hours',
            },
          },
          routing: {
            previousAgent: specialist,
            handoffCount: 1, // Reducer applies this as a delta
          },
        },
      });
    }

    // No duplicate charge found: explain to customer with policy knowledge
    const knowledgeResult = await retrieveKnowledge({
      query: 'duplicate charge billing dispute policy',
      domains: ['payments'],
      topics: ['payments'],
      topK: 3,
    });

    const knowledgeContext =
      knowledgeResult.success && knowledgeResult.data.length > 0
        ? knowledgeResult.data.map((h) => h.content).join('\n\n')
        : '';

    const response = await generatePaymentResponse({
      payment,
      knowledgeContext,
      userText,
      duplicateChecked: true,
      potentialDuplicate: false,
    });

    return {
      workflowStatus: 'COMPLETED',
      activeWorkflow: null,
      messages: [new AIMessage(response)],
    };
  }

  // 4. Standard payment inquiry
  const knowledgeResult = await retrieveKnowledge({
    query: 'payment methods timing confirmation policy',
    domains: ['payments'],
    topics: ['payments'],
    topK: 3,
  });

  const knowledgeContext =
    knowledgeResult.success && knowledgeResult.data.length > 0
      ? knowledgeResult.data.map((h) => h.content).join('\n\n')
      : '';

  const response = await generatePaymentResponse({
    payment,
    knowledgeContext,
    userText,
    duplicateChecked: false,
  });

  return {
    workflowStatus: 'COMPLETED',
    activeWorkflow: null,
    messages: [new AIMessage(response)],
  };
}

// ---------------------------------------------------------------------------
// Subgraph Factory (for isolated testing or embedding)
// ---------------------------------------------------------------------------

export function buildPaymentSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('payment', paymentNode, {
      ends: ['router', END],
    })
    .addEdge(START, 'payment')
    .addEdge('payment', END);

  return workflow.compile({ checkpointer });
}
