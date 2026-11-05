// src/agents/common/subgraph-harness.ts
// Phase 7: Reusable test harness for specialist subgraphs and isolated nodes.
// Wraps graphs or node actions with an in-memory checkpointer (MemorySaver)
// and provides convenience methods (threadId, invoke, getState) for testing.

import crypto from 'node:crypto';
import {
  MemorySaver,
  StateGraph,
  START,
  END,
  type BaseCheckpointSaver,
  type StateSnapshot,
} from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  ConversationStateAnnotation,
  type ConversationState,
  type ConversationStateUpdate,
} from '../../state/conversation-state.js';

// ---------------------------------------------------------------------------
// Types & Contracts
// ---------------------------------------------------------------------------

export interface InvocableGraph {
  invoke(
    input: ConversationStateUpdate,
    config?: RunnableConfig
  ): Promise<ConversationState>;
  getState(config: RunnableConfig): Promise<StateSnapshot>;
}

export interface SubgraphHarnessOptions {
  /** Optional custom checkpointer (defaults to a fresh MemorySaver). */
  checkpointer?: BaseCheckpointSaver;
}

export interface SubgraphHarness<G extends InvocableGraph> {
  /** The compiled LangGraph instance. */
  graph: G;
  /** Checkpointer attached to this graph run. */
  checkpointer: BaseCheckpointSaver;
  /** Generates a unique thread_id for test isolation. */
  threadId: () => string;
  /**
   * Invokes the graph with the provided state update and configuration.
   * If `config.configurable.thread_id` is omitted, a new thread_id is automatically assigned.
   */
  invoke: (
    input: ConversationStateUpdate,
    config?: RunnableConfig
  ) => Promise<ConversationState>;
  /**
   * Reads back the checkpointed state for a given thread_id.
   */
  getState: (threadId: string) => Promise<StateSnapshot>;
}

export type SingleNodeAction = (
  state: ConversationState,
  config?: RunnableConfig
) => Promise<ConversationStateUpdate>;

// ---------------------------------------------------------------------------
// Harness Builders
// ---------------------------------------------------------------------------

/**
 * Builds a test harness around any graph factory that accepts a checkpointer.
 */
export function buildSubgraphHarness<G extends InvocableGraph>(
  factory: (checkpointer: BaseCheckpointSaver) => G,
  options?: SubgraphHarnessOptions
): SubgraphHarness<G> {
  const checkpointer = options?.checkpointer ?? new MemorySaver();
  const graph = factory(checkpointer);

  const harness: SubgraphHarness<G> = {
    graph,
    checkpointer,
    threadId: () => crypto.randomUUID(),
    invoke: (input: ConversationStateUpdate, config?: RunnableConfig) => {
      const thread_id = config?.configurable?.['thread_id'] ?? crypto.randomUUID();
      const mergedConfig: RunnableConfig = {
        ...config,
        configurable: {
          ...config?.configurable,
          thread_id,
        },
      };
      return graph.invoke(input, mergedConfig);
    },
    getState: (threadId: string) => {
      return graph.getState({ configurable: { thread_id: threadId } });
    },
  };

  return harness;
}

/**
 * Builds an isolated single-node test harness using ConversationStateAnnotation.
 * Wraps START -> nodeAction -> END with a MemorySaver checkpointer.
 * Useful for testing specialist sub-actions in isolation without spinning up full graphs.
 */
export function buildSingleNodeHarness(
  nodeName: string,
  nodeAction: SingleNodeAction,
  options?: SubgraphHarnessOptions
) {
  return buildSubgraphHarness((checkpointer) => {
    const workflow = new StateGraph(ConversationStateAnnotation)
      .addNode(nodeName, nodeAction)
      .addEdge(START, nodeName)
      .addEdge(nodeName, END);

    return workflow.compile({ checkpointer });
  }, options);
}

