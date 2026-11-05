// src/agents/common/subgraph-harness.test.ts
// Phase 7: Unit tests for SubgraphHarness and NodePatterns.
// In-memory only (MemorySaver); does not touch PostgreSQL.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateGraph, START, END } from '@langchain/langgraph';
import {
  ConversationStateAnnotation,
  type ConversationStateUpdate,
} from '../../state/conversation-state.js';
import {
  buildSubgraphHarness,
  buildSingleNodeHarness,
} from './subgraph-harness.js';
import { executeNodeTool } from './node-patterns.js';
import type { ToolMetadata, ToolResult } from '../../tools/types.js';

// ---------------------------------------------------------------------------
// Mock telemetry / event logging so this suite stays pure in-memory
// ---------------------------------------------------------------------------

vi.mock('../../routing/events.js', () => ({
  recordToolExecution: vi.fn().mockResolvedValue({ id: 'mock-tool-exec-id' }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubgraphHarness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildSubgraphHarness', () => {
    it('generates unique thread IDs', () => {
      const harness = buildSubgraphHarness((checkpointer) => {
        return new StateGraph(ConversationStateAnnotation)
          .addNode('noop', async () => ({}))
          .addEdge(START, 'noop')
          .addEdge('noop', END)
          .compile({ checkpointer });
      });

      const id1 = harness.threadId();
      const id2 = harness.threadId();

      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);
    });

    it('invokes graph and round-trips state through MemorySaver checkpoint', async () => {
      const harness = buildSubgraphHarness((checkpointer) => {
        return new StateGraph(ConversationStateAnnotation)
          .addNode('step', async (): Promise<ConversationStateUpdate> => ({
            workflowStatus: 'ACTIVE',
            currentDomain: 'order_tracking',
          }))
          .addEdge(START, 'step')
          .addEdge('step', END)
          .compile({ checkpointer });
      });

      const threadId = harness.threadId();
      const result = await harness.invoke(
        { currentIntent: 'track_order' },
        { configurable: { thread_id: threadId } }
      );

      expect(result.workflowStatus).toBe('ACTIVE');
      expect(result.currentDomain).toBe('order_tracking');
      expect(result.currentIntent).toBe('track_order');

      // Verify state snapshot via getState
      const snapshot = await harness.getState(threadId);
      expect(snapshot.values.workflowStatus).toBe('ACTIVE');
      expect(snapshot.values.currentDomain).toBe('order_tracking');
      expect(snapshot.values.currentIntent).toBe('track_order');
    });

    it('accumulates state updates across multiple invocations on the same thread', async () => {
      const harness = buildSubgraphHarness((checkpointer) => {
        return new StateGraph(ConversationStateAnnotation)
          .addNode('incrementHandoff', async (): Promise<ConversationStateUpdate> => ({
            routing: { handoffCount: 1 },
          }))
          .addEdge(START, 'incrementHandoff')
          .addEdge('incrementHandoff', END)
          .compile({ checkpointer });
      });

      const threadId = harness.threadId();

      await harness.invoke({}, { configurable: { thread_id: threadId } });
      const secondResult = await harness.invoke({}, { configurable: { thread_id: threadId } });

      expect(secondResult.routing.handoffCount).toBe(2);

      const snapshot = await harness.getState(threadId);
      expect(snapshot.values.routing.handoffCount).toBe(2);
    });
  });

  describe('buildSingleNodeHarness', () => {
    it('executes a single node action and checkpoints the result', async () => {
      const harness = buildSingleNodeHarness(
        'customNode',
        async (): Promise<ConversationStateUpdate> => {
          return { workflowStatus: 'COMPLETED' };
        }
      );

      const threadId = harness.threadId();
      const result = await harness.invoke(
        { workflowStatus: 'ACTIVE' },
        { configurable: { thread_id: threadId } }
      );

      expect(result.workflowStatus).toBe('COMPLETED');

      const snapshot = await harness.getState(threadId);
      expect(snapshot.values.workflowStatus).toBe('COMPLETED');
    });
  });

  describe('executeNodeTool pattern inside harness', () => {
    const allowedMetadata: ToolMetadata = {
      name: 'get_order',
      requiredVerification: 'NONE',
    };

    const blockedMetadata: ToolMetadata = {
      name: 'create_return',
      requiredVerification: 'FULL',
    };

    const dummyToolFn = async (): Promise<ToolResult<{ ok: boolean }>> => {
      return { success: true, data: { ok: true } };
    };

    it('returns COMPLETED when gate outcome is ALLOWED', async () => {
      const harness = buildSingleNodeHarness('toolNode', async (state) => {
        return executeNodeTool({
          toolFn: dummyToolFn,
          metadata: allowedMetadata,
          rawInput: { orderId: 'ord-123' },
          agentExecutionId: 'exec-1',
          specialist: 'order_tracking',
          identity: state.identity,
        });
      });

      const threadId = harness.threadId();
      const result = await harness.invoke({}, { configurable: { thread_id: threadId } });

      expect(result.workflowStatus).toBe('COMPLETED');
      expect(result.activeWorkflow).toBeNull();
    });

    it('returns WAITING_FOR_USER_INPUT and activeWorkflow when gate outcome is BLOCKED', async () => {
      const harness = buildSingleNodeHarness('toolNode', async (state) => {
        return executeNodeTool({
          toolFn: dummyToolFn,
          metadata: blockedMetadata,
          rawInput: { orderId: 'ord-123' },
          agentExecutionId: 'exec-2',
          specialist: 'returns',
          identity: state.identity, // null -> UNVERIFIED -> BLOCKED
          workflowId: 'wf-returns-1',
          originatingIntent: 'return_request',
          resumeContext: { orderId: 'ord-123' },
        });
      });

      const threadId = harness.threadId();
      const result = await harness.invoke({}, { configurable: { thread_id: threadId } });

      expect(result.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
      expect(result.activeWorkflow).not.toBeNull();
      expect(result.activeWorkflow?.workflowId).toBe('wf-returns-1');
      expect(result.activeWorkflow?.originatingIntent).toBe('return_request');
      expect(result.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
      expect(result.activeWorkflow?.currentStep).toBe('create_return');
      expect(result.activeWorkflow?.resumeContext).toEqual({ orderId: 'ord-123' });
      expect(result.activeWorkflow?.returnTo).toEqual({
        domain: 'returns',
        agent: 'returns',
        workflowStep: 'create_return',
      });
    });

    it('returns FAILED when gate outcome is DENIED (not in allowlist)', async () => {
      const harness = buildSingleNodeHarness('toolNode', async (state) => {
        return executeNodeTool({
          toolFn: dummyToolFn,
          metadata: allowedMetadata, // 'get_order' is NOT allowed for 'profile' specialist
          rawInput: {},
          agentExecutionId: 'exec-3',
          specialist: 'profile',
          identity: state.identity,
        });
      });

      const threadId = harness.threadId();
      const result = await harness.invoke({}, { configurable: { thread_id: threadId } });

      expect(result.workflowStatus).toBe('FAILED');
      expect(result.activeWorkflow).toBeNull();
    });
  });
});
