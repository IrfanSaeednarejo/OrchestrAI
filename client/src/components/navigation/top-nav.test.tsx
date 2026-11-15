// src/components/navigation/top-nav.test.tsx
// Phase 18 Step 3: Tests for TopNav component.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopNav } from './top-nav';
import { usePathname } from 'next/navigation';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

describe('TopNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('highlights Customer Chat link when on root route', () => {
    vi.mocked(usePathname).mockReturnValue('/');

    render(<TopNav />);

    const chatLink = screen.getByTestId('nav-chat-link');
    const opsLink = screen.getByTestId('nav-ops-link');

    expect(chatLink).toHaveClass('bg-slate-800');
    expect(opsLink).not.toHaveClass('bg-indigo-600');
  });

  it('highlights Platform Ops link when on /ops route', () => {
    vi.mocked(usePathname).mockReturnValue('/ops');

    render(<TopNav />);

    const chatLink = screen.getByTestId('nav-chat-link');
    const opsLink = screen.getByTestId('nav-ops-link');

    expect(opsLink).toHaveClass('bg-indigo-600');
    expect(chatLink).not.toHaveClass('bg-slate-800');
  });

  it('highlights Platform Ops link when on /ops sub-routes (e.g. /ops/traces/123)', () => {
    vi.mocked(usePathname).mockReturnValue('/ops/traces/123');

    render(<TopNav />);

    const opsLink = screen.getByTestId('nav-ops-link');
    expect(opsLink).toHaveClass('bg-indigo-600');
  });
});

