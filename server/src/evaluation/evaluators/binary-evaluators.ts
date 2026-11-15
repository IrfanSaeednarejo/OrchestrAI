import { TOOL_ALLOWLIST, type SpecialistId } from '../../tools/permissions.js';
import type { BinaryEvaluatorFn, EvaluatorContext } from './types.js';

function extractLastAssistantMessage(context: EvaluatorContext): string {
  const messages = context.finalState.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && typeof msg.content === 'string' && msg.getType() !== 'human') {
      return msg.content;
    }
  }
  return '';
}

/**
 * 1. ROUTING_CORRECT
 * Evaluates whether the routed agent matches the scenario turn expectation.
 */
export const evalRoutingCorrect: BinaryEvaluatorFn = (context) => {
  const { turn, finalState, routingDecisions } = context;

  if (!turn.expectedTargetSpecialist) {
    return {
      evaluator: 'ROUTING_CORRECT',
      passed: true,
      score: 1,
      reasoning: 'No specific target specialist expected for this turn.',
    };
  }

  const currentAgent = finalState.routing.currentAgent;
  const matchesCurrent = currentAgent === turn.expectedTargetSpecialist;

  const matchesDecision = routingDecisions?.some(
    (d) => d.targetAgent === turn.expectedTargetSpecialist
  );

  if (matchesCurrent || matchesDecision) {
    return {
      evaluator: 'ROUTING_CORRECT',
      passed: true,
      score: 1,
      reasoning: `Routed correctly to expected specialist "${turn.expectedTargetSpecialist}".`,
    };
  }

  return {
    evaluator: 'ROUTING_CORRECT',
    passed: false,
    score: 0,
    reasoning: `Expected specialist "${turn.expectedTargetSpecialist}", but currentAgent is "${currentAgent}".`,
  };
};

/**
 * 2. HANDOFF_CORRECT
 * Evaluates whether lateral handoff occurred between expected source and target agents.
 */
export const evalHandoffCorrect: BinaryEvaluatorFn = (context) => {
  const { turn, routingDecisions } = context;

  if (!turn.expectedHandoff) {
    return {
      evaluator: 'HANDOFF_CORRECT',
      passed: true,
      score: 1,
      reasoning: 'No lateral handoff expected for this turn.',
    };
  }

  const { sourceAgent, targetAgent } = turn.expectedHandoff;

  const foundHandoff = routingDecisions?.some(
    (d) =>
      (d.decisionType === 'HANDOFF' || d.decisionType === 'RE_ROUTE') &&
      d.sourceAgent === sourceAgent &&
      d.targetAgent === targetAgent
  );

  if (foundHandoff) {
    return {
      evaluator: 'HANDOFF_CORRECT',
      passed: true,
      score: 1,
      reasoning: `Handoff correctly transferred from "${sourceAgent}" to "${targetAgent}".`,
    };
  }

  return {
    evaluator: 'HANDOFF_CORRECT',
    passed: false,
    score: 0,
    reasoning: `Expected handoff from "${sourceAgent}" to "${targetAgent}", but no matching routing decision was logged.`,
  };
};

/**
 * 3. SPECIALIST_SCOPE_CORRECT
 * Evaluates whether specialists operated strictly within their allowlisted tools.
 */
export const evalSpecialistScopeCorrect: BinaryEvaluatorFn = (context) => {
  const { executedTools } = context;

  if (!executedTools || executedTools.length === 0) {
    return {
      evaluator: 'SPECIALIST_SCOPE_CORRECT',
      passed: true,
      score: 1,
      reasoning: 'No tools executed; specialist scope respected.',
    };
  }

  for (const exec of executedTools) {
    const specialist = exec.specialist as SpecialistId | undefined;
    if (specialist && TOOL_ALLOWLIST[specialist]) {
      const allowed = TOOL_ALLOWLIST[specialist].has(exec.toolName);
      if (!allowed) {
        return {
          evaluator: 'SPECIALIST_SCOPE_CORRECT',
          passed: false,
          score: 0,
          reasoning: `Tool "${exec.toolName}" is out-of-scope for specialist "${specialist}".`,
        };
      }
    }
  }

  return {
    evaluator: 'SPECIALIST_SCOPE_CORRECT',
    passed: true,
    score: 1,
    reasoning: 'All executed tools strictly matched specialist allowlists.',
  };
};

