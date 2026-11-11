import { describe, it, expect } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  evalRoutingCorrect,
  evalHandoffCorrect,
  evalSpecialistScopeCorrect,
  evalToolSelectionCorrect,
  evalStatePreserved,
  evalKnowledgeGrounded,
  evalWorkflowCompleted,
  evalResolutionCorrect,
} from './binary-evaluators.js';
import type { EvaluatorContext } from './types.js';
import type { ConversationState } from '../../state/conversation-state.js';
import type { EvaluationScenario } from '../dataset/types.js';

describe('Phase 15: 8 Binary Evaluators Unit Tests', () => {
  const dummyScenario: EvaluationScenario = {
    id: 'TEST-01',
    name: 'Dummy Scenario',
    description: 'Unit test dummy',
    domain: 'orders',
    pattern: 'PATTERN_A',
    turns: [{ userMessage: 'Hello' }],
  };

  const dummyState: ConversationState = {
    messages: [new HumanMessage('Where is my order?'), new AIMessage('Your order has shipped.')],
    user: { id: 'usr-1' },
    identity: { status: 'LIGHTLY_VERIFIED', verificationMethod: 'order_number', verifiedAt: new Date().toISOString() },
    activeWorkflow: null,
    lastKnownEntities: null,
    pendingTask: null,
    intentQueue: null,
    currentDomain: 'orders',
    currentIntent: 'ORDER_STATUS',
    workflowStatus: 'COMPLETED',
    routing: {
      currentAgent: 'order_tracking',
      previousAgent: null,
      history: [],
      handoffCount: 0,
      visitedAgents: ['order_tracking'],
    },
  };

  // 1. evalRoutingCorrect
  describe('evalRoutingCorrect', () => {
    it('passes when currentAgent matches expected specialist', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: { userMessage: 'Where is my order?', expectedTargetSpecialist: 'order_tracking' },
        finalState: dummyState,
      };

      const result = evalRoutingCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails with explanatory reasoning when currentAgent diverges from expected', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: { userMessage: 'Where is my order?', expectedTargetSpecialist: 'returns' },
        finalState: dummyState,
      };

      const result = evalRoutingCorrect(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasoning).toContain('Expected specialist "returns"');
    });
  });

  // 2. evalHandoffCorrect
  describe('evalHandoffCorrect', () => {
    it('passes when expected lateral handoff matches routingDecisions', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Charged twice',
          expectedHandoff: { sourceAgent: 'payment', targetAgent: 'refund' },
        },
        finalState: dummyState,
        routingDecisions: [
          { decisionType: 'HANDOFF', sourceAgent: 'payment', targetAgent: 'refund' },
        ],
      };

      const result = evalHandoffCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when expected handoff was missing in routing decisions', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Charged twice',
          expectedHandoff: { sourceAgent: 'payment', targetAgent: 'refund' },
        },
        finalState: dummyState,
        routingDecisions: [],
      };

      const result = evalHandoffCorrect(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  // 3. evalSpecialistScopeCorrect
  describe('evalSpecialistScopeCorrect', () => {
    it('passes when all executed tools belong to the specialist allowlist', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: { userMessage: 'Track order' },
        finalState: dummyState,
        executedTools: [
          { toolName: 'get_order', specialist: 'order_tracking', outcome: 'ALLOWED' },
        ],
      };

      const result = evalSpecialistScopeCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when a specialist calls a tool outside its permissions allowlist', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: { userMessage: 'Track order' },
        finalState: dummyState,
        executedTools: [
          { toolName: 'create_refund', specialist: 'order_tracking', outcome: 'ALLOWED' },
        ],
      };

      const result = evalSpecialistScopeCorrect(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasoning).toContain('out-of-scope');
    });
  });

  // 4. evalToolSelectionCorrect
  describe('evalToolSelectionCorrect', () => {
    it('passes when expected tools and gate outcomes are observed', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Check return eligibility',
          expectedTools: [{ tool: 'check_return_eligibility', gateOutcome: 'ALLOWED' }],
        },
        finalState: dummyState,
        executedTools: [
          { toolName: 'check_return_eligibility', outcome: 'ALLOWED' },
        ],
      };

      const result = evalToolSelectionCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when an expected tool was not invoked', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Check return eligibility',
          expectedTools: [{ tool: 'check_return_eligibility' }],
        },
        finalState: dummyState,
        executedTools: [{ toolName: 'get_order' }],
      };

      const result = evalToolSelectionCorrect(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  // 5. evalStatePreserved
  describe('evalStatePreserved', () => {
    it('passes when message history and user ID are preserved', () => {
      const initialState: Partial<ConversationState> = {
        messages: [new HumanMessage('Initial message')],
        user: { id: 'usr-1' },
        routing: { handoffCount: 0, currentAgent: null, previousAgent: null, history: [], visitedAgents: [] },
      };

      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: { userMessage: 'Next message' },
        initialState,
        finalState: dummyState,
      };

      const result = evalStatePreserved(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when user ID is corrupted or changed unexpectedly', () => {
      const initialState: Partial<ConversationState> = {
        user: { id: 'usr-original' },
      };

      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: { userMessage: 'Next message' },
        initialState,
        finalState: { ...dummyState, user: { id: 'usr-corrupted' } },
      };

      const result = evalStatePreserved(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasoning).toContain('User ID changed');
    });
  });

  // 6. evalKnowledgeGrounded
  describe('evalKnowledgeGrounded', () => {
    it('passes when assistant response matches expected positive keywords', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Where is my order?',
          expectedResponseKeywords: ['shipped', 'carrier'],
        },
        finalState: {
          ...dummyState,
          messages: [new HumanMessage('Where is it?'), new AIMessage('Your package shipped with FedEx.')],
        },
      };

      const result = evalKnowledgeGrounded(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when assistant response matches negative forbidden keywords', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Query',
          expectedResponseNegativeKeywords: ['hallucinated_policy_term'],
        },
        finalState: {
          ...dummyState,
          messages: [new HumanMessage('Query'), new AIMessage('Here is a hallucinated_policy_term.')],
        },
      };

      const result = evalKnowledgeGrounded(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  // 7. evalWorkflowCompleted
  describe('evalWorkflowCompleted', () => {
    it('passes when workflowStatus matches expected', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Where is my order?',
          expectedWorkflowStatus: 'COMPLETED',
        },
        finalState: dummyState,
      };

      const result = evalWorkflowCompleted(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when workflowStatus differs from expected', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Where is my order?',
          expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        },
        finalState: dummyState, // has 'COMPLETED'
      };

      const result = evalWorkflowCompleted(context);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  // 8. evalResolutionCorrect
  describe('evalResolutionCorrect', () => {
    it('passes when COMPLETED turn has substantive assistant message', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Where is my order?',
          expectedWorkflowStatus: 'COMPLETED',
        },
        finalState: dummyState,
      };

      const result = evalResolutionCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('passes when WAITING_FOR_USER_INPUT asks a question', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Check return',
          expectedWorkflowStatus: 'WAITING_FOR_USER_INPUT',
        },
        finalState: {
          ...dummyState,
          workflowStatus: 'WAITING_FOR_USER_INPUT',
          messages: [new HumanMessage('Check return'), new AIMessage('Could you please provide your order ID?')],
        },
      };

      const result = evalResolutionCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('passes when ESCALATED provides human representative prompt', () => {
      const context: EvaluatorContext = {
        scenario: dummyScenario,
        turn: {
          userMessage: 'Loop issue',
          expectedWorkflowStatus: 'ESCALATED',
        },
        finalState: {
          ...dummyState,
          workflowStatus: 'ESCALATED',
          messages: [new HumanMessage('Help'), new AIMessage('I am connecting you with a human support agent.')],
        },
      };

      const result = evalResolutionCorrect(context);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });
  });
});
