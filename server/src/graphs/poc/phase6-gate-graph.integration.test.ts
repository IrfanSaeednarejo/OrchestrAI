// Identity is supplied via invoke input because identity-update.ts may only be imported by the future Account Access specialist; this test simulates what Account Access will write.

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { inArray } from 'drizzle-orm';
import { db } from '../../persistence/db/client.js';
import {
    users,
    conversations,
    agentExecutions,
    toolExecutions,
    orders,
    payments,
} from '../../persistence/db/schema.js';
import {
    createUser,
    createOrder,
    createPayment,
    type User,
    type Order,
} from '../../persistence/repositories/marketplace.repository.js';
import {
    createConversation,
    type Conversation,
} from '../../persistence/repositories/conversation.repository.js';
import {
    createAgentExecution,
    getToolExecutionsByAgentExecutionId,
    type AgentExecution,
} from '../../persistence/repositories/orchestration.repository.js';
import { getPayment, getPaymentMetadata } from '../../tools/queries/payment.tools.js';
import { getOrder, getOrderMetadata } from '../../tools/queries/order.tools.js';
import { searchKnowledge, searchKnowledgeMetadata } from '../../tools/queries/knowledge.tools.js';
import { buildPhase6GateGraph } from './phase6-gate-graph.js';

// ---------------------------------------------------------------------------
// Mock embeddings-client - exact pattern as scoped-retrieval.test.ts
// ---------------------------------------------------------------------------

vi.mock('../../knowledge/embeddings-client.js', () => ({
    embedDocument: vi.fn(),
    embedQuery: vi.fn(),
}));

import { embedQuery } from '../../knowledge/embeddings-client.js';

