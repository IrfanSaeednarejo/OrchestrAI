// Throwaway Phase 6 integration scaffolding, superseded by Phase 8's real parent graph; not a precursor to graphs/parent/.

import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
    ConversationStateAnnotation,
    type ConversationState,
    type ConversationStateUpdate,
    type ReturnTo,
} from '../../state/conversation-state.js';
import { gatedExecuteTool } from '../../tools/gated-execution.js';
import { buildBlockedWorkflowUpdate } from '../../state/blocked-workflow.js';
import type { SpecialistId } from '../../tools/permissions.js';
import type { ToolMetadata, ToolResult } from '../../tools/types.js';

export interface Phase6AttemptConfig {
    specialist: SpecialistId;
    toolFn: (rawInput: unknown) => Promise<ToolResult<unknown>>;
    metadata: ToolMetadata;
    rawInput: unknown;
    agentExecutionId: string;
    workflowId?: string | null;
    originatingIntent?: string | null;
    currentStep?: string | null;
    returnTo?: ReturnTo;
    resumeContext?: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isSpecialistId(value: unknown): value is SpecialistId {
    return (
        value === 'order_tracking' ||
        value === 'returns' ||
        value === 'payment' ||
        value === 'refund' ||
        value === 'profile' ||
        value === 'account_access'
    );
}

function isToolFn(value: unknown): value is (rawInput: unknown) => Promise<ToolResult<unknown>> {
    return typeof value === 'function';
}

function isToolMetadata(value: unknown): value is ToolMetadata {
    if (!isRecord(value)) {
        return false;
    }
    const name = value['name'];
    const req = value['requiredVerification'];
    if (typeof name !== 'string') {
        return false;
    }
    return req === 'NONE' || req === 'LIGHT' || req === 'FULL';
}

function isReturnTo(value: unknown): value is ReturnTo {
    if (!isRecord(value)) {
        return false;
    }
    return (
        typeof value['domain'] === 'string' &&
        typeof value['agent'] === 'string' &&
        (typeof value['workflowStep'] === 'string' || value['workflowStep'] === null)
    );
}

function isStringOrNull(value: unknown): value is string | null {
    return typeof value === 'string' || value === null;
}

export function extractAttemptConfig(
    configurable: Record<string, unknown> | undefined
): Phase6AttemptConfig {
    if (!configurable) {
        throw new Error('Configurable is required for attempt-tool node');
    }

    const container = isRecord(configurable['attempt']) ? configurable['attempt'] : configurable;

    const specialist = container['specialist'];
    if (!isSpecialistId(specialist)) {
        throw new Error('Valid specialist id is required in attempt configuration');
    }

    const toolFn = container['toolFn'];
    if (!isToolFn(toolFn)) {
        throw new Error('Valid tool function is required in attempt configuration');
    }

    const metadata = container['metadata'];
    if (!isToolMetadata(metadata)) {
        throw new Error('Valid tool metadata is required in attempt configuration');
    }

    const agentExecutionId = container['agentExecutionId'];
    if (typeof agentExecutionId !== 'string') {
        throw new Error('Valid agentExecutionId string is required in attempt configuration');
    }

    const rawInput = container['rawInput'];

    const rawReturnTo = container['returnTo'];
    const returnTo = isReturnTo(rawReturnTo) ? rawReturnTo : undefined;

    const rawWorkflowId = container['workflowId'];
    const workflowId = isStringOrNull(rawWorkflowId) ? rawWorkflowId : undefined;

    const rawOriginatingIntent = container['originatingIntent'];
    const originatingIntent = isStringOrNull(rawOriginatingIntent) ? rawOriginatingIntent : undefined;

    const rawCurrentStep = container['currentStep'];
    const currentStep = isStringOrNull(rawCurrentStep) ? rawCurrentStep : undefined;

    const rawResumeContext = container['resumeContext'];
    const resumeContext = isRecord(rawResumeContext) ? rawResumeContext : null;

    return {
        specialist,
        toolFn,
        metadata,
        rawInput,
        agentExecutionId,
        workflowId,
        originatingIntent,
        currentStep,
        returnTo,
        resumeContext,
    };
}

export async function attemptTool(
    state: ConversationState,
    config?: RunnableConfig
): Promise<ConversationStateUpdate> {
    const attempt = extractAttemptConfig(config?.configurable);

    const context = {
        agentExecutionId: attempt.agentExecutionId,
        specialist: attempt.specialist,
        identity: state.identity,
    };

    const result = await gatedExecuteTool(
        attempt.toolFn,
        attempt.metadata,
        attempt.rawInput,
        context
    );

    if (result.gate.outcome === 'ALLOWED') {
        return {
            workflowStatus: 'COMPLETED',
        };
    }

    if (result.gate.outcome === 'BLOCKED') {
        const returnTo: ReturnTo = attempt.returnTo ?? {
            domain: state.currentDomain ?? attempt.specialist,
            agent: attempt.specialist,
            workflowStep: attempt.metadata.name,
        };

        const blockedWorkflowUpdate = buildBlockedWorkflowUpdate({
            decision: result.gate,
            returnTo,
            workflowId: attempt.workflowId ?? state.activeWorkflow?.workflowId ?? null,
            originatingIntent: attempt.originatingIntent ?? state.currentIntent ?? null,
            currentStep: attempt.currentStep ?? attempt.metadata.name,
            resumeContext: attempt.resumeContext ?? null,
        });

        return {
            ...blockedWorkflowUpdate,
            workflowStatus: 'WAITING_FOR_USER_INPUT',
        };
    }

    return {
        workflowStatus: 'FAILED',
    };
}

export function buildPhase6GateGraph(checkpointer?: MemorySaver) {
    const workflow = new StateGraph(ConversationStateAnnotation)
        .addNode('attempt-tool', attemptTool)
        .addEdge(START, 'attempt-tool')
        .addEdge('attempt-tool', END);

    return workflow.compile({ checkpointer });
}

