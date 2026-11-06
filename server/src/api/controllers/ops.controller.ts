// src/api/controllers/ops.controller.ts
// Phase 18 Step 1: Ops API controllers (dev-gated).
// Provides cross-user conversation listing, privileged trace access, and eval results.

import type { Request, Response } from 'express';
import {
  getConversationById,
  getMessagesByConversationId,
} from '../../persistence/repositories/conversation.repository.js';
import {
  getRoutingHistoryByConversationId,
  getAgentExecutionsByConversationId,
  getToolExecutionsByAgentExecutionId,
  listAllConversationsWithOpsMetadata,
  type RoutingHistory,
  type AgentExecution,
  type ToolExecution,
} from '../../persistence/repositories/orchestration.repository.js';
import { NotFoundError } from '../errors/app-error.js';
import { EVALUATION_SCENARIOS } from '../../evaluation/dataset/scenarios.js';
import { runBenchmark } from '../../evaluation/runner/eval-runner.js';

// ---------------------------------------------------------------------------
// GET /api/ops/conversations
// ---------------------------------------------------------------------------
export async function listOpsConversationsHandler(req: Request, res: Response): Promise<void> {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
    res.status(400).json({ error: 'Invalid pagination parameters' });
    return;
  }

  const rows = await listAllConversationsWithOpsMetadata(limit, offset);

  res.status(200).json({
    conversations: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt ?? null),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt ?? null),
      user: {
        email: r.userEmail ?? '(guest)',
        name: r.userName ?? 'Guest User',
      },
      turnCount: r.turnCount,
    })),
    pagination: { limit, offset },
  });
}

// ---------------------------------------------------------------------------
// GET /api/ops/conversations/:id/traces
// (Privileged: bypasses per-user ownership check in ops mode)
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

export async function getOpsTraceHandler(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!conversationId) {
    throw new NotFoundError('Conversation ID is required');
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation "${conversationId}" not found`);
  }

  const [routingRows, agentRows, messageRows] = await Promise.all([
    getRoutingHistoryByConversationId(conversationId),
    getAgentExecutionsByConversationId(conversationId),
    getMessagesByConversationId(conversationId),
  ]);

  const agentRowsWithTools: (AgentExecution & { tools: ToolExecution[] })[] = await Promise.all(
    agentRows.map(async (agent) => ({
      ...agent,
      tools: await getToolExecutionsByAgentExecutionId(agent.id),
    }))
  );

  const routingEvents: RoutingEvent[] = routingRows.map((r: RoutingHistory) => ({
    type: 'routing' as const,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    sourceAgent: r.sourceAgent ?? null,
    destinationAgent: r.destinationAgent,
    intent: r.intent ?? null,
    decisionType: r.decisionType,
    reason: r.reason,
  }));

  const agentEvents: AgentEvent[] = agentRowsWithTools.map((a) => ({
    type: 'agent' as const,
    timestamp:
      a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt ?? ''),
    agent: a.agent,
    status: a.status,
    duration: a.duration ?? null,
    error: a.error ?? null,
    tools: a.tools.map((t: ToolExecution) => ({
      type: 'tool' as const,
      timestamp:
        t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt ?? ''),
      tool: t.tool,
      status: t.status,
      duration: t.duration ?? null,
      error: t.error ?? null,
    })),
  }));

  const timeline: TimelineEvent[] = [...routingEvents, ...agentEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Build handoff breadcrumbs: ordered list of destination agents from routing events
  const handoffPath = routingEvents.map((e) => e.destinationAgent).filter(Boolean);

  res.status(200).json({
    conversationId,
    conversation: {
      id: conversation.id,
      userId: conversation.userId,
      status: conversation.status,
      createdAt:
        conversation.createdAt instanceof Date
          ? conversation.createdAt.toISOString()
          : (conversation.createdAt ?? null),
      updatedAt:
        conversation.updatedAt instanceof Date
          ? conversation.updatedAt.toISOString()
          : (conversation.updatedAt ?? null),
    },
    messageCount: messageRows.length,
    handoffPath,
    eventCount: timeline.length,
    timeline,
  });
}

// ---------------------------------------------------------------------------
// GET /api/ops/eval-results
// Runs benchmark using stubs (fast) and returns BenchmarkReport JSON.
// ---------------------------------------------------------------------------
export async function getOpsEvalResultsHandler(_req: Request, res: Response): Promise<void> {
  const report = await runBenchmark(EVALUATION_SCENARIOS, {
    configurable: {
      useStubs: true,
      stubBehavior: {
        type: 'COMPLETE',
        message: 'Ops eval stub response.',
      },
    },
  });

  res.status(200).json({ report });
}

