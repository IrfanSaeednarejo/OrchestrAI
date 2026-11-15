// src/components/ops/trace-timeline.test.tsx
// Phase 18 Step 5: Tests for TraceTimeline and HandoffBreadcrumbs components.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TraceTimeline } from './trace-timeline';
import { HandoffBreadcrumbs } from './handoff-breadcrumbs';
import type { OpsTimelineEvent } from '../../types/ops';

describe('TraceTimeline', () => {
  it('renders empty fallback when timeline is empty', () => {
    render(<TraceTimeline timeline={[]} />);
    expect(screen.getByTestId('empty-timeline')).toBeInTheDocument();
  });

  it('renders routing and agent events with tool execution cards', () => {
    const mockTimeline: OpsTimelineEvent[] = [
      {
        type: 'routing',
        timestamp: '2026-01-01T10:00:00Z',
        sourceAgent: 'supervisor_router',
        destinationAgent: 'order_tracking',
        intent: 'ORDER_STATUS',
        decisionType: 'INITIAL_ROUTE',
        reason: 'User requested tracking status for order #123',
      },
      {
        type: 'agent',
        timestamp: '2026-01-01T10:00:01Z',
        agent: 'order_tracking',
        status: 'success',
        duration: 320,
        error: null,
        tools: [
          {
            type: 'tool',
            timestamp: '2026-01-01T10:00:01Z',
            tool: 'get_order',
            status: 'success',
            duration: 85,
            error: null,
          },
          {
            type: 'tool',
            timestamp: '2026-01-01T10:00:02Z',
            tool: 'get_shipment_status',
            status: 'failure',
            duration: 120,
            error: 'Carrier API timeout',
          },
        ],
      },
    ];

    render(<TraceTimeline timeline={mockTimeline} />);

    // Routing assertions
    expect(screen.getByTestId('timeline-routing-event-0')).toBeInTheDocument();
    expect(screen.getByText('INITIAL_ROUTE')).toBeInTheDocument();
    expect(screen.getByText('ORDER_STATUS')).toBeInTheDocument();
    expect(
      screen.getByText(/User requested tracking status for order #123/i)
    ).toBeInTheDocument();

    // Agent assertions
    expect(screen.getByTestId('timeline-agent-event-1')).toBeInTheDocument();
    expect(screen.getByText('320ms')).toBeInTheDocument();

    // Tools assertions
    expect(screen.getByTestId('tool-card-get_order')).toBeInTheDocument();
    expect(screen.getByTestId('tool-card-get_shipment_status')).toBeInTheDocument();

    // Expand failed tool card to verify error output
    const failedToolButton = screen.getByRole('button', {
      name: /get_shipment_status/i,
    });
    fireEvent.click(failedToolButton);
    expect(screen.getByText('Carrier API timeout')).toBeInTheDocument();
  });
});

describe('HandoffBreadcrumbs', () => {
  it('renders breadcrumb path with initial router and active specialist', () => {
    render(<HandoffBreadcrumbs handoffPath={['payment', 'refund']} />);

    expect(screen.getByTestId('handoff-breadcrumbs')).toBeInTheDocument();
    expect(screen.getByText('Supervisor Router')).toBeInTheDocument();
    expect(screen.getByText('Payments & Billing')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders nothing when handoffPath is empty', () => {
    const { container } = render(<HandoffBreadcrumbs handoffPath={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

