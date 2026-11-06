import type { ConversationState } from '../../state/conversation-state.js';
import type { ScenarioTurn, EvaluationScenario } from '../dataset/types.js';

export interface EvaluatorResult {
  evaluator: string;
  passed: boolean;
  score: 0 | 1;
  reasoning: string;
}

export interface ExecutedToolRecord {
  toolName: string;
  args?: Record<string, unknown>;
  outcome?: string;
  specialist?: string;
}

export interface RoutingDecisionRecord {
  decisionType: string;
  sourceAgent?: string | null;
  targetAgent: string;
  intent?: string | null;
  reason?: string;
}

export interface EvaluatorContext {
  scenario: EvaluationScenario;
  turn: ScenarioTurn;
  initialState?: Partial<ConversationState>;
  finalState: ConversationState;
  executedTools?: ExecutedToolRecord[];
  routingDecisions?: RoutingDecisionRecord[];
}

export type BinaryEvaluatorFn = (context: EvaluatorContext) => EvaluatorResult;

