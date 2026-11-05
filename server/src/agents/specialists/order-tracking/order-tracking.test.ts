// src/agents/specialists/order-tracking/order-tracking.test.ts
// Phase 9: Unit tests for the Order Tracking specialist.
// Uses buildSingleNodeHarness (MemorySaver) + mocked @google/genai.
// Zero real Gemini API calls; zero real DB calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

// ---------------------------------------------------------------------------
// Mock @google/genai — must be hoisted before any import of the module under test
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

// Mock retrieveKnowledge so we don't need a real DB / embeddings in unit tests
vi.mock('../../../knowledge/retrieval.js', () => ({
  retrieveKnowledge: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

// Mock gatedExecuteTool so tool calls are fully controlled
vi.mock('../../../tools/gated-execution.js', () => ({
  gatedExecuteTool: vi.fn(),
}));

import { buildSingleNodeHarness } from '../../common/subgraph-harness.js';
import {
  orderTrackingNode,
  extractLastUserText,
  extractOrderId,
} from './order-tracking.js';
import { gatedExecuteTool } from '../../../tools/gated-execution.js';
import type { ConversationState } from '../../../state/conversation-state.js';

const mockGated = vi.mocked(gatedExecuteTool);

// ---------------------------------------------------------------------------
// Helpers — GatedToolResult<T> = ToolResult<T> & { gate: GateDecision }
// The shape is FLAT: { success, data/error, gate } — no nested "tool" key.
// ---------------------------------------------------------------------------

const FIXTURE_ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeAllowedOrderResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      id: FIXTURE_ORDER_ID,
      userId: 'user-1',
      status: 'shipped' as const,
      shippingAddressSnapshot: '1 Test St',
      totalAmount: '99.99',
      createdAt: new Date('2026-11-01'),
    },
  };
}

function makeAllowedShipmentResult() {
  return {
    gate: { outcome: 'ALLOWED' as const },
    success: true as const,
    data: {
      id: 'ship-1',
      orderId: FIXTURE_ORDER_ID,
      status: 'in_transit' as const,
      trackingNumber: 'TRK-9999',
      estimatedDelivery: new Date('2026-11-10'),
      carrier: 'FedEx',
    },
  };
}

// ---------------------------------------------------------------------------
// extractLastUserText
// ---------------------------------------------------------------------------

describe('extractLastUserText', () => {
  it('returns content of the last HumanMessage', () => {
    const state = { messages: [new HumanMessage('Where is my order?')] } as unknown as ConversationState;
    expect(extractLastUserText(state)).toBe('Where is my order?');
  });

  it('returns empty string when no human messages exist', () => {
    const state = { messages: [] } as unknown as ConversationState;
    expect(extractLastUserText(state)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractOrderId
// ---------------------------------------------------------------------------

describe('extractOrderId', () => {
  beforeEach(() => {
    mockGenerateContent.mockClear();
  });

  it('returns the UUID when LLM finds one', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: FIXTURE_ORDER_ID, confidence: 0.98 }),
    });

    const result = await extractOrderId(`My order is ${FIXTURE_ORDER_ID}`);
    expect(result.orderId).toBe(FIXTURE_ORDER_ID);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('returns null when LLM finds no UUID', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: null, confidence: 0.1 }),
    });

    const result = await extractOrderId('What happened to my package?');
    expect(result.orderId).toBeNull();
  });

  it('returns null and does not call LLM when given empty string', async () => {
    const result = await extractOrderId('');
    expect(result.orderId).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// orderTrackingNode (via buildSingleNodeHarness)
// ---------------------------------------------------------------------------

describe('orderTrackingNode', () => {
  const harness = buildSingleNodeHarness('order_tracking_node', orderTrackingNode);

  beforeEach(() => {
    mockGenerateContent.mockClear();
    mockGated.mockClear();
  });

  it('emits WAITING_FOR_USER_INPUT when no orderId extractable', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: null, confidence: 0.05 }),
    });

    const state = await harness.invoke({
      messages: [new HumanMessage('What happened to my package?')],
    });

    expect(state.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(state.messages.at(-1)?.content).toMatch(/order ID/i);
    expect(mockGated).not.toHaveBeenCalled();
  });

  it('emits COMPLETED with order and shipment data', async () => {
    // Phase A: extract UUID
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: FIXTURE_ORDER_ID, confidence: 0.99 }),
    });
    // Phase B: get_order → allowed
    mockGated.mockResolvedValueOnce(makeAllowedOrderResult());
    // Phase B: get_shipment_status → allowed
    mockGated.mockResolvedValueOnce(makeAllowedShipmentResult());
    // Phase C: generate response
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ response: 'Your order is on its way! Tracking: TRK-9999.' }),
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Track order ${FIXTURE_ORDER_ID}`)],
    });

    expect(state.workflowStatus).toBe('COMPLETED');
    expect(state.messages.at(-1)?.content).toContain('TRK-9999');
  });

  it('emits FAILED when order is not found', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: FIXTURE_ORDER_ID, confidence: 0.95 }),
    });
    mockGated.mockResolvedValueOnce({
      gate: { outcome: 'ALLOWED' as const },
      success: false as const,
      error: { code: 'NOT_FOUND', message: 'Order not found.' },
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Track order ${FIXTURE_ORDER_ID}`)],
    });

    expect(state.workflowStatus).toBe('FAILED');
    expect(state.messages.at(-1)?.content).toMatch(/couldn't find/i);
  });

  it('emits WAITING_FOR_USER_INPUT with activeWorkflow when LIGHT gate blocks', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: FIXTURE_ORDER_ID, confidence: 0.95 }),
    });
    mockGated.mockResolvedValueOnce({
      gate: {
        outcome: 'BLOCKED' as const,
        reason: 'VERIFICATION_REQUIRED' as const,
        required: 'LIGHT' as const,
        current: 'UNVERIFIED' as const,
        tool: 'get_order',
        specialist: 'order_tracking' as const,
      },
      success: false as const,
      error: { code: 'GATE_BLOCKED', message: 'blocked' },
    });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Track order ${FIXTURE_ORDER_ID}`)],
      identity: null,
    });

    expect(state.workflowStatus).toBe('WAITING_FOR_USER_INPUT');
    expect(state.activeWorkflow?.returnTo?.agent).toBe('order_tracking');
    expect(state.activeWorkflow?.resumeContext).toMatchObject({ orderId: FIXTURE_ORDER_ID });
  });

  it('uses fallback response text when LLM response generation fails', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ orderId: FIXTURE_ORDER_ID, confidence: 0.99 }),
    });
    mockGated.mockResolvedValueOnce(makeAllowedOrderResult());
    mockGated.mockResolvedValueOnce(makeAllowedShipmentResult());
    // Response generation returns empty → triggers fallback
    mockGenerateContent.mockResolvedValueOnce({ text: '' });

    const state = await harness.invoke({
      messages: [new HumanMessage(`Track order ${FIXTURE_ORDER_ID}`)],
    });

    expect(state.workflowStatus).toBe('COMPLETED');
    // Fallback text should mention the order status
    expect(state.messages.at(-1)?.content).toMatch(/shipped/i);
  });
});
