// src/api/controllers/message.controller.ts
// Phase 16: Controller handling dual-mode message dispatch (JSON and SSE streaming).
// Phase 17 Step 1b: Turn-scoped extraction, abort resilience, blockedBy/currentStep telemetry,
//                   explicit streamMode: 'updates', 502/error-event on empty assistant reply.
// Phase 23: Extract service options from AIMessage.additional_kwargs and forward in SSE routing event.

import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import {
  getConversationById,
  createMessage,
} from '../../persistence/repositories/conversation.repository.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import { buildParentGraph } from '../../graphs/parent/parent-graph.js';
import { createTraceConfig } from '../../observability/tracer.js';
import type { ConversationState, IdentityState } from '../../state/conversation-state.js';
import { resolveSessionIdentity } from '../../state/session-identity.js';
import { pgPool } from '../../persistence/db/client.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../errors/app-error.js';
import { assertConversationOwnership } from '../utils/auth-helpers.js';
import type { ServiceOption } from '../../graphs/parent/parent-graph.js';

// ---------------------------------------------------------------------------
// Graph singleton
// ---------------------------------------------------------------------------

let defaultGraph: ReturnType<typeof buildParentGraph> | null = null;

export function getParentGraph(
  customGraph?: ReturnType<typeof buildParentGraph>
): ReturnType<typeof buildParentGraph> {
  if (customGraph) return customGraph;
  if (!defaultGraph) {
    defaultGraph = buildParentGraph(checkpointer);
  }
  return defaultGraph;
}

// ---------------------------------------------------------------------------
// Turn-scoped assistant message extraction (Phase 17 Step 1b)
// ---------------------------------------------------------------------------

/**
 * Returns the last non-empty 'ai' message produced AFTER the human message
 * identified by `humanMessageId`. Prevents cross-turn bleed and duplicate
 * assistant rows in the DB.
 *
 * Returns null when no qualifying message exists (caller must 502 / emit error).
 */
function extractTurnAssistantText(
  messages: BaseMessage[] | undefined,
  humanMessageId: string
): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  // Find the index of THIS turn's human message by its explicit id
  const pivotIndex = messages.findIndex(
    (m) => m.getType() === 'human' && m.id === humanMessageId
  );

  if (pivotIndex === -1) {
    // Human message not found in state (edge case: shouldn't happen)
    return null;
  }

  // Collect only 'ai' messages that appear after the pivot
  let lastAiContent: string | null = null;
  for (let i = pivotIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const isAi = msg instanceof AIMessage || msg.getType() === 'ai';
    if (isAi && typeof msg.content === 'string' && msg.content.trim() !== '') {
      lastAiContent = msg.content;
    }
  }

  return lastAiContent;
}

/**
 * Extracts service options embedded in `additional_kwargs.options` of the last
 * AI message produced after the pivot. Returns null if none present.
 * This is the transport mechanism for Phase 23 interactive service options.
 */
