// src/agents/specialists/profile/profile.ts
// Phase 11: Profile specialist subgraph.
// Phase 26: Rewritten to own the full profile-update verification flow end-to-end.
//
// State machine steps (activeWorkflow.currentStep):
//   collect_value  — waiting for the user to provide the new field value(s)
//   confirm_change — waiting for the user to confirm the normalized value
//   awaiting_code  — code sent; waiting for the 6-digit input
//   <null/other>   — first visit or view_profile path
//
// No Pattern C handoff to Account Access for profile updates.
// Account Access is still invoked for FULL identity verification (get_profile),
// and for standalone verification resuming via isResuming.

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
import { createBlockedResponse } from '../../../state/blocked-workflow.js';
import { recordAgentExecution } from '../../../routing/events.js';
import { formatConversationTranscript } from '../../common/context.js';
import { getProfile, getProfileMetadata } from '../../../tools/queries/profile.tools.js';
import { normalizeName, maskEmail } from '../../../shared/normalization.js';
import {
  issueProfileVerificationCode,
  verifyProfileVerificationCode,
  resendProfileVerificationCode,
  recordDeliveryFailure,
  clearProfileVerification,
  VERIFICATION_TTL_SECONDS,
  RESEND_COOLDOWN_SECONDS,
  FAILURE_COOLDOWN_SECONDS,
} from '../../../services/profile-verification.service.js';
import { sendEmail } from '../../../services/email.service.js';
import { renderVerificationCodeEmail } from '../../../services/email-templates/verification-code.js';
import { getUserById } from '../../../persistence/repositories/marketplace.repository.js';
import { db } from '../../../persistence/db/client.js';
import { users } from '../../../persistence/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { MESSAGES } from './profile-messages.js';

// ---------------------------------------------------------------------------
// Prompt template (5 required sections)
// ---------------------------------------------------------------------------

export const PROFILE_TEMPLATE = {
  sections: {
    Identity: `You are the Profile specialist for an e-commerce customer support platform.
You handle customer profile inquiries and profile update requests (name and address only).`,

    Objective: `Retrieve and display customer profile information accurately, or apply the requested
profile updates exactly as specified. Confirm changes clearly and professionally.`,

    Scope: `IN SCOPE: viewing customer profile details, updating name, updating default shipping address.
OUT OF SCOPE: changing email address (not supported), payment info, order history, returns,
refunds, account security (handled by Account Access specialist).`,

    'Phased-Workflow': `1. Determine whether the customer wants to view their profile or update specific fields.
2. If viewing: retrieve the profile and present it clearly.
3. If updating: collect the new value, confirm with the user, trigger verification, then apply.`,

    Guidelines: `- Never update email — it is immutable per policy.
- Only update fields explicitly mentioned by the customer; never infer or assume changes.
- Normalize names conservatively (preserve McDonald, O'Brien, van der Berg).
- Present profile data cleanly; never expose internal IDs unnecessarily.
- Be concise and professional in all responses.`,
  },
};

// ---------------------------------------------------------------------------
// Zod schemas for LLM extraction
// ---------------------------------------------------------------------------

