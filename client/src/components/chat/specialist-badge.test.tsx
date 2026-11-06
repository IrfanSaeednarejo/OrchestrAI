// src/components/chat/specialist-badge.test.tsx
// Phase 17 Step 5b: Tests for SpecialistBadge formatting, fallback, and handoff notice.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpecialistBadge } from './specialist-badge';

describe('SpecialistBadge Component', () => {
  it('formats known specialist agents with proper display label', () => {
    const { rerender } = render(<SpecialistBadge currentAgent="order_tracking" />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('Order Tracking Specialist');

    rerender(<SpecialistBadge currentAgent="payment" />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('Payments & Billing Specialist');

    rerender(<SpecialistBadge currentAgent="returns" />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('Returns & Exchanges Specialist');

    rerender(<SpecialistBadge currentAgent="account_access" />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('Account Access & Security Specialist');
  });

  it('tolerates null, undefined, or empty agent string with neutral fallback', () => {
    const { rerender } = render(<SpecialistBadge currentAgent={null} />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('AI Support Specialist');

    rerender(<SpecialistBadge currentAgent={undefined} />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('AI Support Specialist');

    rerender(<SpecialistBadge currentAgent="" />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('AI Support Specialist');
  });

  it('tolerates unknown agent string gracefully without crashing', () => {
    render(<SpecialistBadge currentAgent="novel_custom_agent" />);
    expect(screen.getByTestId('specialist-badge')).toHaveTextContent('novel custom agent Specialist');
  });

  it('renders handoff count badge when handoffCount is greater than 0', () => {
    const { rerender } = render(
      <SpecialistBadge currentAgent="order_tracking" handoffCount={0} />
    );
    expect(screen.queryByTestId('handoff-count-badge')).toBeNull();

    rerender(<SpecialistBadge currentAgent="order_tracking" handoffCount={2} />);
    expect(screen.getByTestId('handoff-count-badge')).toHaveTextContent('Handoffs: 2');
  });
});

