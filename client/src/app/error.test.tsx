// client/src/app/error.test.tsx
// Phase 19 Step 3: Tests for Error and NotFound fallback components.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorComponent from './error';
import NotFoundComponent from './not-found';

describe('Phase 19 Step 3: Client Error & NotFound Boundaries', () => {
  it('renders Error boundary fallback and triggers reset when Try Again is clicked', () => {
    const resetMock = vi.fn();
    const testError = new Error('Test crash in child component');

    render(<ErrorComponent error={testError} reset={resetMock} />);

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Test crash in child component')).toBeDefined();

    const tryAgainButton = screen.getByRole('button', { name: /try again/i });
    expect(tryAgainButton).toBeDefined();

    fireEvent.click(tryAgainButton);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('renders NotFound fallback with links to home and ops dashboard', () => {
    render(<NotFoundComponent />);

    expect(screen.getByText('404 - Page Not Found')).toBeDefined();
    expect(screen.getByRole('link', { name: /back to support chat/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /ops dashboard/i })).toBeDefined();
  });
});

