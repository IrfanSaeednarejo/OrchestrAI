// src/components/navigation/top-nav.test.tsx
// Phase 18 Step 3 / Phase 22 Step 2: Tests for TopNav component.
// Phase 30 Step 2: Updated class assertions for design-system tokens.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopNav } from './top-nav';
import { AuthProvider } from '../../context/auth-context';
import { usePathname } from 'next/navigation';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

describe('TopNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('highlights Support Chat link when on root route', () => {
    vi.mocked(usePathname).mockReturnValue('/');

    render(
      <AuthProvider>
        <TopNav />
      </AuthProvider>
    );

    const chatLink = screen.getByTestId('nav-chat-link');
    const opsLink = screen.getByTestId('nav-ops-link');
    const storeLink = screen.getByTestId('nav-store-link');

    expect(chatLink).toHaveClass('bg-surface-hover');
    expect(opsLink).not.toHaveClass('bg-brand-primary');
    expect(storeLink).not.toHaveClass('bg-surface-hover');
  });

  it('highlights Store link when on /store route', () => {
    vi.mocked(usePathname).mockReturnValue('/store');

    render(
      <AuthProvider>
        <TopNav />
      </AuthProvider>
    );

    const storeLink = screen.getByTestId('nav-store-link');
    expect(storeLink).toHaveClass('bg-surface-hover');
  });

  it('highlights My Orders link when on /orders route', () => {
    vi.mocked(usePathname).mockReturnValue('/orders');

    render(
      <AuthProvider>
        <TopNav />
      </AuthProvider>
    );

    const ordersLink = screen.getByTestId('nav-orders-link');
    expect(ordersLink).toHaveClass('bg-surface-hover');
  });

  it('highlights Platform Ops link when on /ops route', () => {
    vi.mocked(usePathname).mockReturnValue('/ops');

    render(
      <AuthProvider>
        <TopNav />
      </AuthProvider>
    );

    const opsLink = screen.getByTestId('nav-ops-link');
    expect(opsLink).toHaveClass('bg-brand-primary');
  });

  it('displays user profile pill when authenticated', () => {
    vi.mocked(usePathname).mockReturnValue('/');

    render(
      <AuthProvider
        initialToken="test-token"
        initialUser={{
          id: 'u-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          defaultAddress: '123 St',
        }}
      >
        <TopNav />
      </AuthProvider>
    );

    expect(screen.getByTestId('nav-user-email')).toHaveTextContent('Jane Doe');
    expect(screen.getByTestId('nav-logout-btn')).toBeInTheDocument();
  });
});
