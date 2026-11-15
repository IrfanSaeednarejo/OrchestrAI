// src/app/ops/evals/page.test.tsx
// Phase 18 Step 6: Tests for OpsEvalsPage.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OpsEvalsPage from './page';
import * as opsClient from '../../../lib/ops-client';
import type { BenchmarkReport } from '../../../types/ops';

vi.mock('../../../lib/ops-client', () => ({
  fetchOpsEvalResults: vi.fn(),
}));

const mockReport: BenchmarkReport = {
  totalScenarios: 30,
  passedScenarios: 30,
  passRate: 1.0,
  byDomain: {
    order_tracking: { passed: 10, total: 10, rate: 1.0 },
  },
  byEvaluator: {
    ROUTING_CORRECT: { passed: 30, total: 30, rate: 1.0 },
  },
  scenarioResults: [],
};

describe('OpsEvalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders evaluation benchmark dashboard', async () => {
    vi.mocked(opsClient.fetchOpsEvalResults).mockResolvedValue(mockReport);

    render(<OpsEvalsPage />);

    expect(screen.getByText(/Evaluation Benchmark Dashboard/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('eval-scorecard')).toBeInTheDocument();
      expect(screen.getByTestId('overall-pass-rate')).toHaveTextContent('100.0%');
    });
  });

  it('renders error banner when benchmark API call fails', async () => {
    vi.mocked(opsClient.fetchOpsEvalResults).mockRejectedValue(
      new Error('Evaluation runner failed')
    );

    render(<OpsEvalsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('evals-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/Evaluation runner failed/i)).toBeInTheDocument();
    });
  });
});

