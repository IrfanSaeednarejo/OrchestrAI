// src/agents/specialists/general-assistant/general-assistant.ts
// Phase 24: General Assistant specialist subgraph node.
// Handles greetings, capability questions ("what else can you do?"), chit-chat,
// and general store triage, grounded in the platform capabilities registry.

import crypto from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import type {
  ConversationState,
  ConversationStateUpdate,
} from '../../../state/conversation-state.js';
import { generateStructuredOutput } from '../../llm/client.js';
import { formatCapabilitiesForPrompt } from './capabilities.js';
import { recordAgentExecution, completeAgentExecutionSafely } from '../../../routing/events.js';
import { getTurnContext } from '../../../shared/turn-context.js';

export const SuggestionItemSchema = z.object({
  label: z.string().min(1),
  message: z.string().min(1),
});

export type SuggestionItem = z.infer<typeof SuggestionItemSchema>;

export const GeneralResponseSchema = z.object({
  response: z.string().min(1, 'response must not be empty'),
  suggestions: z.array(SuggestionItemSchema).default([]),
});

export type GeneralResponse = z.infer<typeof GeneralResponseSchema>;

function extractLastUserMessageText(state: ConversationState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg && msg._getType() === 'human' && typeof msg.content === 'string') {
      return msg.content;
    }
  }
  return '';
}

/**
 * Builds grounded prompt for the general assistant based on the platform capabilities registry.
 */
function buildGeneralAssistantPrompt(userText: string): string {
  const capabilities = formatCapabilitiesForPrompt();

  return `You are the General Assistant for OrchestrAI, an autonomous customer support platform for an online store.
Your goal is to warmly welcome customers, clearly explain what services you can perform, and help them get started.

Platform Capabilities:
${capabilities}

Customer Message:
"""${userText}"""

Instructions:
1. If the customer is asking what you can do, what else you can do, or asking for help: summarize your capabilities clearly and concisely based strictly on the Platform Capabilities above. Provide 2-4 helpful suggestion chips in the "suggestions" array.
2. If the customer is greeting you ("hello", "hi"): return a warm, concise 1-2 sentence greeting and ask how you can help them today. Provide 3-4 suggestion chips covering the main services.
3. If the customer message is casual chit-chat: be polite, brief, and guide them back to our supported services.
4. If the customer's request is unclear or out of scope: politely explain what you can help with (order tracking, returns, payments, refunds, profile, account access).
5. Never invent capabilities outside the list above. Keep the response friendly, professional, and under 100 words.

Respond with a JSON object:
{
  "response": "<your customer-facing response>",
  "suggestions": [
    { "label": "Track Order", "message": "I need to track an order" },
    { "label": "Return Item", "message": "I want to start a return" }
  ]
}`;
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'general_assistant'
): Promise<string> {
  if (typeof conversationId === 'string' && conversationId.length > 0) {
    try {
      if (typeof recordAgentExecution === 'function') {
        const record = await recordAgentExecution({
          conversationId,
          agent,
          status: 'success',
        });
        return record.id;
      }
    } catch {
      return crypto.randomUUID();
    }
  }
  return crypto.randomUUID();
}

async function finishAgentExecutionSafely(
  id: string | undefined,
  duration: number,
  status: 'success' | 'failure' = 'success',
  error?: string
): Promise<void> {
  if (typeof completeAgentExecutionSafely === 'function') {
    try {
      await completeAgentExecutionSafely(id, duration, status, error);
    } catch {
      // ignore
    }
  }
}

export async function generalAssistantNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate> {
  const specialist = 'general_assistant' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const startTime = performance.now();
  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);
  const turnCtx = getTurnContext();
  if (turnCtx) turnCtx.node = specialist;

  try {
    const userText = extractLastUserMessageText(state);

    const prompt = buildGeneralAssistantPrompt(userText);
    const result = await generateStructuredOutput(GeneralResponseSchema, prompt, {
      temperature: 0.2,
      node: specialist,
      conversationId,
    });

    let responseText: string;
    let suggestions: SuggestionItem[];

    if (result.success) {
      responseText = result.data.response;
      suggestions = result.data.suggestions ?? [];
    } else {
      // Grounded fallback
      responseText =
        "I'm here to assist you with order tracking, returns, payments, refunds, profile updates, and account security. How can I help you today?";
      suggestions = [
        { label: 'Track an Order', message: 'I need to track my order' },
        { label: 'Request a Return', message: 'I would like to request a return' },
        { label: 'Request a Refund', message: 'I need help with a refund' },
      ];
    }

    const aiMessage = new AIMessage({
      content: responseText,
      additional_kwargs: {
        options: suggestions,
        suggestions,
      },
    });

    const update: ConversationStateUpdate = {
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      activeWorkflow: null, // Abandon pending non-verification task on conversational switch
      messages: [aiMessage],
    };

    await finishAgentExecutionSafely(agentExecutionId, performance.now() - startTime, 'success');
    return update;
  } catch (err) {
    await finishAgentExecutionSafely(
      agentExecutionId,
      performance.now() - startTime,
      'failure',
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}
