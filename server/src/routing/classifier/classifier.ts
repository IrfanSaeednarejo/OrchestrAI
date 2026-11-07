// src/routing/classifier/classifier.ts
// Phase 8: LLM-powered router intent classifier.
// Uses Gemini 2.5 Flash via generateStructuredOutput (temperature 0.0)
// to map customer messages into domain intents and specialist assignments.

import { z } from 'zod';
import { generateStructuredOutput, type LLMResult } from '../../agents/llm/client.js';
import { SPECIALIST_IDS } from '../../tools/permissions.js';

// ---------------------------------------------------------------------------
// Schema & Types
// ---------------------------------------------------------------------------

export const ClassificationResultSchema = z.object({
  specialist: z.enum(SPECIALIST_IDS),
  intent: z.string().min(1, 'intent must not be empty'),
  confidence: z
    .number()
    .min(0, 'confidence must be >= 0')
    .max(1, 'confidence must be <= 1'),
  reasoning: z.string().min(1, 'reasoning must not be empty'),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export interface ClassifierContext {
  currentDomain?: string | null;
  previousAgent?: string | null;
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

  return `You are the Master Router for OrchestrAI, an autonomous e-commerce customer support platform.
Your task is to analyze the user's message and classify it into the correct domain specialist and specific intent.

Specialists available:
- order_tracking: Order status, shipment tracking, order history, delivery timing, general store queries.
- returns: Initiating returns, checking return status, return policy eligibility.
- payment: Payment inquiries, payment method issues, duplicate charges, billing disputes.
- refund: Refund requests, refund status checks, refund processing.
- profile: Viewing or updating customer profile information (name, shipping address).
- account_access: Login issues, identity verification, password resets.

If the user message is simply a greeting or casual opening ("hello", "hi", "good morning") without a specific domain request, classify intent as "GREETING" and specialist as "order_tracking".

Context:
${domainContext}

User Message:
"""${userMessage}"""

Respond with a JSON object matching this schema:
{
  "specialist": "order_tracking" | "returns" | "payment" | "refund" | "profile" | "account_access",
  "intent": "<SPECIFIC_INTENT_NAME>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<concise explanation>"
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
  });
}