function extractTurnServiceOptions(
  messages: BaseMessage[] | undefined,
  humanMessageId: string
): ServiceOption[] | null {
  if (!Array.isArray(messages)) return null;

  const pivotIndex = messages.findIndex(
    (m) => m.getType() === 'human' && m.id === humanMessageId
  );
  if (pivotIndex === -1) return null;

  let lastOptions: ServiceOption[] | null = null;
  for (let i = pivotIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const isAi = msg instanceof AIMessage || msg.getType() === 'ai';
    if (isAi) {
      const raw = (msg as AIMessage).additional_kwargs?.['options'];
      if (Array.isArray(raw) && raw.length > 0) {
        lastOptions = raw as ServiceOption[];
      }
    }
  }
  return lastOptions;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function sendMessageHandler(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!conversationId) {
    throw new NotFoundError('Conversation ID is required');
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation with id "${conversationId}" not found`);
  }

  assertConversationOwnership(conversation, req.user);

  const callerId = req.user?.id;
  if (!callerId) {
    throw new UnauthorizedError('User identity could not be resolved');
  }

  // Step 6: Acquire PostgreSQL advisory lock on conversationId to serialize turns
  const dbClient = await pgPool.connect();
  let inTransaction = false;

  try {
    await dbClient.query('BEGIN');
    inTransaction = true;
    const lockResult = await dbClient.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) as acquired',
      [conversationId]
    );
    const lockAcquired = lockResult.rows[0]?.acquired ?? false;
    if (!lockAcquired) {
      await dbClient.query('ROLLBACK');
      inTransaction = false;
      throw new ConflictError(
        'Another message is currently being processed for this conversation. Please wait.'
      );
    }

    const { content } = req.body as { content: string };

    // 1. HARD RULE: Persist human message to Postgres BEFORE invoking the graph.
    //    Give it an explicit id so we can identify THIS turn's boundary in state.
    const humanMessageId = randomUUID();
    await createMessage({
      conversationId,
      role: 'user',
      content,
    });

    const graph = getParentGraph(req.app?.locals?.graph);

    const traceConfig = createTraceConfig({
      conversationId,
      threadId: conversationId,
      userId: callerId,
      level: 'conversation',
      environment: process.env.NODE_ENV || 'development',
    });

    const humanMessage = new HumanMessage({ content, id: humanMessageId });

    let currentIdentity: IdentityState | null | undefined;
    try {
      const currentSnapshot = await graph.getState(traceConfig);
      currentIdentity = (currentSnapshot?.values as ConversationState | undefined)?.identity;
    } catch {
      currentIdentity = null;
    }

    const resolvedIdentity = resolveSessionIdentity(req.authMethod, currentIdentity);

    const isSSE = req.headers.accept?.includes('text/event-stream');

    if (isSSE) {
      // -------------------------------------------------------------------------
      // SSE Streaming Mode
      // -------------------------------------------------------------------------
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Track disconnection but do NOT break the loop — drain to completion so
      // the checkpointer records the full completed turn (Amendment A5).
      let clientDisconnected = false;
      res.on('close', () => {
        clientDisconnected = true;
      });

      if (!clientDisconnected) {
        res.write(
          `event: start\ndata: ${JSON.stringify({
            conversationId,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      }

      try {
        const stream = await graph.stream(
          {
            messages: [humanMessage],
            user: { id: callerId },
            identity: resolvedIdentity,
            routing: { handoffCount: 0 },
          },
          { ...traceConfig, streamMode: 'updates' }
        );

        // Drain the full stream — skip writes when disconnected, never break early.
        for await (const chunk of stream) {
          if (!clientDisconnected) {
            const nodeNames = Object.keys(chunk);
            for (const node of nodeNames) {
              res.write(
                `event: node\ndata: ${JSON.stringify({
                  node,
                  timestamp: new Date().toISOString(),
                })}\n\n`
              );
            }
          }
        }

        // Retrieve full checkpointed state after drain completes
        const snapshot = await graph.getState(traceConfig);
        const finalState = snapshot.values as ConversationState;

        const assistantText = extractTurnAssistantText(finalState.messages, humanMessageId);
        const blockedBy = finalState.activeWorkflow?.blockedBy ?? null;
        const currentStep = finalState.activeWorkflow?.currentStep ?? null;
        const serviceOptions = extractTurnServiceOptions(finalState.messages, humanMessageId);

        if (assistantText === null) {
          // Agent produced no reply for this turn — emit terminal error event
          if (!clientDisconnected) {
            res.write(
              `event: error\ndata: ${JSON.stringify({
                message: 'Agent produced no response for this turn',
              })}\n\n`
            );
            res.end();
          }
          return;
        }

        // Persist assistant message ONCE, unconditionally (even if client disconnected)
        await createMessage({
          conversationId,
          role: 'assistant',
          content: assistantText,
          metadata: {
            specialist: finalState.routing.currentAgent,
            workflowStatus: finalState.workflowStatus,
            handoffCount: finalState.routing.handoffCount,
            blockedBy,
            currentStep,
            ...(serviceOptions ? { options: serviceOptions } : {}),
          },
        });

        if (!clientDisconnected) {
          res.write(
            `event: message\ndata: ${JSON.stringify({
              role: 'assistant',
              content: assistantText,
            })}\n\n`
          );

          res.write(
            `event: routing\ndata: ${JSON.stringify({
              currentAgent: finalState.routing.currentAgent,
              handoffCount: finalState.routing.handoffCount,
              workflowStatus: finalState.workflowStatus,
              blockedBy,
              currentStep,
              ...(serviceOptions ? { options: serviceOptions } : {}),
            })}\n\n`
          );

          res.write(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`);
          res.end();
        }
      } catch (streamErr) {
        if (!clientDisconnected) {
          const isProd = process.env.NODE_ENV === 'production';
          const errorMessage = isProd
            ? 'An internal streaming error occurred'
            : streamErr instanceof Error
              ? streamErr.message
              : 'Streaming error';
          res.write(
            `event: error\ndata: ${JSON.stringify({
              message: errorMessage,
            })}\n\n`
          );
          res.end();
        }
      } finally {
        if (inTransaction) {
          try {
            await dbClient.query('COMMIT');
            inTransaction = false;
          } catch {
            // ignore
          }
        }
      }
    } else {
      // -------------------------------------------------------------------------
      // Standard JSON Mode
      // -------------------------------------------------------------------------
      const finalState = (await graph.invoke(
        {
          messages: [humanMessage],
          user: { id: callerId },
          identity: resolvedIdentity,
          routing: { handoffCount: 0 },
        },
        traceConfig
      )) as ConversationState;

      const assistantText = extractTurnAssistantText(finalState?.messages, humanMessageId);
      const blockedBy = finalState.activeWorkflow?.blockedBy ?? null;
      const currentStep = finalState.activeWorkflow?.currentStep ?? null;
      const serviceOptions = extractTurnServiceOptions(finalState?.messages, humanMessageId);

      if (assistantText === null) {
        // Agent produced no reply — 502 Bad Gateway, no DB persist
        res.status(502).json({
          error: {
            code: 'BAD_GATEWAY',
            message: 'Agent produced no response for this turn',
          },
        });
        await dbClient.query('COMMIT');
        inTransaction = false;
        return;
      }

      // Persist assistant message to database
      await createMessage({
        conversationId,
        role: 'assistant',
        content: assistantText,
        metadata: {
          specialist: finalState.routing.currentAgent,
          workflowStatus: finalState.workflowStatus,
          handoffCount: finalState.routing.handoffCount,
          blockedBy,
          currentStep,
          ...(serviceOptions ? { options: serviceOptions } : {}),
        },
      });

      res.status(200).json({
        conversationId,
        message: {
          role: 'assistant',
          content: assistantText,
        },
        workflowStatus: finalState.workflowStatus,
        routing: {
          currentAgent: finalState.routing.currentAgent,
          handoffCount: finalState.routing.handoffCount,
          blockedBy,
          currentStep,
          ...(serviceOptions ? { options: serviceOptions } : {}),
        },
      });
      await dbClient.query('COMMIT');
      inTransaction = false;
    }
  } finally {
    if (inTransaction) {
      try {
        await dbClient.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Failed to rollback advisory lock transaction:', rollbackErr);
      }
    }
    dbClient.release();
  }
}
