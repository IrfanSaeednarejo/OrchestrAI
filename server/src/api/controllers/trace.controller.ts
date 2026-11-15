// src/api/controllers/trace.controller.ts
// Phase 16 Step 4: Controller for the GET /api/conversations/:id/traces endpoint.
// Returns a chronological merged timeline of routing events, agent executions, and tool calls.

import type { Request, Response } from 'express';
import { getConversationById } from '../../persistence/repositories/conversation.repository.js';
import {
  getRoutingHistoryByConversationId,
  getAgentExecutionsByConversationId,
  getToolExecutionsByAgentExecutionId,
  type RoutingHistory,
  type AgentExecution,
  type ToolExecution,
} from '../../persistence/repositories/orchestration.repository.js';
import { NotFoundError, ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import { DEFAULT_GUEST_USER_ID } from '../middleware/auth.middleware.js';

// ---------------------------------------------------------------------------
// Timeline event shapes
// ---------------------------------------------------------------------------

interface RoutingEvent {
  type: 'routing';
  timestamp: string;
  sourceAgent: string | null;
  destinationAgent: string;
  intent: string | null;
  decisionType: string;
  reason: string;
}

interface ToolEvent {
  type: 'tool';
  timestamp: string;
  tool: string;
  status: string;
  duration: number | null;
  error: string | null;
}

interface AgentEvent {
  type: 'agent';
  timestamp: string;
  agent: string;
  status: string;
  duration: number | null;
  error: string | null;
  tools: ToolEvent[];
}

type TimelineEvent = RoutingEvent | AgentEvent;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function getTraceHandler(req: Request, res: Response): Promise<void> {
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

  // Security: enforce ownership (guests own their own conversations)
  if (callerId !== DEFAULT_GUEST_USER_ID && conversation.userId !== callerId) {
    throw new ForbiddenError('You do not have permission to view traces for this conversation');
  }

  // Fetch routing history and agent executions in parallel
  const [routingRows, agentRows] = await Promise.all([
    getRoutingHistoryByConversationId(conversationId),
    getAgentExecutionsByConversationId(conversationId),
  ]);

  // Enrich each agent execution with its tool executions
  const agentRowsWithTools: (AgentExecution & { tools: ToolExecution[] })[] = await Promise.all(
    agentRows.map(async (agent) => ({
      ...agent,
      tools: await getToolExecutionsByAgentExecutionId(agent.id),
    }))
  );

  // Map routing history rows to timeline events
  const routingEvents: RoutingEvent[] = routingRows.map((r: RoutingHistory) => ({
    type: 'routing' as const,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    sourceAgent: r.sourceAgent ?? null,
    destinationAgent: r.destinationAgent,
    intent: r.intent ?? null,
    decisionType: r.decisionType,
    reason: r.reason,
  }));

  // Map agent execution rows (with their tools) to timeline events
  const agentEvents: AgentEvent[] = agentRowsWithTools.map((a) => {
    const toolEvents: ToolEvent[] = a.tools.map((t: ToolExecution) => ({
      type: 'tool' as const,
      timestamp:
        t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt ?? ''),
      tool: t.tool,
      status: t.status,
      duration: t.duration ?? null,
      error: t.error ?? null,
    }));

    return {
      type: 'agent' as const,
      timestamp:
        a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt ?? ''),
      agent: a.agent,
      status: a.status,
      duration: a.duration ?? null,
      error: a.error ?? null,
      tools: toolEvents,
    };
  });

  // Merge and sort by timestamp (chronological)
  const timeline: TimelineEvent[] = [...routingEvents, ...agentEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  res.status(200).json({
    conversationId,
    eventCount: timeline.length,
    timeline,
  });
}
