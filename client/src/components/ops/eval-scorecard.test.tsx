// src/components/ops/eval-scorecard.test.tsx
// Phase 18 Step 6: Tests for EvalScorecard component.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvalScorecard } from './eval-scorecard';
import type { BenchmarkReport } from '../../types/ops';

const mockReport: BenchmarkReport = {
  totalScenarios: 2,
  passedScenarios: 2,
  passRate: 1.0,
  byDomain: {
    order_tracking: { passed: 1, total: 1, rate: 1.0 },
    payment: { passed: 1, total: 1, rate: 1.0 },
  },
  byEvaluator: {
    ROUTING_CORRECT: { passed: 2, total: 2, rate: 1.0 },
    TOOL_SELECTION_CORRECT: { passed: 2, total: 2, rate: 1.0 },
  },
  scenarioResults: [
    {
      scenario: {
        id: 'SCENARIO_1',
        name: 'Order Status Query',
        domain: 'order_tracking',
        pattern: 'PATTERN_A',
      },
      scenarioPassed: true,
      passingEvaluators: 8,
      totalEvaluators: 8,
    },
    {
      scenario: {
        id: 'SCENARIO_3',
        name: 'Duplicate Payment Refund',
        domain: 'payment',
        pattern: 'PATTERN_B',
      },
      scenarioPassed: true,
      passingEvaluators: 8,
      totalEvaluators: 8,
    },
  ],
};

describe('EvalScorecard', () => {
  it('renders overall pass rate and totals', () => {
    render(<EvalScorecard report={mockReport} />);

    expect(screen.getByTestId('overall-pass-rate')).toHaveTextContent('100.0%');
    expect(screen.getByText(/2 of 2 passed/i)).toBeInTheDocument();
  });

  it('renders domain and evaluator breakdowns', () => {
    render(<EvalScorecard report={mockReport} />);

    expect(screen.getByTestId('domain-stat-order_tracking')).toBeInTheDocument();
    expect(screen.getByTestId('domain-stat-payment')).toBeInTheDocument();
    expect(screen.getByTestId('evaluator-stat-ROUTING_CORRECT')).toBeInTheDocument();
    expect(screen.getByTestId('evaluator-stat-TOOL_SELECTION_CORRECT')).toBeInTheDocument();
  });

  it('filters scenario table by search term', () => {
    render(<EvalScorecard report={mockReport} />);

    expect(screen.getByText('Order Status Query')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Payment Refund')).toBeInTheDocument();

    const searchInput = screen.getByTestId('scenario-search-input');
    fireEvent.change(searchInput, { target: { value: 'duplicate' } });

    expect(screen.queryByText('Order Status Query')).not.toBeInTheDocument();
    expect(screen.getByText('Duplicate Payment Refund')).toBeInTheDocument();
  });

  it('filters scenario table by domain dropdown', () => {
    render(<EvalScorecard report={mockReport} />);

    const domainFilter = screen.getByTestId('scenario-domain-filter');
    fireEvent.change(domainFilter, { target: { value: 'order_tracking' } });

    expect(screen.getByText('Order Status Query')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate Payment Refund')).not.toBeInTheDocument();
  });
});

