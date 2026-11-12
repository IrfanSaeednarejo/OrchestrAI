// src/agents/specialists/account-access/account-access.ts
// Phase 11: Account Access specialist subgraph.
// Handles two-mode account access operations:
// 1. Password reset (Scenario 14): stateless reset via initiate_password_reset; NEVER touches identity.status.
// 2. Identity verification (Scenarios 5, 6, 7): multi-turn OTP flow (start_identity_verification -> verify_identity).
//    On verification success: calls buildIdentityUpdate from state/identity-update.ts (enforced boundary)
//    and unblocks activeWorkflow so the parent router guard resumes the originating specialist (Pattern C).

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
} from '../../../state/conversation-state.js';
import { buildIdentityUpdate } from '../../../state/identity-update.js';
import { generateStructuredOutput } from '../../llm/client.js';
import { loadPrompt } from '../../prompts/template-loader.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import { retrieveKnowledge } from '../../../knowledge/retrieval.js';
import { recordAgentExecution } from '../../../routing/events.js';
import {
  startIdentityVerification,
  startIdentityVerificationMetadata,
  verifyIdentity,
  verifyIdentityMetadata,
  initiatePasswordReset,
  initiatePasswordResetMetadata,
} from '../../../tools/mutations/identity.tools.js';

// ---------------------------------------------------------------------------
// Prompt template (5 required sections)
// ---------------------------------------------------------------------------

export const ACCOUNT_ACCESS_TEMPLATE = {
  sections: {
    Identity: `You are the Account Access specialist for an e-commerce customer support platform.
You handle identity verification, login assistance, password resets, and account security policies.`,

    Objective: `Assist customers in securely verifying their identity, regaining account access via password reset,
and understanding account security practices. Protect customer accounts with strict verification standards.`,

    Scope: `IN SCOPE: one-time verification code handling (issuing and verifying), initiating password resets,
explaining account security and authentication policies.
OUT OF SCOPE: viewing or modifying customer profile data (handled by Profile specialist), order inquiries,
returns, payments, refunds.`,

    'Phased-Workflow': `1. Identify customer need: password reset, identity verification, or security policy inquiry.
2. If password reset: trigger a secure password reset email (does not alter verification status).
3. If identity verification: issue a 6-digit one-time code to the customer's email.
4. When customer provides the 6-digit code: validate the code securely.
5. If verified: update verification credentials and seamlessly resume any pending workflow.
6. For security policy questions: retrieve relevant policy information and explain clearly.`,

    Guidelines: `- Never log, expose, or reveal raw verification codes to the customer in chat.
- Password resets NEVER change or elevate verification status; verification requires an OTP code.
- If verification code is invalid, inform the customer politely and allow them to re-enter.
- Ground all security policy explanations in retrieved knowledge; never fabricate policies.
- Keep security communications clear, reassuring, and concise.`,
  },
};

// ---------------------------------------------------------------------------
// Zod schema for intent extraction
// ---------------------------------------------------------------------------

const AccountAccessIntentSchema = z.object({
  intent: z.enum(['verify_code', 'start_verification', 'password_reset', 'security_inquiry']),
  code: z.string().length(6).nullable(),
  confidence: z.number().min(0).max(1),
});

export type AccountAccessIntent = z.infer<typeof AccountAccessIntentSchema>;

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

export function extractSixDigitCode(text: string): string | null {
  const match = text.match(/\b\d{6}\b/);
  return match ? match[0] : null;
}