/**
 * 4. TOOL_SELECTION_CORRECT
 * Evaluates whether required tools were invoked with expected gate outcomes.
 */
export const evalToolSelectionCorrect: BinaryEvaluatorFn = (context) => {
  const { turn, executedTools } = context;

  if (!turn.expectedTools || turn.expectedTools.length === 0) {
    return {
      evaluator: 'TOOL_SELECTION_CORRECT',
      passed: true,
      score: 1,
      reasoning: 'No tools specifically expected for this turn.',
    };
  }

  const executedNames = (executedTools ?? []).map((t) => t.toolName);

  for (const exp of turn.expectedTools) {
    const found = executedTools?.find((t) => t.toolName === exp.tool);
    if (!found) {
      return {
        evaluator: 'TOOL_SELECTION_CORRECT',
        passed: false,
        score: 0,
        reasoning: `Expected tool "${exp.tool}" was not invoked. Executed: [${executedNames.join(', ')}].`,
      };
    }

    if (exp.gateOutcome && found.outcome && exp.gateOutcome !== found.outcome) {
      return {
        evaluator: 'TOOL_SELECTION_CORRECT',
        passed: false,
        score: 0,
        reasoning: `Tool "${exp.tool}" had outcome "${found.outcome}", expected "${exp.gateOutcome}".`,
      };
    }
  }

  return {
    evaluator: 'TOOL_SELECTION_CORRECT',
    passed: true,
    score: 1,
    reasoning: 'All expected tools were correctly selected and executed.',
  };
};

/**
 * 5. STATE_PRESERVED
 * Evaluates whether state consistency and invariants are maintained across turns.
 */
export const evalStatePreserved: BinaryEvaluatorFn = (context) => {
  const { initialState, finalState } = context;

  if (initialState) {
    // 1. Message history must strictly grow (no truncation)
    if (
      initialState.messages &&
      finalState.messages.length < initialState.messages.length
    ) {
      return {
        evaluator: 'STATE_PRESERVED',
        passed: false,
        score: 0,
        reasoning: 'Conversation messages were truncated across turn execution.',
      };
    }

    // 2. User ID must remain preserved
    if (initialState.user?.id && finalState.user?.id !== initialState.user.id) {
      return {
        evaluator: 'STATE_PRESERVED',
        passed: false,
        score: 0,
        reasoning: `User ID changed from "${initialState.user.id}" to "${finalState.user?.id ?? 'null'}".`,
      };
    }

    // 3. Handoff count must not decrease
    if (
      initialState.routing &&
      finalState.routing.handoffCount < initialState.routing.handoffCount
    ) {
      return {
        evaluator: 'STATE_PRESERVED',
        passed: false,
        score: 0,
        reasoning: 'Routing handoffCount decreased unexpectedly.',
      };
    }
  }

  return {
    evaluator: 'STATE_PRESERVED',
    passed: true,
    score: 1,
    reasoning: 'Conversation state, user identity, and routing history preserved without regression.',
  };
};

/**
 * 6. KNOWLEDGE_GROUNDED
 * Evaluates whether response contains expected grounded keywords and lacks negative keywords.
 */
