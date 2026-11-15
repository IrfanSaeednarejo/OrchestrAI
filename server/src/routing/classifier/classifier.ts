// src/routing/classifier/classifier.ts
// Phase 8: LLM-powered router intent classifier.
// Uses Gemini 2.5 Flash via generateStructuredOutput (temperature 0.0)
// to map customer messages into domain intents and specialist assignments.

import { z } from 'zod';
import { generateStructuredOutput, type LLMResult } from '../../agents/llm/client.js';
import { SPECIALIST_IDS } from '../../tools/permissions.js';
import type { LastKnownEntities, PendingTaskState } from '../../state/conversation-state.js';
import { formatEntityContext, formatPendingTaskContext } from '../../agents/common/context.js';

// ---------------------------------------------------------------------------
// Schema & Types
// ---------------------------------------------------------------------------

export const IntentItemSchema = z.object({
  specialist: z.enum(SPECIALIST_IDS),
  intent: z.string().min(1, 'intent must not be empty'),
  confidence: z
    .number()
    .min(0, 'confidence must be >= 0')
    .max(1, 'confidence must be <= 1'),
  reasoning: z.string().min(1, 'reasoning must not be empty'),
});

export type IntentItem = z.infer<typeof IntentItemSchema>;

export const ClassificationResultSchema = z.object({
  specialist: z.enum(SPECIALIST_IDS),
  intent: z.string().min(1, 'intent must not be empty'),
  confidence: z
    .number()
    .min(0, 'confidence must be >= 0')
    .max(1, 'confidence must be <= 1'),
  reasoning: z.string().min(1, 'reasoning must not be empty'),
  secondaryIntents: z.array(IntentItemSchema).max(1).default([]),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export interface ClassifierContext {
  currentDomain?: string | null;
  previousAgent?: string | null;
  transcript?: string | null;
  lastKnownEntities?: LastKnownEntities | null;
  pendingTask?: PendingTaskState | null;
}

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

function buildClassificationPrompt(
  userMessage: string,
  context?: ClassifierContext
): string {
  const domainContext = context?.currentDomain
    ? `Current active domain: ${context.currentDomain}`
    : 'No active domain established yet.';
  const previousAgentContext = context?.previousAgent
    ? `Previous specialist agent: ${context.previousAgent}`
    : 'No previous agent.';
  const transcriptContext = context?.transcript
    ? `Recent Conversation Transcript:\n${context.transcript}`
    : 'No prior transcript.';
  const entitiesContext = `Known Entities: ${formatEntityContext(context?.lastKnownEntities)}`;
  const pendingTaskContext = `Pending Task: ${formatPendingTaskContext(context?.pendingTask)}`;

  return `You are the Master Router for OrchestrAI, an autonomous e-commerce customer support platform.
Your task is to analyze the user's message and classify it into the correct domain specialist and specific intent.

Specialists available:
- order_tracking: Order status, shipment tracking, order history, delivery timing.
- returns: Initiating returns, checking return status, return policy eligibility.
- payment: Payment inquiries, payment method issues, duplicate charges, billing disputes.
- refund: Refund requests, refund status checks, refund processing.
- profile: Viewing or updating customer profile information (name, shipping address).
- account_access: Login issues, identity verification, password resets.
- general_assistant: Greetings, capability inquiries ("what can you do?", "what else can you do?"), help, store chit-chat, unsupported requests.

Contextual Guidance:
- If the customer refers to "this order", "that package", or "my return", use the Known Entities and Recent Transcript to determine the context.
- If a specialist is currently awaiting specific information (Pending Task) and the user provides that info, continue with that specialist.
- If the user changes topic away from a pending task (e.g. asking a profile question or capability question), route to the new specialist instead of forcing continuation.
- If the user expresses multiple distinct intents in one message (e.g., "where is my order and can I return it?"), identify the primary intent for immediate execution and put at most one secondary intent in "secondaryIntents".
- If the user message is a greeting or capability question ("hello", "what can you do?"), classify intent as "GREETING" or "CAPABILITY_QUERY" and specialist as "general_assistant".

Context:
${domainContext}
${previousAgentContext}
${entitiesContext}
${pendingTaskContext}

${transcriptContext}

User Message:
"""${userMessage}"""

Respond with a JSON object matching this schema:
{
  "specialist": "order_tracking" | "returns" | "payment" | "refund" | "profile" | "account_access" | "general_assistant",
  "intent": "<SPECIFIC_INTENT_NAME>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<concise explanation>",
  "secondaryIntents": [
    {
      "specialist": "<specialist>",
      "intent": "<intent>",
      "confidence": <number>,
      "reasoning": "<explanation>"
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Main Classifier Function
// ---------------------------------------------------------------------------

/**
 * Classifies an incoming customer message to select the appropriate specialist agent.
 * Returns a discriminated LLMResult — never throws.
 */
export async function classifyMessage(
  userMessage: string,
  context?: ClassifierContext
): Promise<LLMResult<ClassificationResult>> {
  const prompt = buildClassificationPrompt(userMessage, context);

  return generateStructuredOutput(ClassificationResultSchema, prompt, {
    temperature: 0.0,
    node: 'router_classifier',
  });
}

