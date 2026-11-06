// src/types/ops.ts
// Phase 18 Step 2: Data contracts for Platform/Ops UI and observability.

export interface OpsConversation {
  id: string;
  userId: string;
  status: 'active' | 'archived' | 'escalated';
  createdAt: string | null;
  updatedAt: string | null;
  user: {
    email: string;
    name: string;
  };
  turnCount: number;
}

export interface OpsConversationListResponse {
  conversations: OpsConversation[];
  pagination: {
    limit: number;
    offset: number;
  };
}

export interface OpsRoutingEvent {
  type: 'routing';
  timestamp: string;
  sourceAgent: string | null;
  destinationAgent: string;
  intent: string | null;
  decisionType: string;
  reason: string;
}

export interface OpsToolEvent {
  type: 'tool';
  timestamp: string;
  tool: string;
  status: string;
  duration: number | null;
  error: string | null;
}

export interface OpsAgentEvent {
  type: 'agent';
  timestamp: string;
  agent: string;
  status: string;
  duration: number | null;
  error: string | null;
  tools: OpsToolEvent[];
}

export type OpsTimelineEvent = OpsRoutingEvent | OpsAgentEvent;

export interface OpsTraceResponse {
  conversationId: string;
  conversation: {
    id: string;
    userId: string;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
  };
  messageCount: number;
  handoffPath: string[];
  eventCount: number;
  timeline: OpsTimelineEvent[];
}

export interface EvaluatorStats {
  passed: number;
  total: number;
  rate: number;
}

export interface ScenarioResultSummary {
  scenario: {
    id: string;
    name: string;
    domain: string;
    pattern: string;
  };
  scenarioPassed: boolean;
  passingEvaluators: number;
  totalEvaluators: number;
}

export interface BenchmarkReport {
  totalScenarios: number;
  passedScenarios: number;
  passRate: number;
  byEvaluator: Record<string, EvaluatorStats>;
  byDomain: Record<string, EvaluatorStats>;
  scenarioResults: ScenarioResultSummary[];
}

export interface OpsEvalResponse {
  report: BenchmarkReport;
}
