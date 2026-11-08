// src/components/chat/service-option-bar.test.tsx
// Phase 23: Tests for interactive service-option pill buttons.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServiceOptionBar } from './service-option-bar';
import type { ServiceOption } from '../../types/api';

const OPTIONS: ServiceOption[] = [
  { label: 'Track an Order', message: 'I need to track my order' },
  { label: 'Request a Return', message: 'I would like to request a return' },
  { label: 'Request a Refund', message: 'I need help with a refund' },
];

describe('ServiceOptionBar', () => {
  it('renders a button for each option', () => {
    render(<ServiceOptionBar options={OPTIONS} onSelect={vi.fn()} />);

    expect(screen.getByTestId('service-option-bar')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(OPTIONS.length);
    expect(screen.getByText('Track an Order')).toBeInTheDocument();
    expect(screen.getByText('Request a Return')).toBeInTheDocument();
    expect(screen.getByText('Request a Refund')).toBeInTheDocument();
  });

  it('calls onSelect with the option message when a button is clicked', () => {
    const onSelect = vi.fn();
    render(<ServiceOptionBar options={OPTIONS} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Track an Order'));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('I need to track my order');
  });

  it('calls onSelect with the correct message for each option', () => {
    const onSelect = vi.fn();
    render(<ServiceOptionBar options={OPTIONS} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Request a Refund'));
    expect(onSelect).toHaveBeenCalledWith('I need help with a refund');
  });

  it('disables all buttons when isStreaming is true', () => {
    render(<ServiceOptionBar options={OPTIONS} onSelect={vi.fn()} isStreaming={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('disables all buttons when isEscalated is true', () => {
    render(<ServiceOptionBar options={OPTIONS} onSelect={vi.fn()} isEscalated={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('does not call onSelect when button is disabled', () => {
    const onSelect = vi.fn();
    render(<ServiceOptionBar options={OPTIONS} onSelect={onSelect} isStreaming={true} />);

    fireEvent.click(screen.getByText('Track an Order'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders nothing when options is empty', () => {
    const { container } = render(<ServiceOptionBar options={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

