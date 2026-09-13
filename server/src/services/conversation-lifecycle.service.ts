
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from '@langchain/core/messages';
import type { CompiledStateGraph } from '@langchain/langgraph';
import {
  createConversation,
  createMessage,
  getConversationById,
  getMessagesByConversationId,
  type Conversation,
  type Message,
  type NewMessage,
} from '../persistence/repositories/conversation.repository.js';
import type { ConversationState, ConversationStateAnnotation } from '../state/conversation-state.js';

// Generic type for any compiled LangGraph StateGraph. The four type parameters
// are the shape used by CompiledStateGraph — we use typeof ConversationStateAnnotation
// in the type signatures but accept the raw CompiledStateGraph type so callers can
// inject any graph compiled from ConversationStateAnnotation without coupling this
// service to a specific graph file.
type AnyCompiledGraph = CompiledStateGraph<
  typeof ConversationStateAnnotation.State,
  typeof ConversationStateAnnotation.Update,
  string
>;

// ---------------------------------------------------------------------------
// 1. startConversation
// ---------------------------------------------------------------------------

/**
 * Creates a new Conversation row and returns it. Does NOT invoke any graph,
 * create a checkpoint, or send any messages. The returned conversation's `id`
 * is the thread_id to use in all subsequent graph calls for this conversation.
 */
export async function startConversation(userId: string): Promise<Conversation> {
  return createConversation({ userId, status: 'active' });
}

// ---------------------------------------------------------------------------
// 2. sendMessage
// ---------------------------------------------------------------------------

type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

function toBaseMessage(role: MessageRole, content: string): BaseMessage {
  switch (role) {
    case 'user': return new HumanMessage(content);
    case 'assistant': return new AIMessage(content);
    case 'system': return new SystemMessage(content);
    case 'tool': return new ToolMessage({ content, tool_call_id: 'unknown' });
  }
}

type SendMessageParams = {
  conversationId: string;
  role: MessageRole;
  content: string;
  graph: AnyCompiledGraph;
  metadata?: unknown;
};

type SendMessageResult = {
  message: Message;
  state: ConversationState;
};

/**
 * Persists the message to the messages table FIRST (message durability is
 * unconditional and must not depend on graph execution success), then invokes
 * the graph so its reducers accumulate the new message into checkpoint state.
 *
 * Ordering guarantee: the Postgres write completes before the graph invoke
 * begins. If the graph invoke fails after a successful write, the message row
 * still exists. A caller retrying after a graph failure should send a NEW
 * message (e.g. the user re-sending) — this function does not itself prevent
 * duplicate calls with identical content. That responsibility belongs to the
 * caller (e.g. idempotency keys at the API layer), which is out of scope for
 * Phase 3.
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { conversationId, role, content, graph, metadata } = params;

  // Step a: persist to messages table FIRST — unconditional
  const messageInput: NewMessage = {
    conversationId,
    role,
    content,
    metadata: metadata ?? null,
  };
  const message = await createMessage(messageInput);

  // Step b: invoke the graph with ONLY this new message — do not reconstruct
  // the full historical transcript here. The graph's messages reducer (append
  // semantics, via Step 2's ConversationStateAnnotation) accumulates history
  // turn-by-turn from the Postgres checkpoint automatically.
  const langchainMessage = toBaseMessage(role, content);
  const state = await graph.invoke(
    { messages: [langchainMessage] },
    { configurable: { thread_id: conversationId } }
  ) as ConversationState;

  // Step c: return both the durable row and the runtime state — not merged
  return { message, state };
}

// ---------------------------------------------------------------------------
// 3. loadConversation
// ---------------------------------------------------------------------------

type LoadConversationResult = {
  conversation: Conversation;
  messages: Message[];
  state: ConversationState | null;
};

/**
 * Loads the full conversation record: the Conversation row, the durable message
 * transcript (ordered by timestamp), and the current LangGraph runtime state.
 *
 * state is null — not an error — if no graph invocation has run for this
 * conversation yet. This reflects the core principle: conversation lifecycle ≠
 * graph lifecycle. A conversation is valid without any checkpoint.
 *
 * Implementation note: graph.getState() on a nonexistent thread_id returns
 * { values: {}, next: [], ... } rather than throwing. We detect the
 * "no checkpoint" case by checking Object.keys(values).length === 0.
 */
export async function loadConversation(
  conversationId: string,
  graph: AnyCompiledGraph
): Promise<LoadConversationResult> {
  const [conversation, messages, checkpoint] = await Promise.all([
    getConversationById(conversationId),
    getMessagesByConversationId(conversationId),
    graph.getState({ configurable: { thread_id: conversationId } }),
  ]);

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  // getState returns { values: {} } (empty object) when no checkpoint exists —
  // it does not throw. Treat an empty values object as "no state yet".
  const hasCheckpoint = Object.keys(checkpoint.values).length > 0;
  const state: ConversationState | null = hasCheckpoint
    ? (checkpoint.values as ConversationState)
    : null;

  return { conversation, messages, state };
}