export const evalKnowledgeGrounded: BinaryEvaluatorFn = (context) => {
  const { turn } = context;
  const assistantMessage = extractLastAssistantMessage(context).toLowerCase();

  // Check expected positive keywords (at least one must match if provided)
  if (turn.expectedResponseKeywords && turn.expectedResponseKeywords.length > 0) {
    const hasAnyPositive = turn.expectedResponseKeywords.some((kw) =>
      assistantMessage.includes(kw.toLowerCase())
    );

    if (!hasAnyPositive) {
      return {
        evaluator: 'KNOWLEDGE_GROUNDED',
        passed: false,
        score: 0,
        reasoning: `Assistant response did not contain any expected keywords: [${turn.expectedResponseKeywords.join(', ')}].`,
      };
    }
  }

  // Check negative keywords (none must match)
  if (
    turn.expectedResponseNegativeKeywords &&
    turn.expectedResponseNegativeKeywords.length > 0
  ) {
    for (const neg of turn.expectedResponseNegativeKeywords) {
      if (assistantMessage.includes(neg.toLowerCase())) {
        return {
          evaluator: 'KNOWLEDGE_GROUNDED',
          passed: false,
          score: 0,
          reasoning: `Assistant response contained forbidden negative keyword: "${neg}".`,
        };
      }
    }
  }

  return {
    evaluator: 'KNOWLEDGE_GROUNDED',
    passed: true,
    score: 1,
    reasoning: 'Response content aligns with grounded knowledge and keyword expectations.',
  };
};

/**
 * 7. WORKFLOW_COMPLETED
 * Evaluates whether workflow reached the expected terminal or intermediate status.
 */
export const evalWorkflowCompleted: BinaryEvaluatorFn = (context) => {
  const { turn, finalState } = context;

  if (!turn.expectedWorkflowStatus) {
    return {
      evaluator: 'WORKFLOW_COMPLETED',
      passed: true,
      score: 1,
      reasoning: 'No specific workflowStatus expected for this turn.',
    };
  }

  if (finalState.workflowStatus === turn.expectedWorkflowStatus) {
    return {
      evaluator: 'WORKFLOW_COMPLETED',
      passed: true,
      score: 1,
      reasoning: `Workflow status matched expected "${turn.expectedWorkflowStatus}".`,
    };
  }

  return {
    evaluator: 'WORKFLOW_COMPLETED',
    passed: false,
    score: 0,
    reasoning: `Expected workflowStatus "${turn.expectedWorkflowStatus}", but received "${finalState.workflowStatus}".`,
  };
};

/**
 * 8. RESOLUTION_CORRECT
 * Evaluates whether the customer turn resulted in an appropriate customer resolution.
 */
export const evalResolutionCorrect: BinaryEvaluatorFn = (context) => {
  const { turn } = context;
  const assistantMessage = extractLastAssistantMessage(context);

  if (turn.expectedWorkflowStatus === 'COMPLETED') {
    if (assistantMessage.trim().length === 0) {
      return {
        evaluator: 'RESOLUTION_CORRECT',
        passed: false,
        score: 0,
        reasoning: 'Workflow marked COMPLETED but assistant emitted an empty response message.',
      };
    }
  } else if (turn.expectedWorkflowStatus === 'WAITING_FOR_USER_INPUT') {
    if (!assistantMessage.includes('?') && !assistantMessage.toLowerCase().includes('please')) {
      return {
        evaluator: 'RESOLUTION_CORRECT',
        passed: false,
        score: 0,
        reasoning: 'Workflow is WAITING_FOR_USER_INPUT but assistant did not prompt the user for input.',
      };
    }
  } else if (turn.expectedWorkflowStatus === 'ESCALATED') {
    const msgLower = assistantMessage.toLowerCase();
    const hasEscalationPrompt =
      msgLower.includes('support') ||
      msgLower.includes('human') ||
      msgLower.includes('representative') ||
      msgLower.includes('agent');

    if (!hasEscalationPrompt) {
      return {
        evaluator: 'RESOLUTION_CORRECT',
        passed: false,
        score: 0,
        reasoning: 'Workflow is ESCALATED but assistant message does not inform customer of human support handoff.',
      };
    }
  }

  return {
    evaluator: 'RESOLUTION_CORRECT',
    passed: true,
    score: 1,
    reasoning: 'Customer interaction successfully resolved according to scenario policy.',
  };
};

export const ALL_BINARY_EVALUATORS = [
  evalRoutingCorrect,
  evalHandoffCorrect,
  evalSpecialistScopeCorrect,
  evalToolSelectionCorrect,
  evalStatePreserved,
  evalKnowledgeGrounded,
  evalWorkflowCompleted,
  evalResolutionCorrect,
];
