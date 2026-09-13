import { describe, it, expect } from 'vitest';
import { ConversationStateAnnotation } from './conversation-state.js';
import { StateGraph, MemorySaver } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

describe('ConversationState Reducers', () => {
  const buildTestApp = () => {
    // We build the smallest possible single-node graph purely to exercise reducers.
    // We use MemorySaver so we can test sequential updates across invokes easily.
    const checkpointer = new MemorySaver();
    const builder = new StateGraph(ConversationStateAnnotation)
      .addNode('tester', () => {
        // Dummy node that does nothing — updates are passed externally via invoke
        return {};
      })
      .addEdge('__start__', 'tester');
    return { app: builder.compile({ checkpointer }), config: { configurable: { thread_id: 'test-thread' } } };
  };

  it('messages: sequential updates accumulate', async () => {
    const { app, config } = buildTestApp();
    let state = await app.invoke({ messages: [new HumanMessage('Hello')] }, config);
    expect(state.messages.length).toBe(1);
    expect(state.messages[0]?.content).toBe('Hello');

    state = await app.invoke({ messages: [new AIMessage('Hi')] }, config);
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]?.content).toBe('Hi');
  });

  it('routing.history: sequential updates append', async () => {
    const { app, config } = buildTestApp();

    let state = await app.invoke({ routing: { history: [{ fromAgent: null, toAgent: 'A', reason: 'Start', timestamp: '2020' }] } }, config);
    expect(state.routing.history.length).toBe(1);

    state = await app.invoke({ routing: { history: [{ fromAgent: 'A', toAgent: 'B', reason: 'Handoff', timestamp: '2021' }] } }, config);
    expect(state.routing.history.length).toBe(2);
    expect(state.routing.history[0]?.toAgent).toBe('A');
    expect(state.routing.history[1]?.toAgent).toBe('B');
  });

  it('routing.handoffCount: delta accumulation, NOT overwrite', async () => {
    const { app, config } = buildTestApp();

    let state = await app.invoke({ routing: { handoffCount: 1 } }, config);
    expect(state.routing.handoffCount).toBe(1);

    state = await app.invoke({ routing: { handoffCount: 1 } }, config);
    // Must be 2 (1+1), not 1 (overwrite). Proves delta accumulation.
    expect(state.routing.handoffCount).toBe(2);
  });

  it('routing.visitedAgents: deduplicated merge', async () => {
    const { app, config } = buildTestApp();

    let state = await app.invoke({ routing: { visitedAgents: ['agentA'] } }, config);
    expect(state.routing.visitedAgents).toEqual(['agentA']);

    state = await app.invoke({ routing: { visitedAgents: ['agentA', 'agentB'] } }, config);
    // Must be ['agentA', 'agentB'], NOT ['agentA', 'agentA', 'agentB']
    expect(state.routing.visitedAgents).toEqual(['agentA', 'agentB']);
  });

  it('identity: full object overwrite', async () => {
    const { app, config } = buildTestApp();

    let state = await app.invoke({ identity: { status: 'UNVERIFIED', verificationMethod: null, verifiedAt: null } }, config);
    expect(state.identity?.status).toBe('UNVERIFIED');
    expect(state.identity?.verificationMethod).toBeNull();

    state = await app.invoke({ identity: { status: 'VERIFIED', verificationMethod: 'Email', verifiedAt: '2022-01-01T00:00:00Z' } }, config);
    expect(state.identity?.status).toBe('VERIFIED');
    expect(state.identity?.verificationMethod).toBe('Email');
    // Old verifiedAt is replaced — no lingering prior-state fields
    expect(state.identity?.verifiedAt).toBe('2022-01-01T00:00:00Z');
  });

  it('activeWorkflow: full object overwrite', async () => {
    const { app, config } = buildTestApp();

    let state = await app.invoke({
      activeWorkflow: {
        workflowId: 'wf-1',
        originatingIntent: 'return_request',
        currentStep: 'awaiting_confirmation',
        blockedBy: 'identity_check',
        returnTo: null,
        resumeContext: null,
      },
    }, config);
    expect(state.activeWorkflow?.workflowId).toBe('wf-1');
    expect(state.activeWorkflow?.blockedBy).toBe('identity_check');

    // Full overwrite — old blockedBy must be gone
    state = await app.invoke({
      activeWorkflow: {
        workflowId: 'wf-2',
        originatingIntent: 'cancel_order',
        currentStep: null,
        blockedBy: null,
        returnTo: null,
        resumeContext: null,
      },
    }, config);
    expect(state.activeWorkflow?.workflowId).toBe('wf-2');
    expect(state.activeWorkflow?.currentStep).toBeNull();
    expect(state.activeWorkflow?.blockedBy).toBeNull();
  });

  it('workflowStatus, currentDomain, currentIntent, user: simple overwrite', async () => {
    const { app, config } = buildTestApp();

    let state = await app.invoke({
      workflowStatus: 'ACTIVE',
      currentDomain: 'marketplace',
      currentIntent: 'track_order',
      user: { id: 'u1' },
    }, config);

    expect(state.workflowStatus).toBe('ACTIVE');
    expect(state.currentDomain).toBe('marketplace');
    expect(state.currentIntent).toBe('track_order');
    expect(state.user?.id).toBe('u1');

    state = await app.invoke({
      workflowStatus: 'COMPLETED',
      currentDomain: 'support',
      currentIntent: 'general_help',
      user: { id: 'u2' },
    }, config);

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.currentDomain).toBe('support');
    expect(state.currentIntent).toBe('general_help');
    expect(state.user?.id).toBe('u2');
  });
});
