import { BaseMessage } from '@langchain/core/messages';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

export type WorkflowStatus =
  | 'ACTIVE'
  | 'WAITING_FOR_USER_INPUT'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'ESCALATED'
  | 'FAILED';

export interface RoutingHistoryEntry {
  fromAgent: string | null;
  toAgent: string;
  reason: string;
  timestamp: string; // ISO string
}

export interface RoutingState {
  currentAgent: string | null;
  previousAgent: string | null;
  history: RoutingHistoryEntry[];
  handoffCount: number;
  visitedAgents: string[];
}

export interface IdentityState {
  status: 'UNVERIFIED' | 'LIGHTLY_VERIFIED' | 'VERIFIED';
  verificationMethod: string | null;
  verifiedAt: string | null; // ISO string
}

export interface ReturnTo {
  domain: string;
  agent: string;
  workflowStep: string | null;
}

export interface ActiveWorkflowState {
  workflowId: string | null;
  originatingIntent: string | null;
  currentStep: string | null;
  blockedBy: string | null;
  returnTo: ReturnTo | null;
  resumeContext: Record<string, unknown> | null;
}

export const ConversationStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  user: Annotation<{ id: string } | null>({
    reducer: (state, update) => update ?? state,
    default: () => null,
  }),

  currentDomain: Annotation<string | null>({
    reducer: (state, update) => update !== undefined ? update : state,
    default: () => null,
  }),

  currentIntent: Annotation<string | null>({
    reducer: (state, update) => update !== undefined ? update : state,
    default: () => null,
  }),

  // Update type is Partial<RoutingState> so nodes can emit only the sub-fields they change
  // (e.g. just { handoffCount: 1 } or { history: [...] }) without providing the full object.
  routing: Annotation<RoutingState, Partial<RoutingState>>({
    reducer: (state, update) => {
      if (!update) return state;
      const newState = { ...state };

      if (update.currentAgent !== undefined) {
        newState.currentAgent = update.currentAgent;
      }

      if (update.previousAgent !== undefined) {
        newState.previousAgent = update.previousAgent;
      }

      // This is explicitly NOT a replacement for the routing_history Postgres table,
      // which remains the durable, unbounded, queryable record.
      // This is a small, BOUNDED runtime log for loop detection and in-run decisions.
      if (update.history !== undefined) {
        newState.history = [...state.history, ...update.history];
      }

      // handoffCount updates MUST be deltas (e.g. 1 for one handoff), NOT absolute values.
      // The reducer adds the emitted value to the current count. Emitting an absolute count
      // here will silently corrupt loop-detection logic.
      if (update.handoffCount !== undefined) {
        newState.handoffCount = state.handoffCount + update.handoffCount;
      }

      if (update.visitedAgents !== undefined) {
        newState.visitedAgents = Array.from(new Set([...state.visitedAgents, ...update.visitedAgents]));
      }

      return newState;
    },
    default: () => ({
      currentAgent: null,
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: [],
    }),
  }),

  workflowStatus: Annotation<WorkflowStatus | null>({
    reducer: (state, update) => update !== undefined ? update : state,
    default: () => null,
  }),

  // identity may ONLY be mutated by the Account Access subgraph. All other specialists and routers
  // may READ identity.status to make routing/access decisions, but must NEVER emit an update to this field.
  // This is an architectural rule enforced by convention at this layer — Phase 6's access-control
  // gate is where this gets enforced in code, not here.
  identity: Annotation<IdentityState | null>({
    reducer: (state, update) => update !== undefined ? update : state,
    default: () => null,
  }),

  // This field implements the Pattern C handoff-and-return mechanism: a specialist records blockedBy
  // + returnTo + resumeContext before handing off; the resuming logic later reads returnTo to route
  // back to the original specialist and clears/updates this field.
  activeWorkflow: Annotation<ActiveWorkflowState | null>({
    reducer: (state, update) => update !== undefined ? update : state,
    default: () => null,
  }),
});

export type ConversationState = typeof ConversationStateAnnotation.State;
export type ConversationStateUpdate = typeof ConversationStateAnnotation.Update;