const ProfileIntentSchema = z.object({
  intent: z.enum(['view_profile', 'update_profile']),
  targetField: z.enum(['name', 'defaultAddress', 'both', 'unknown']).nullable().default(null),
  name: z.string().nullable(),
  defaultAddress: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ProfileIntent = z.infer<typeof ProfileIntentSchema>;

const ConfirmSchema = z.object({
  confirmed: z.boolean(),
  correction: z.string().nullable(),
});

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
  return match ? (match[0] ?? null) : null;
}

export async function extractProfileIntent(
  userText: string,
  contextTranscript?: string
): Promise<ProfileIntent> {
  if (userText.trim().length === 0) {
    return { intent: 'view_profile', targetField: null, name: null, defaultAddress: null, confidence: 0 };
  }

  const transcriptSection =
    contextTranscript && contextTranscript !== 'No prior conversation turns.'
      ? `\nPrior conversation:\n${contextTranscript}\n`
      : '';

  const prompt = `Extract the customer's profile intent from the following message and conversation history.
Determine if they want to VIEW their profile or UPDATE specific fields.
If updating:
- targetField: "name" | "defaultAddress" | "both" | "unknown" (what field they intend to modify)
- name: new name string if provided, else null
- defaultAddress: new default address string if provided, else null
- If the customer specifies a field to change (e.g. "so change the account name") without providing the new value yet, set targetField accordingly and leave name/defaultAddress as null.
${transcriptSection}
Customer message: "${userText}"

Respond with JSON:
{
  "intent": "view_profile" | "update_profile",
  "targetField": "name" | "defaultAddress" | "both" | "unknown" | null,
  "name": "<new name or null>",
  "defaultAddress": "<new default address or null>",
  "confidence": <0.0-1.0>
}`;

  const result = await generateStructuredOutput(ProfileIntentSchema, prompt, {
    temperature: 0.0,
  });

  if (result.success) {
    return result.data;
  }

  return { intent: 'view_profile', targetField: null, name: null, defaultAddress: null, confidence: 0 };
}

export async function extractConfirmation(
  userText: string
): Promise<{ confirmed: boolean; correction: string | null }> {
  const lower = userText.toLowerCase().trim();
  // Fast heuristic
  if (/^(yes|yeah|yep|correct|confirm|ok|okay|sure|proceed)/.test(lower)) {
    return { confirmed: true, correction: null };
  }
  if (/^(no|nope|wrong|incorrect|actually|wait)/.test(lower)) {
    return { confirmed: false, correction: userText };
  }

  const prompt = `The customer was asked to confirm a profile change.
Customer reply: "${userText}"

Is this a confirmation (yes) or a correction (no)?
If a correction, extract the corrected value they want to use.

Respond with JSON:
{
  "confirmed": true | false,
  "correction": "<corrected value or null if confirmed>"
}`;

  const result = await generateStructuredOutput(ConfirmSchema, prompt, { temperature: 0.0 });
  if (result.success) return result.data;
  return { confirmed: false, correction: userText };
}

export async function generateProfileViewResponse(params: {
  profile: { name: string; email: string; defaultAddress: string };
  userText: string;
}): Promise<string> {
  const { profile, userText } = params;
  const basePrompt = loadPrompt(PROFILE_TEMPLATE, {});

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Customer Profile\nName: ${profile.name}\nEmail: ${profile.email}\nDefault Address: ${profile.defaultAddress}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Present the customer's profile information clearly and professionally.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  return `Here is your current profile:\n- Name: ${profile.name}\n- Email: ${profile.email}\n- Default Address: ${profile.defaultAddress}`;
}

async function createAgentExecutionSafely(
  conversationId: string | undefined,
  agent: 'profile'
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

/** Issue + email a profile verification code. Returns a user-facing message. */
async function issueAndSendCode(params: {
  userId: string;
  userName: string;
  userEmail: string;
  pendingName?: string;
  pendingAddress?: string;
  field: 'name' | 'defaultAddress' | 'both';
  originalSnapshot: { name: string; defaultAddress: string };
}): Promise<{ message: string; sent: boolean; resendAfterSeconds: number }> {
  const { userId, userName, userEmail, pendingName, pendingAddress, field, originalSnapshot } = params;

  const issueResult = await issueProfileVerificationCode(userId, {
    field,
    name: pendingName,
    defaultAddress: pendingAddress,
    originalSnapshot,
  });

  if (!issueResult.success) {
    if (issueResult.error.code === 'RESEND_COOLDOWN') {
      return {
        message: MESSAGES.COOLDOWN_ACTIVE(issueResult.error.retryAfterSeconds),
        sent: false,
        resendAfterSeconds: issueResult.error.retryAfterSeconds,
      };
    }
    return {
      message: MESSAGES.SERVICE_UNAVAILABLE,
      sent: false,
      resendAfterSeconds: 0,
    };
  }

  const { code, resendAfter } = issueResult.data;
  const ttlMinutes = Math.round(VERIFICATION_TTL_SECONDS / 60);
  const emailContent = renderVerificationCodeEmail({ name: userName, code, ttlMinutes });

  const sendResult = await sendEmail({
    to: userEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  if (!sendResult.success) {
    await recordDeliveryFailure(userId);
    const maskedEmail = maskEmail(userEmail);
    return {
      message: MESSAGES.SEND_FAILED(maskedEmail, FAILURE_COOLDOWN_SECONDS),
      sent: false,
      resendAfterSeconds: FAILURE_COOLDOWN_SECONDS,
    };
  }

  const maskedEmail = maskEmail(userEmail);
  return {
    message: MESSAGES.CODE_SENT(maskedEmail, ttlMinutes, resendAfter),
    sent: true,
    resendAfterSeconds: resendAfter,
  };
}

// ---------------------------------------------------------------------------
// Main Profile Node
// ---------------------------------------------------------------------------

export async function profileNode(
  state: ConversationState,
  config?: RunnableConfig
): Promise<ConversationStateUpdate> {
  const specialist = 'profile' as const;
  const conversationId =
    typeof config?.configurable?.['conversationId'] === 'string'
      ? config.configurable['conversationId']
      : typeof config?.configurable?.['thread_id'] === 'string'
        ? config.configurable['thread_id']
        : undefined;

  const agentExecutionId = await createAgentExecutionSafely(conversationId, specialist);

  if (!state.user?.id) {
    return {
      workflowStatus: 'FAILED',
      messages: [
        new AIMessage(
          'I am unable to access your profile because your session could not be identified. Please try again.'
        ),
      ],
    };
  }

  const userId = state.user.id;
  const userText = extractLastUserText(state);
  const currentStep = state.activeWorkflow?.currentStep ?? null;

  // ──────────────────────────────────────────────────────────────────────────
  // BRANCH A: Resuming from Account Access verification (Pattern C, get_profile)
  // The identity status is VERIFIED and returnTo points here — this is the
  // legacy path for view_profile + FULL verification.
  // ──────────────────────────────────────────────────────────────────────────
  const isResuming =
    state.activeWorkflow?.returnTo?.agent === specialist &&
    state.activeWorkflow.resumeContext !== null &&
    state.activeWorkflow.resumeContext !== undefined &&
    state.identity?.status === 'VERIFIED';

  if (isResuming) {
    const ctx = state.activeWorkflow?.resumeContext as Record<string, unknown>;
    if (ctx['intent'] === 'view_profile') {
      const profileResult = await gatedExecuteTool(
        getProfile,
        getProfileMetadata,
        { userId },
        { agentExecutionId, specialist, identity: state.identity }
      );
      if (!profileResult.success) {
        return {
          workflowStatus: 'FAILED',
          messages: [new AIMessage('I encountered an error retrieving your profile. Please try again shortly.')],
        };
      }
      const profile = profileResult.data;
      const responseText = await generateProfileViewResponse({
        profile: { name: profile.name, email: profile.email, defaultAddress: profile.defaultAddress },
        userText,
      });
      return {
        workflowStatus: 'COMPLETED',
        activeWorkflow: null,
        messages: [new AIMessage(responseText)],
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BRANCH B: awaiting_code — user is responding to a code prompt
  // ──────────────────────────────────────────────────────────────────────────
  if (currentStep === 'awaiting_code') {
    const ctx = (state.activeWorkflow?.resumeContext ?? {}) as Record<string, unknown>;
    const field = (ctx['field'] as 'name' | 'defaultAddress' | 'both') ?? 'name';
    const pendingName = typeof ctx['pendingName'] === 'string' ? ctx['pendingName'] : undefined;
    const pendingAddress = typeof ctx['pendingAddress'] === 'string' ? ctx['pendingAddress'] : undefined;
    const originalSnapshot = (ctx['originalSnapshot'] as { name: string; defaultAddress: string }) ?? {
      name: '',
      defaultAddress: '',
    };

    // Check if user wants to resend
    const wantsResend = /\b(resend|send again|new code|another code)\b/i.test(userText);

    if (wantsResend) {
      const freshUser = await getUserById(userId);
      if (!freshUser?.email) {
        return {
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(MESSAGES.NO_EMAIL_ON_FILE)],
        };
      }

      // Try resend via service (resets attempts to 0)
      const resendResult = await resendProfileVerificationCode(userId);
      if (!resendResult.success) {
        if (resendResult.error.code === 'RESEND_COOLDOWN') {
          return {
            activeWorkflow: state.activeWorkflow,
            workflowStatus: 'WAITING_FOR_USER_INPUT',
            messages: [new AIMessage(MESSAGES.COOLDOWN_ACTIVE(
              'retryAfterSeconds' in resendResult.error ? resendResult.error.retryAfterSeconds : RESEND_COOLDOWN_SECONDS
            ))],
          };
        }
        // No session found — issue fresh
        const { message } = await issueAndSendCode({
          userId,
          userName: freshUser.name,
          userEmail: freshUser.email,
          pendingName,
          pendingAddress,
          field,
          originalSnapshot,
        });
        return {
          activeWorkflow: {
            workflowId: state.activeWorkflow?.workflowId ?? null,
            originatingIntent: state.activeWorkflow?.originatingIntent ?? state.currentIntent,
            blockedBy: state.activeWorkflow?.blockedBy ?? null,
            returnTo: state.activeWorkflow?.returnTo ?? null,
            resumeContext: state.activeWorkflow?.resumeContext ?? null,
            currentStep: 'awaiting_code',
          },
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(message)],
        };
      }

      // Re-send new code
      const { code, resendAfter } = resendResult.data;
      const ttlMinutes = Math.round(VERIFICATION_TTL_SECONDS / 60);
      const emailContent = renderVerificationCodeEmail({ name: freshUser.name, code, ttlMinutes });
      const sendResult = await sendEmail({
        to: freshUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (!sendResult.success) {
        await recordDeliveryFailure(userId);
        return {
          activeWorkflow: state.activeWorkflow,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(MESSAGES.SEND_FAILED(maskEmail(freshUser.email), FAILURE_COOLDOWN_SECONDS))],
        };
      }

      return {
        activeWorkflow: state.activeWorkflow,
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [new AIMessage(MESSAGES.CODE_SENT(maskEmail(freshUser.email), ttlMinutes, resendAfter))],
      };
    }

    // Extract 6-digit code
    const submittedCode = extractSixDigitCode(userText);
    if (!submittedCode) {
      return {
        activeWorkflow: state.activeWorkflow,
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [new AIMessage(MESSAGES.ENTER_CODE_PROMPT)],
      };
    }

    const verifyResult = await verifyProfileVerificationCode(userId, submittedCode);

    if (!verifyResult.success) {
      if (verifyResult.status === 'SERVICE_UNAVAILABLE') {
        return {
          activeWorkflow: state.activeWorkflow,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(MESSAGES.SERVICE_UNAVAILABLE)],
        };
      }

      if (verifyResult.status === 'INVALID') {
        return {
          activeWorkflow: state.activeWorkflow,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(MESSAGES.CODE_INVALID(verifyResult.remainingAttempts))],
        };
      }

      if (verifyResult.status === 'TOO_MANY_ATTEMPTS') {
        // Auto-resend fresh code (resets attempts to 0)
        const freshUser = await getUserById(userId);
        if (freshUser?.email) {
          const { message } = await issueAndSendCode({
            userId,
            userName: freshUser.name,
            userEmail: freshUser.email,
            pendingName,
            pendingAddress,
            field,
            originalSnapshot,
          });
          return {
            activeWorkflow: state.activeWorkflow,
            workflowStatus: 'WAITING_FOR_USER_INPUT',
            messages: [new AIMessage(`${MESSAGES.TOO_MANY_ATTEMPTS}\n\n${message}`)],
          };
        }
        return {
          activeWorkflow: state.activeWorkflow,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(MESSAGES.TOO_MANY_ATTEMPTS + ' Please contact support if this persists.')],
        };
      }

      if (verifyResult.status === 'EXPIRED') {
        // Auto-resend fresh code
        const freshUser = await getUserById(userId);
        if (freshUser?.email) {
          const { message } = await issueAndSendCode({
            userId,
            userName: freshUser.name,
            userEmail: freshUser.email,
            pendingName,
            pendingAddress,
            field,
            originalSnapshot,
          });
          return {
            activeWorkflow: state.activeWorkflow,
            workflowStatus: 'WAITING_FOR_USER_INPUT',
            messages: [new AIMessage(`${MESSAGES.CODE_EXPIRED}\n\n${message}`)],
          };
        }
        return {
          activeWorkflow: state.activeWorkflow,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage(MESSAGES.CODE_EXPIRED + ' Please contact support if this persists.')],
        };
      }

      // NOT_FOUND / INVALID_STATE
      return {
        activeWorkflow: state.activeWorkflow,
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [new AIMessage(MESSAGES.NOT_FOUND)],
      };
    }

    // ── Code correct — apply conditional DB update ──────────────────────────
    const setFields: { name?: string; defaultAddress?: string } = {};
    const updatedFieldNames: string[] = [];

    if (field !== 'defaultAddress' && pendingName !== undefined) {
      setFields.name = pendingName;
      updatedFieldNames.push('name');
    }
    if (field !== 'name' && pendingAddress !== undefined) {
      setFields.defaultAddress = pendingAddress;
      updatedFieldNames.push('defaultAddress');
    }

    const updateResult = await db
      .update(users)
      .set(setFields)
      .where(
        and(
          eq(users.id, userId),
          eq(users.name, originalSnapshot.name),
          eq(users.defaultAddress, originalSnapshot.defaultAddress),
        )
      )
      .returning();

    await clearProfileVerification(userId);

    if (updateResult.length === 0) {
      return {
        workflowStatus: 'FAILED',
        activeWorkflow: null,
        messages: [new AIMessage(MESSAGES.CONFLICT)],
      };
    }

    const updated = updateResult[0] as NonNullable<typeof updateResult[0]>;
    return {
      workflowStatus: 'COMPLETED',
      activeWorkflow: null,
      messages: [new AIMessage(MESSAGES.UPDATE_SUCCESS(updated.name, updated.defaultAddress, updatedFieldNames))],
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BRANCH C: confirm_change — waiting for user to say yes/no
  // ──────────────────────────────────────────────────────────────────────────
  if (currentStep === 'confirm_change') {
    const ctx = (state.activeWorkflow?.resumeContext ?? {}) as Record<string, unknown>;
    const field = (ctx['field'] as 'name' | 'defaultAddress' | 'both') ?? 'name';
    const pendingName = typeof ctx['pendingName'] === 'string' ? ctx['pendingName'] : undefined;
    const pendingAddress = typeof ctx['pendingAddress'] === 'string' ? ctx['pendingAddress'] : undefined;
    const originalSnapshot = (ctx['originalSnapshot'] as { name: string; defaultAddress: string }) ?? {
      name: '',
      defaultAddress: '',
    };

    const { confirmed, correction } = await extractConfirmation(userText);

    if (!confirmed) {
      // User provided a correction — normalize and re-confirm
      const correctionText = correction ?? userText;
      let correctedName = pendingName;
      let correctedAddress = pendingAddress;

      if (field !== 'defaultAddress') {
        const norm = normalizeName(correctionText);
        if (norm.isValid) correctedName = norm.normalized;
      } else {
        correctedAddress = correctionText.trim().replace(/\s+/g, ' ');
      }

      const displayField = field === 'name' ? 'name' : field === 'defaultAddress' ? 'default shipping address' : 'name and address';
      const displayValue = field === 'name'
        ? (correctedName ?? correctionText)
        : field === 'defaultAddress'
          ? (correctedAddress ?? correctionText)
          : `name: ${correctedName ?? ''}, address: ${correctedAddress ?? ''}`;

      return {
        activeWorkflow: {
          workflowId: state.activeWorkflow?.workflowId ?? null,
          originatingIntent: state.activeWorkflow?.originatingIntent ?? state.currentIntent,
          blockedBy: state.activeWorkflow?.blockedBy ?? null,
          returnTo: state.activeWorkflow?.returnTo ?? null,
          currentStep: 'confirm_change',
          resumeContext: {
            field,
            pendingName: correctedName,
            pendingAddress: correctedAddress,
            originalSnapshot,
          },
        },
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [new AIMessage(MESSAGES.CONFIRM_CHANGE(displayValue, correctionText, displayField))],
      };
    }

    // User confirmed — check email and send code
    const freshUser = await getUserById(userId);
    if (!freshUser?.email) {
      return {
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [new AIMessage(MESSAGES.NO_EMAIL_ON_FILE)],
      };
    }

    // No-change guard
    const nameUnchanged = field === 'defaultAddress' || freshUser.name === pendingName;
    const addressUnchanged = field === 'name' || freshUser.defaultAddress === pendingAddress;
    if (nameUnchanged && addressUnchanged) {
      return {
        workflowStatus: 'COMPLETED',
        activeWorkflow: null,
        messages: [new AIMessage("That value is the same as what's already on your profile — no changes were made.")],
      };
    }

    const { message } = await issueAndSendCode({
      userId,
      userName: freshUser.name,
      userEmail: freshUser.email,
      pendingName,
      pendingAddress,
      field,
      originalSnapshot,
    });

    return {
      activeWorkflow: {
        workflowId: state.activeWorkflow?.workflowId ?? null,
        originatingIntent: state.activeWorkflow?.originatingIntent ?? state.currentIntent,
        currentStep: 'awaiting_code',
        blockedBy: null,
        returnTo: null,
        resumeContext: { field, pendingName, pendingAddress, originalSnapshot },
      },
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [new AIMessage(message)],
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BRANCH D: collect_value — waiting for user to give us the new value
  // ──────────────────────────────────────────────────────────────────────────
  if (currentStep === 'collect_value') {
    const ctx = (state.activeWorkflow?.resumeContext ?? {}) as Record<string, unknown>;
    const field = (ctx['field'] as 'name' | 'defaultAddress' | 'both') ?? 'name';
    const originalSnapshot = (ctx['originalSnapshot'] as { name: string; defaultAddress: string }) ?? {
      name: '',
      defaultAddress: '',
    };

    let pendingName: string | undefined;
    let pendingAddress: string | undefined;
    let displayValue: string;
    let rawInput = userText;

    if (field === 'name' || field === 'both') {
      const norm = normalizeName(userText);
      if (!norm.isValid) {
        return {
          activeWorkflow: state.activeWorkflow,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new AIMessage("That doesn't look like a valid name (must be between 2 and 100 characters). Please try again.")],
        };
      }
      pendingName = norm.normalized;
      displayValue = norm.normalized;
      rawInput = norm.raw;
    } else {
      pendingAddress = userText.trim().replace(/\s+/g, ' ');
      displayValue = pendingAddress;
    }

    const displayField = field === 'name' ? 'name' : field === 'defaultAddress' ? 'default shipping address' : 'name';

    return {
      activeWorkflow: {
        workflowId: state.activeWorkflow?.workflowId ?? null,
        originatingIntent: state.activeWorkflow?.originatingIntent ?? state.currentIntent,
        currentStep: 'confirm_change',
        blockedBy: null,
        returnTo: null,
        resumeContext: { field, pendingName, pendingAddress, originalSnapshot },
      },
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [new AIMessage(MESSAGES.CONFIRM_CHANGE(displayValue, rawInput, displayField))],
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BRANCH E: First visit — classify intent
  // ──────────────────────────────────────────────────────────────────────────
  const transcript = formatConversationTranscript(state.messages, 6);
  const intentExtraction = await extractProfileIntent(userText, transcript);
  const { intent, targetField, name: extractedName, defaultAddress: extractedAddress } = intentExtraction;

  // ── View profile path ────────────────────────────────────────────────────
  if (intent === 'view_profile') {
    const profileResult = await gatedExecuteTool(
      getProfile,
      getProfileMetadata,
      { userId },
      { agentExecutionId, specialist, identity: state.identity }
    );

    if (profileResult.gate.outcome === 'BLOCKED') {
      const returnTo: ReturnTo = {
        domain: specialist,
        agent: specialist,
        workflowStep: 'get_profile',
      };
      return createBlockedResponse(
        {
          decision: profileResult.gate,
          returnTo,
          workflowId: null,
          originatingIntent: state.currentIntent,
          currentStep: 'verify_identity',
          resumeContext: { userId, intent: 'view_profile' },
        },
        'To view your profile, we need to verify your identity first. Please wait while I send a verification code to your email.'
      );
    }

    if (profileResult.gate.outcome === 'DENIED') {
      return {
        workflowStatus: 'FAILED',
        messages: [new AIMessage('I am not permitted to retrieve profile information.')],
      };
    }

    if (!profileResult.success) {
      return {
        workflowStatus: 'FAILED',
        messages: [
          new AIMessage(
            profileResult.error.code === 'NOT_FOUND'
              ? 'I could not find your profile. Please contact support.'
              : 'I encountered an error retrieving your profile. Please try again shortly.'
          ),
        ],
      };
    }

    const profile = profileResult.data;
    const responseText = await generateProfileViewResponse({
      profile: { name: profile.name, email: profile.email, defaultAddress: profile.defaultAddress },
      userText,
    });

    return {
      workflowStatus: 'COMPLETED',
      activeWorkflow: null,
      messages: [new AIMessage(responseText)],
    };
  }

  // ── Update profile path ───────────────────────────────────────────────────

  // If the user gave us a value already in this message, skip collect_value
  const hasName = typeof extractedName === 'string' && extractedName.trim().length > 0;
  const hasAddress = typeof extractedAddress === 'string' && extractedAddress.trim().length > 0;
  const resolvedField: 'name' | 'defaultAddress' | 'both' =
    hasName && hasAddress ? 'both' :
    hasName ? 'name' :
    hasAddress ? 'defaultAddress' :
    targetField && targetField !== 'unknown' ? (targetField as 'name' | 'defaultAddress' | 'both') :
    'name'; // default to asking for name

  if (!hasName && !hasAddress) {
    // Need to ask for the value
    const freshUser = await getUserById(userId);
    const snap = {
      name: freshUser?.name ?? '',
      defaultAddress: freshUser?.defaultAddress ?? '',
    };

    let promptMessage: string;
    if (targetField === 'name') {
      promptMessage = MESSAGES.ASK_FOR_NAME;
    } else if (targetField === 'defaultAddress') {
      promptMessage = MESSAGES.ASK_FOR_ADDRESS;
    } else {
      promptMessage = MESSAGES.ASK_WHAT_TO_CHANGE;
    }

    return {
      activeWorkflow: {
        workflowId: null,
        originatingIntent: state.currentIntent,
        currentStep: 'collect_value',
        blockedBy: null,
        returnTo: null,
        resumeContext: { field: resolvedField !== 'name' && targetField && targetField !== 'unknown' ? targetField : (resolvedField), originalSnapshot: snap },
      },
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [new AIMessage(promptMessage)],
    };
  }

  // We have a value — normalize and confirm
  const freshUser = await getUserById(userId);
  const originalSnapshot = {
    name: freshUser?.name ?? '',
    defaultAddress: freshUser?.defaultAddress ?? '',
  };

  let pendingName: string | undefined;
  let pendingAddress: string | undefined;
  let displayValue: string;
  let rawInput: string;

  if (hasName) {
    const norm = normalizeName(extractedName ?? '');
    if (!norm.isValid) {
      return {
        workflowStatus: 'WAITING_FOR_USER_INPUT',
        messages: [new AIMessage("That doesn't look like a valid name. Please provide a name between 2 and 100 characters.")],
      };
    }
    pendingName = norm.normalized;
    displayValue = norm.normalized;
    rawInput = norm.raw;
  } else {
    pendingAddress = (extractedAddress ?? '').trim().replace(/\s+/g, ' ');
    displayValue = pendingAddress;
    rawInput = extractedAddress ?? '';
  }

  const displayField = resolvedField === 'name' ? 'name' : resolvedField === 'defaultAddress' ? 'default shipping address' : 'name';

  return {
    activeWorkflow: {
      workflowId: null,
      originatingIntent: state.currentIntent,
      currentStep: 'confirm_change',
      blockedBy: null,
      returnTo: null,
      resumeContext: { field: resolvedField, pendingName, pendingAddress, originalSnapshot },
    },
    workflowStatus: 'WAITING_FOR_USER_INPUT',
    messages: [new AIMessage(MESSAGES.CONFIRM_CHANGE(displayValue, rawInput, displayField))],
  };
}

// ---------------------------------------------------------------------------
// Subgraph factory
// ---------------------------------------------------------------------------

export function buildProfileSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('profile_node', profileNode)
    .addEdge(START, 'profile_node')
    .addEdge('profile_node', END);

  return workflow.compile({ checkpointer });
}