export async function extractAccountAccessIntent(
  userText: string,
  isWaitingForCode: boolean
): Promise<AccountAccessIntent> {
  // Fast path: check for a 6-digit numeric code directly in message
  const directCode = extractSixDigitCode(userText);
  if (directCode) {
    return {
      intent: 'verify_code',
      code: directCode,
      confidence: 1.0,
    };
  }

  if (userText.trim().length === 0) {
    return {
      intent: isWaitingForCode ? 'verify_code' : 'start_verification',
      code: null,
      confidence: 0,
    };
  }

  const prompt = `Classify the customer message for an account access & security specialist.
Options:
- "password_reset": Customer wants to reset or recovered their password / login.
- "start_verification": Customer wants to start identity verification or asks for a code.
- "verify_code": Customer is providing a verification code.
- "security_inquiry": Customer is asking a general policy or security question.

Customer message: "${userText}"

Respond with JSON:
{
  "intent": "verify_code" | "start_verification" | "password_reset" | "security_inquiry",
  "code": "<6-digit code or null>",
  "confidence": <0.0-1.0>
}`;

  const result = await generateStructuredOutput(AccountAccessIntentSchema, prompt, {
    temperature: 0.0,
  });

  if (result.success) {
    return result.data;
  }

  // Fallback heuristics
  const lower = userText.toLowerCase();
  if (lower.includes('password') || lower.includes('reset') || lower.includes('login')) {
    return { intent: 'password_reset', code: null, confidence: 0.5 };
  }
  if (isWaitingForCode) {
    return { intent: 'verify_code', code: null, confidence: 0.5 };
  }
  return { intent: 'start_verification', code: null, confidence: 0.5 };
}