describe('Phase 6 Gate Graph Integration Proof', () => {
    let fixtureUser: User;
    let fixtureConversation: Conversation;
    let fixtureOrder: Order;
    let fixturePaymentId: string;

    let agentExecutionA: AgentExecution;
    let agentExecutionB: AgentExecution;
    let agentExecutionC: AgentExecution;

    beforeAll(async () => {
        fixtureUser = await createUser({
            name: 'Phase 6 Integration User',
            email: `phase6-${Date.now()}@example.com`,
            defaultAddress: '123 Integration Way, Austin, TX',
        });

        fixtureConversation = await createConversation({
            userId: fixtureUser.id,
            status: 'active',
        });

        agentExecutionA = await createAgentExecution({
            conversationId: fixtureConversation.id,
            agent: 'payment',
            status: 'success',
        });

        agentExecutionB = await createAgentExecution({
            conversationId: fixtureConversation.id,
            agent: 'profile',
            status: 'success',
        });

        agentExecutionC = await createAgentExecution({
            conversationId: fixtureConversation.id,
            agent: 'order_tracking',
            status: 'success',
        });

        fixtureOrder = await createOrder({
            userId: fixtureUser.id,
            status: 'paid',
            shippingAddressSnapshot: '123 Integration Way, Austin, TX',
            totalAmount: '199.99',
        });

        const payment = await createPayment({
            orderId: fixtureOrder.id,
            amount: '199.99',
            status: 'captured',
            method: 'credit_card',
        });
        fixturePaymentId = payment.id;
    });

    afterAll(async () => {
        const executionIds = [agentExecutionA?.id, agentExecutionB?.id, agentExecutionC?.id].filter(
            (id): id is string => typeof id === 'string'
        );

        if (executionIds.length > 0) {
            await db.delete(toolExecutions).where(inArray(toolExecutions.agentExecutionId, executionIds));
            await db.delete(agentExecutions).where(inArray(agentExecutions.id, executionIds));
        }

        if (fixturePaymentId) {
            await db.delete(payments).where(inArray(payments.id, [fixturePaymentId]));
        }

        if (fixtureOrder?.id) {
            await db.delete(orders).where(inArray(orders.id, [fixtureOrder.id]));
        }

        if (fixtureConversation?.id) {
            await db.delete(conversations).where(inArray(conversations.id, [fixtureConversation.id]));
        }

        if (fixtureUser?.id) {
            await db.delete(users).where(inArray(users.id, [fixtureUser.id]));
        }
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Scenario A - BLOCKED then resumed (Scenario 5 shape)', async () => {
        const checkpointer = new MemorySaver();
        const graph = buildPhase6GateGraph(checkpointer);
        const threadId = crypto.randomUUID();

        // 1. Invoke: specialist = payment, tool = get_payment (FULL), identity = LIGHTLY_VERIFIED
        const step1State = await graph.invoke(
            {
                identity: {
                    status: 'LIGHTLY_VERIFIED',
                    verificationMethod: 'sms_otp',
                    verifiedAt: new Date().toISOString(),
                },
            },
            {
                configurable: {
                    thread_id: threadId,
                    specialist: 'payment',
                    toolFn: getPayment,
                    metadata: getPaymentMetadata,
                    rawInput: { orderId: fixtureOrder.id },
                    agentExecutionId: agentExecutionA.id,
                },
            }
        );

        // Assert: state.workflowStatus === 'WAITING_FOR_USER_INPUT'
        expect(step1State.workflowStatus).toBe('WAITING_FOR_USER_INPUT');

        // Assert: state.activeWorkflow has all six fields, blockedBy === 'VERIFICATION_FULL'
        expect(step1State.activeWorkflow).toBeDefined();
        expect(step1State.activeWorkflow?.blockedBy).toBe('VERIFICATION_FULL');
        if (step1State.activeWorkflow) {
            expect('workflowId' in step1State.activeWorkflow).toBe(true);
            expect('originatingIntent' in step1State.activeWorkflow).toBe(true);
            expect('currentStep' in step1State.activeWorkflow).toBe(true);
            expect('blockedBy' in step1State.activeWorkflow).toBe(true);
            expect('returnTo' in step1State.activeWorkflow).toBe(true);
            expect('resumeContext' in step1State.activeWorkflow).toBe(true);
        }
        expect(Object.keys(step1State.activeWorkflow ?? {})).toEqual(
            expect.arrayContaining([
                'workflowId',
                'originatingIntent',
                'currentStep',
                'blockedBy',
                'returnTo',
                'resumeContext',
            ])
        );

        // Assert: tool body did not run (no successful row; exactly one failure row with VERIFICATION_REQUIRED)
        const executionsStep1 = await getToolExecutionsByAgentExecutionId(agentExecutionA.id);
        expect(executionsStep1).toHaveLength(1);
        expect(executionsStep1[0]?.status).toBe('failure');
        expect(executionsStep1[0]?.error).toContain('VERIFICATION_REQUIRED');
        expect(executionsStep1.filter((e) => e.status === 'success')).toHaveLength(0);

        // 2. Read the state back with graph.getState({ configurable: { thread_id } })
        const roundTripState = await graph.getState({ configurable: { thread_id: threadId } });
        expect(roundTripState.values.activeWorkflow).toEqual(step1State.activeWorkflow);

        // 3. Second invoke on the SAME thread_id with identity = VERIFIED
        const step3State = await graph.invoke(
            {
                identity: {
                    status: 'VERIFIED',
                    verificationMethod: 'sms_otp',
                    verifiedAt: new Date().toISOString(),
                },
            },
            {
                configurable: {
                    thread_id: threadId,
                    specialist: 'payment',
                    toolFn: getPayment,
                    metadata: getPaymentMetadata,
                    rawInput: { orderId: fixtureOrder.id },
                    agentExecutionId: agentExecutionA.id,
                },
            }
        );

        // Assert: workflowStatus === 'COMPLETED'
        expect(step3State.workflowStatus).toBe('COMPLETED');

        // Assert: tool_executions row with status 'success' for get_payment now exists
        const executionsStep3 = await getToolExecutionsByAgentExecutionId(agentExecutionA.id);
        const successRows = executionsStep3.filter(
            (e) => e.status === 'success' && e.tool === 'get_payment'
        );
        expect(successRows).toHaveLength(1);
    });

    it('Scenario B - DENIED: profile calling search_knowledge', async () => {
        const checkpointer = new MemorySaver();
        const graph = buildPhase6GateGraph(checkpointer);
        const threadId = crypto.randomUUID();

        const stateB = await graph.invoke(
            {
                identity: {
                    status: 'VERIFIED',
                    verificationMethod: 'sms_otp',
                    verifiedAt: new Date().toISOString(),
                },
            },
            {
                configurable: {
                    thread_id: threadId,
                    specialist: 'profile',
                    toolFn: searchKnowledge,
                    metadata: searchKnowledgeMetadata,
                    rawInput: { query: 'returns policy', domains: ['orders'] },
                    agentExecutionId: agentExecutionB.id,
                },
            }
        );

        // Assert: workflowStatus === 'FAILED'
        expect(stateB.workflowStatus).toBe('FAILED');

        // Assert: activeWorkflow is unchanged (still null on a fresh thread)
        expect(stateB.activeWorkflow).toBeNull();

        // Assert: tool body did not run (embedQuery was never called)
        expect(embedQuery).not.toHaveBeenCalled();

        // Assert: tool_executions row with status 'failure' and denied error code TOOL_NOT_PERMITTED
        const executionsB = await getToolExecutionsByAgentExecutionId(agentExecutionB.id);
        expect(executionsB).toHaveLength(1);
        expect(executionsB[0]?.status).toBe('failure');
        expect(executionsB[0]?.error).toContain('TOOL_NOT_PERMITTED');
        expect(executionsB.filter((e) => e.status === 'success')).toHaveLength(0);
    });

    it('Scenario C - ALLOWED directly: order_tracking calling get_order', async () => {
        const checkpointer = new MemorySaver();
        const graph = buildPhase6GateGraph(checkpointer);
        const threadId = crypto.randomUUID();

        const stateC = await graph.invoke(
            {
                identity: {
                    status: 'LIGHTLY_VERIFIED',
                    verificationMethod: 'sms_otp',
                    verifiedAt: new Date().toISOString(),
                },
            },
            {
                configurable: {
                    thread_id: threadId,
                    specialist: 'order_tracking',
                    toolFn: getOrder,
                    metadata: getOrderMetadata,
                    rawInput: { orderId: fixtureOrder.id },
                    agentExecutionId: agentExecutionC.id,
                },
            }
        );

        // Assert: workflowStatus === 'COMPLETED'
        expect(stateC.workflowStatus).toBe('COMPLETED');

        // Assert: activeWorkflow stays null
        expect(stateC.activeWorkflow).toBeNull();

        // Assert: one 'success' tool_executions row
        const executionsC = await getToolExecutionsByAgentExecutionId(agentExecutionC.id);
        expect(executionsC).toHaveLength(1);
        expect(executionsC[0]?.status).toBe('success');
        expect(executionsC[0]?.tool).toBe('get_order');
    });
});
