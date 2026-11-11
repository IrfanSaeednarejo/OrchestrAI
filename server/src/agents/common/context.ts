// src/agents/common/context.ts
// Phase 24 Step 3: Shared context formatting helpers.
// Provides bounded conversation transcript and entity memory summaries for
// injection into the Master Router classifier and domain specialist prompts.

import type { BaseMessage } from '@langchain/core/messages';
import type { LastKnownEntities, PendingTaskState } from '../../state/conversation-state.js';

/**
 * Formats the last N messages into a concise transcript string for prompt injection.
 * Filters out empty messages and prefixes each turn with Customer or Assistant.
 */
export function formatConversationTranscript(
  messages: BaseMessage[] = [],
  limit = 6
): string {
  if (!messages || messages.length === 0) {
    return 'No prior conversation turns.';
  }

  const recent = messages.slice(-limit);
  const lines: string[] = [];

  for (const msg of recent) {
    const text = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!text) continue;

    const role =
      msg._getType() === 'human'
        ? 'Customer'
        : msg._getType() === 'ai'
          ? 'Assistant'
          : 'System';

    lines.push(`${role}: "${text}"`);
  }

  if (lines.length === 0) {
    return 'No prior conversation turns.';
  }

  return lines.join('\n');
}

/**
 * Formats last known entity memory into a concise prompt block.
 */
export function formatEntityContext(
  entities?: LastKnownEntities | null
): string {
  if (!entities) {
    return 'None recorded.';
  }

  const items: string[] = [];
  if (entities.orderId) items.push(`orderId: ${entities.orderId}`);
  if (entities.paymentId) items.push(`paymentId: ${entities.paymentId}`);
  if (entities.returnId) items.push(`returnId: ${entities.returnId}`);

  if (items.length === 0) {
    return 'None recorded.';
  }

  return items.join(', ');
}

/**
 * Formats the active pending task for prompt context.
 */
export function formatPendingTaskContext(
  pendingTask?: PendingTaskState | null
): string {
  if (!pendingTask) {
    return 'No pending task.';
  }

  return `Specialist "${pendingTask.specialist}" is currently awaiting "${pendingTask.awaitingField}".`;
}

