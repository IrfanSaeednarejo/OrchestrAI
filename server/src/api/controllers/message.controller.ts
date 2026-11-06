// src/api/controllers/message.controller.ts
// Phase 16: Controller handling dual-mode message dispatch (JSON and SSE streaming).

import type { Request, Response } from 'express';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import {
  getConversationById,
  createMessage,
} from '../../persistence/repositories/conversation.repository.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';
import { buildParentGraph } from '../../graphs/parent/parent-graph.js';
import { createTraceConfig } from '../../observability/tracer.js';
import type { ConversationState } from '../../state/conversation-state.js';
import { NotFoundError, ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import { DEFAULT_GUEST_USER_ID } from '../middleware/auth.middleware.js';

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

function extractLastAssistantMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && typeof msg.content === 'string' && msg.getType() !== 'human') {
      return msg.content;
    }
  }
  return '';
}

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

  const callerId = req.user?.id;
  if (!callerId) {
    throw new UnauthorizedError('User identity could not be resolved');
  }

  // Security check: ensure caller owns conversation (unless guest session)
  if (
    callerId !== DEFAULT_GUEST_USER_ID &&
    conversation.userId !== callerId
  ) {
    throw new ForbiddenError('You do not have permission to message in this conversation');
  }

  const { content } = req.body as { content: string };

  // 1. HARD RULE: Persist human message to Postgres BEFORE invoking the graph
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

  const isSSE = req.headers.accept?.includes('text/event-stream');

  if (isSSE) {
    // -----------------------------------------------------------------------
    // SSE Streaming Mode
    // -----------------------------------------------------------------------
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    res.write(
      `event: start\ndata: ${JSON.stringify({
        conversationId,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    try {
      const stream = await graph.stream(
        {
          messages: [new HumanMessage(content)],
          user: { id: callerId },
        },
        traceConfig
      );

      for await (const chunk of stream) {
        if (clientDisconnected) break;
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

      // Retrieve full checkpointed state
      const snapshot = await graph.getState(traceConfig);
      const finalState = snapshot.values as ConversationState;
      const assistantText = extractLastAssistantMessage(finalState.messages);

      // Persist assistant message to database
      await createMessage({
        conversationId,
        role: 'assistant',
        content: assistantText,
        metadata: {
          specialist: finalState.routing.currentAgent,
          workflowStatus: finalState.workflowStatus,
          handoffCount: finalState.routing.handoffCount,
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
          })}\n\n`
        );

        res.write(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`);
        res.end();
      }
    } catch (streamErr) {
      if (!clientDisconnected) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message: streamErr instanceof Error ? streamErr.message : 'Streaming error',
          })}\n\n`
        );
        res.end();
      }
    }
  } else {
    // -----------------------------------------------------------------------
    // Standard JSON Mode
    // -----------------------------------------------------------------------
    const finalState = (await graph.invoke(
      {
        messages: [new HumanMessage(content)],
        user: { id: callerId },
      },
      traceConfig
    )) as ConversationState;

    const assistantText = extractLastAssistantMessage(finalState.messages);

    // Persist assistant message to database
    await createMessage({
      conversationId,
      role: 'assistant',
      content: assistantText,
      metadata: {
        specialist: finalState.routing.currentAgent,
        workflowStatus: finalState.workflowStatus,
        handoffCount: finalState.routing.handoffCount,
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
      },
    });
  }
}

