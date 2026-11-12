// src/agents/specialists/profile/profile.ts
// Phase 11: Profile specialist subgraph.
// Handles Scenario — view profile (get_profile, FULL-gated) and update profile
// (update_profile, FULL-gated, name/defaultAddress only). No RAG access.
// On FULL verification block → Pattern C activeWorkflow pointing to Account Access.

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
import { updateProfile, updateProfileMetadata } from '../../../tools/mutations/profile.tools.js';

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
3. If updating: identify the fields to change (name and/or defaultAddress) from the customer message.
4. Execute the appropriate tool (requires identity verification).
5. Confirm the outcome or explain any issue encountered.`,

    Guidelines: `- Never update email — it is immutable per policy.
- Only update fields explicitly mentioned by the customer; never infer or assume changes.
- If verification is required and not yet satisfied, the system will route the customer
  through verification automatically.
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

export async function generateProfileUpdateResponse(params: {
  updatedProfile: { name: string; email: string; defaultAddress: string };
  changedFields: string[];
  userText: string;
}): Promise<string> {
  const { updatedProfile, changedFields, userText } = params;
  const basePrompt = loadPrompt(PROFILE_TEMPLATE, {});

  const contextPrompt =
    `${basePrompt}\n\n` +
    `## Updated Profile\nName: ${updatedProfile.name}\nEmail: ${updatedProfile.email}\nDefault Address: ${updatedProfile.defaultAddress}\n\n` +
    `## Fields Changed\n${changedFields.join(', ')}\n\n` +
    `## Customer Message\n"${userText}"\n\n` +
    `Confirm the profile update was successful and summarize what changed.`;

  const ResponseSchema = z.object({ response: z.string().min(1) });
  const llmResult = await generateStructuredOutput(ResponseSchema, contextPrompt, {
    temperature: 0.2,
  });

  if (llmResult.success) {
    return llmResult.data.response;
  }

  return `Your profile has been updated successfully. Changed: ${changedFields.join(', ')}.`;
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

  // 1. Require a user in state (should always be present in a real conversation)
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

  // 2. Resolve intent (check resumeContext first if resuming from verification, else extract from user message)
  let intent: 'view_profile' | 'update_profile';
  let targetField: 'name' | 'defaultAddress' | 'both' | 'unknown' | null = null;
  let newName: string | undefined = undefined;
  let newDefaultAddress: string | undefined = undefined;

  const isResuming =
    state.activeWorkflow?.returnTo?.agent === specialist &&
    state.activeWorkflow.resumeContext !== null &&
    state.activeWorkflow.resumeContext !== undefined &&
    state.identity?.status === 'VERIFIED';

  if (isResuming) {
    const activeWf = state.activeWorkflow as NonNullable<typeof state.activeWorkflow>;
    const ctx = activeWf.resumeContext as Record<string, unknown>;
    if (ctx['intent'] === 'update_profile') {
      intent = 'update_profile';
      if (typeof ctx['name'] === 'string') newName = ctx['name'];
      if (typeof ctx['defaultAddress'] === 'string') newDefaultAddress = ctx['defaultAddress'];
    } else {
      intent = 'view_profile';
    }
  } else {
    const transcript = formatConversationTranscript(state.messages, 6);
    const intentExtraction = await extractProfileIntent(userText, transcript);
    intent = intentExtraction.intent;
    targetField = intentExtraction.targetField ?? null;
    newName = intentExtraction.name ?? undefined;
    newDefaultAddress = intentExtraction.defaultAddress ?? undefined;
  }

  // ---------------------------------------------------------------------------
  // 3a. VIEW PROFILE path
  // ---------------------------------------------------------------------------
  if (intent === 'view_profile') {
    const profileResult = await gatedExecuteTool(
      getProfile,
      getProfileMetadata,
      { userId },
      {
        agentExecutionId,
        specialist,
        identity: state.identity,
      }
    );

    if (profileResult.gate.outcome === 'BLOCKED') {
      // Pattern C: needs FULL verification → route to Account Access
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
        'To access your profile, we need to verify your identity first. Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
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
      profile: {
        name: profile.name,
        email: profile.email,
        defaultAddress: profile.defaultAddress,
      },
      userText,
    });

    return {
      workflowStatus: 'COMPLETED',
      activeWorkflow: null,
      messages: [new AIMessage(responseText)],
    };
  }

  // ---------------------------------------------------------------------------
  // 3b. UPDATE PROFILE path
  // ---------------------------------------------------------------------------

  // If nothing to update was extracted, ask the customer what they want to change
  if (newName === undefined && newDefaultAddress === undefined) {
    const wantsName = targetField === 'name' || /\bname\b/i.test(userText);
    const wantsAddress = targetField === 'defaultAddress' || /\b(address|shipping)\b/i.test(userText);

    let messageText: string;
    if (wantsName && !wantsAddress) {
      messageText =
        "I'd be happy to update your name. What new name would you like to set on your profile?";
    } else if (wantsAddress && !wantsName) {
      messageText =
        "I'd be happy to update your shipping address. What new address would you like to set?";
    } else {
      messageText =
        "I'd be happy to update your profile. Could you please tell me what you'd like to change — your name or your default shipping address?";
    }

    return {
      workflowStatus: 'WAITING_FOR_USER_INPUT',
      messages: [new AIMessage(messageText)],
    };
  }

  const updateInput: { userId: string; name?: string; defaultAddress?: string } = { userId };
  if (newName !== undefined) updateInput.name = newName;
  if (newDefaultAddress !== undefined) updateInput.defaultAddress = newDefaultAddress;

  const updateResult = await gatedExecuteTool(
    updateProfile,
    updateProfileMetadata,
    updateInput,
    {
      agentExecutionId,
      specialist,
      identity: state.identity,
    }
  );

  if (updateResult.gate.outcome === 'BLOCKED') {
    // Pattern C: needs FULL verification → route to Account Access
    const returnTo: ReturnTo = {
      domain: specialist,
      agent: specialist,
      workflowStep: 'update_profile',
    };
    return createBlockedResponse(
      {
        decision: updateResult.gate,
        returnTo,
        workflowId: null,
        originatingIntent: state.currentIntent,
        currentStep: 'verify_identity',
        resumeContext: { userId, intent: 'update_profile', name: newName ?? null, defaultAddress: newDefaultAddress ?? null },
      },
      'To update your profile, we need to verify your identity first. Please request a verification code to receive a 6-digit code via email, or enter your code if you already have one.'
    );
  }

  if (updateResult.gate.outcome === 'DENIED') {
    return {
      workflowStatus: 'FAILED',
      messages: [new AIMessage('I am not permitted to update profile information.')],
    };
  }

  if (!updateResult.success) {
    return {
      workflowStatus: 'FAILED',
      messages: [
        new AIMessage(
          `Unable to update profile: ${updateResult.error.message || 'unknown error'}`
        ),
      ],
    };
  }

  const changedFields: string[] = [];
  if (newName !== undefined) changedFields.push('name');
  if (newDefaultAddress !== undefined) changedFields.push('defaultAddress');

  const updatedProfile = updateResult.data;
  const responseText = await generateProfileUpdateResponse({
    updatedProfile: {
      name: updatedProfile.name,
      email: updatedProfile.email,
      defaultAddress: updatedProfile.defaultAddress,
    },
    changedFields,
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

export function buildProfileSubgraph(checkpointer?: BaseCheckpointSaver) {
  const workflow = new StateGraph(ConversationStateAnnotation)
    .addNode('profile_node', profileNode)
    .addEdge(START, 'profile_node')
    .addEdge('profile_node', END);

  return workflow.compile({ checkpointer });
}
