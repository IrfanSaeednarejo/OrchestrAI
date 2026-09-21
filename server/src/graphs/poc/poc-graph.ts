import { StateGraph, END, START } from '@langchain/langgraph';
import { ConversationStateAnnotation, ConversationState, ConversationStateUpdate } from '../../state/conversation-state.js';
import { checkpointer } from '../../persistence/checkpointer/client.js';

// Node A: Initialises the workflow and records the first routing hop
const startWorkflow = async (): Promise<ConversationStateUpdate> => {
  return {
    workflowStatus: 'ACTIVE',
    routing: {
      currentAgent: 'poc-node-a',
      history: [
        {
          fromAgent: null,
          toAgent: 'poc-node-a',
          reason: 'Initial route',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
};

// Node B: Classifies intent and records the handoff from A to B
const classifyIntent = async (): Promise<ConversationStateUpdate> => {
  return {
    currentIntent: 'demo_intent',
    routing: {
      currentAgent: 'poc-node-b',
      previousAgent: 'poc-node-a',
      // Delta: +1 to handoffCount (reducer accumulates, not overwrites)
      handoffCount: 1,
      history: [
        {
          fromAgent: 'poc-node-a',
          toAgent: 'poc-node-b',
          reason: 'Intent classified',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
};

const builder = new StateGraph(ConversationStateAnnotation)
  .addNode('start-workflow', startWorkflow)
  .addNode('classify-intent', classifyIntent)
  .addEdge(START, 'start-workflow')
  .addEdge('start-workflow', 'classify-intent')
  .addEdge('classify-intent', END);

export const pocGraph = builder.compile({ checkpointer });

/**
 * Convenience helper: invoke the poc graph for a given thread and return the
 * resulting state. Reused by the verification script and Phase 3 Step 6's
 * integration test.
 */
export async function runPocGraph(
  threadId: string,
  input: ConversationStateUpdate
): Promise<ConversationState> {
  const config = { configurable: { thread_id: threadId } };
  return pocGraph.invoke(input, config) as Promise<ConversationState>;
}
