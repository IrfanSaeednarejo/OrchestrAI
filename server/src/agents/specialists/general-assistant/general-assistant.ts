// src/agents/specialists/general-assistant/general-assistant.ts
// Phase 24: General Assistant specialist subgraph node.
// Handles greetings, capability questions ("what else can you do?"), chit-chat,
// and general store triage, grounded in the platform capabilities registry.

import { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type {
  ConversationState,
  ConversationStateUpdate,
} from '../../../state/conversation-state.js';
import { generateStructuredOutput } from '../../llm/client.js';
import { formatCapabilitiesForPrompt } from './capabilities.js';

const GeneralResponseSchema = z.object({
  response: z.string().min(1, 'response must not be empty'),
});

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
1. If the customer is asking what you can do, what else you can do, or asking for help: summarize your capabilities clearly and concisely based strictly on the Platform Capabilities above.
2. If the customer is greeting you ("hello", "hi"): return a warm, concise 1-2 sentence greeting and ask how you can help them today.
3. If the customer message is casual chit-chat: be polite, brief, and guide them back to our supported services.
4. If the customer's request is unclear or out of scope: politely explain what you can help with (order tracking, returns, payments, refunds, profile, account access).
5. Never invent capabilities outside the list above. Keep the response friendly, professional, and under 100 words.

Respond with a JSON object:
{
  "response": "<your customer-facing response>"
}`;
}

export async function generalAssistantNode(
  state: ConversationState
): Promise<ConversationStateUpdate> {
  const userText = extractLastUserMessageText(state);

  const prompt = buildGeneralAssistantPrompt(userText);
  const result = await generateStructuredOutput(GeneralResponseSchema, prompt, {
    temperature: 0.2,
  });

  let responseText: string;
  if (result.success) {
    responseText = result.data.response;
  } else {
    // Grounded fallback
    responseText =
      "I'm here to assist you with order tracking, returns, payments, refunds, profile updates, and account security. How can I help you today?";
  }

  return {
    workflowStatus: 'WAITING_FOR_USER_INPUT',
    activeWorkflow: null, // Abandon pending non-verification task on conversational switch
    messages: [new AIMessage(responseText)],
  };
}