export async function generateSecurityInquiryResponse(params: {
  knowledgeContext: string;
  userText: string;
}): Promise<string> {
  const { knowledgeContext, userText } = params;
  const basePrompt = loadPrompt(ACCOUNT_ACCESS_TEMPLATE, {});

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Relevant Account Security Policy Knowledge\n${knowledgeContext || 'Standard policy: Verification requires a one-time code sent to registered contact.'}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Answer the customer's account security question accurately and professionally, grounded in our policy.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  return 'For your security, we require one-time verification codes for sensitive account changes. Password resets are sent to your registered email address.';
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'account_access'
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
// Main Account Access Node
// ---------------------------------------------------------------------------

export async function accountAccessNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate | Command> {
  const specialist = 'account_access' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);

  // 1. Require a user in state
  if (!state.user?.id) {
    return {
      workflowStatus: 'FAILED',
      messages: [
        new AIMessage(
          'I am unable to assist with account access because your session could not be identified.'
        ),
      ],
    };
  }

  const userId = state.user.id;
  const userText = extractLastUserText(state);

  const isWaitingForCode =
    state.activeWorkflow?.currentStep === 'verify_identity' ||
    Boolean(state.activeWorkflow?.blockedBy);

  // 2. Classify intent
  const intentData = await extractAccountAccessIntent(userText, isWaitingForCode);

  // ---------------------------------------------------------------------------
  // Path 1: Password Reset (Mode 1 - Scenario 14)
  // CRITICAL: initiate_password_reset NEVER updates identity.status.
  // ---------------------------------------------------------------------------
  if (intentData.intent === 'password_reset') {
    const resetResult = await gatedExecuteTool(
      initiatePasswordReset,
      initiatePasswordResetMetadata,
      { userId },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (resetResult.gate.outcome === 'DENIED') {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('I am not permitted to initiate password resets.')],
      };
    }

    if (!resetResult.success) {
      return {
        workflowStatus: 'FAILED',
        messages: [
          new AIMessage('I encountered an error initiating your password reset. Please try again shortly.'),
        ],
      };
    }

    // Success: Return acknowledgement without mutating identity
    return {
      workflowStatus: 'COMPLETED',
      messages: [
        new AIMessage(
          'A password reset link has been sent to your registered email address. Please follow the instructions in the email to reset your password.'
        ),
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Path 2: Verify Code (Mode 2 Step B)
  // ---------------------------------------------------------------------------
  const codeToVerify = intentData.code ?? extractSixDigitCode(userText);

  if (intentData.intent === 'verify_code' && codeToVerify) {
    const verifyResult = await gatedExecuteTool(
      verifyIdentity,
      verifyIdentityMetadata,
      { userId, code: codeToVerify },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (verifyResult.gate.outcome === 'DENIED') {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('I am not permitted to perform identity verification.')],
      };
    }

    if (!verifyResult.success) {
      const errCode = verifyResult.error.code;
      if (errCode === 'MAX_ATTEMPTS_EXCEEDED') {
        return {
          workflowStatus: 'FAILED',
          messages: [
            new AIMessage(
              'You have exceeded the maximum number of verification attempts. Please request a new verification code.'
            ),
          ],
        };
      }

      // Invalid or expired code: allow re-entry
      return {
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [
          new AIMessage(
            'The verification code you entered is invalid or has expired. Please double-check the 6-digit code and try again.'
          ),
        ],
      };
    }

    // VERIFICATION SUCCESS:
    // Call buildIdentityUpdate from state/identity-update.ts (enforced architectural invariant)
    const identityUpdate = buildIdentityUpdate({
      status: 'VERIFIED',
      verificationMethod: 'otp',
      verifiedAt: new Date().toISOString(),
    });

    // If an originating workflow was blocked, unblock it (set blockedBy = null) and hand off to router
    if (state.activeWorkflow?.returnTo) {
      return new Command({
        goto: 'router',
        update: {
          ...identityUpdate,
          activeWorkflow: {
            ...state.activeWorkflow,
            blockedBy: null, // Signals unblocked to router guard checkResumePreconditions
            currentStep: 'verified',
          },
        },
      });
    }

    // Standalone verification success
    return {
      ...identityUpdate,
      activeWorkflow: null,
      workflowStatus: 'COMPLETED',
      messages: [
        new AIMessage(
          'Your identity has been verified successfully. How else may I assist you today?'
        ),
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Path 3: Start Verification (Mode 2 Step A)
  // ---------------------------------------------------------------------------
  if (intentData.intent === 'start_verification' || (isWaitingForCode && !codeToVerify)) {
    const issueResult = await gatedExecuteTool(
      startIdentityVerification,
      startIdentityVerificationMetadata,
      { userId },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (issueResult.gate.outcome === 'DENIED') {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('I am not permitted to start identity verification.')],
      };
    }

    if (!issueResult.success) {
      return {
        activeWorkflow: state.activeWorkflow,
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [
          new AIMessage(
            issueResult.error?.message ||
              'I encountered an error issuing your verification code. Please try again shortly.'
          ),
        ],
      };
    }

    // Preserve existing activeWorkflow if resuming, or initialize minimal tracking
    const updatedWorkflow = state.activeWorkflow
      ? { ...state.activeWorkflow, currentStep: 'verify_identity' }
      : {
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'verify_identity',
          blockedBy: 'VERIFICATION_FULL',
          returnTo: null,
          resumeContext: null,
        };

    const maskedEmail = issueResult.data?.maskedEmail;
    const recipientText = maskedEmail ? `to ${maskedEmail}` : 'to your email';

    return {
      activeWorkflow: updatedWorkflow,
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [
        new AIMessage(
          `To proceed, we need to verify your identity. A 6-digit verification code has been sent ${recipientText}. Please enter the code when you receive it.`
        ),
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Path 4: General Security Inquiry / Policy lookup
  // ---------------------------------------------------------------------------
  const knowledgeResult = await retrieveKnowledge({
    query: userText,
    domains: ['account'],
    topics: ['account_security'],
    topK: 3,
  });

  const knowledgeContext =
    knowledgeResult.success && knowledgeResult.data.length > 0
      ? knowledgeResult.data.map((h) => h.content).join('\n\n')
      : '';

  const responseText = await generateSecurityInquiryResponse({
    knowledgeContext,
    userText,
  });

  return {
    workflowStatus: 'COMPLETED',
    messages: [new AIMessage(responseText)],
  };
}

// ---------------------------------------------------------------------------
// Subgraph factory
// ---------------------------------------------------------------------------

export function buildAccountAccessSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('account_access_node', accountAccessNode)
    .addEdge(START, 'account_access_node')
    .addEdge('account_access_node', END);

  return workflow.compile({ checkpointer });
}
