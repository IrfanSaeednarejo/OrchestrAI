// src/app/login/page.test.tsx
// Phase 22: Tests for the dedicated Login page.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { AuthProvider } from '../../context/auth-context';
import * as apiClient from '../../lib/api-client';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'redirect' ? '/store' : null),
  }),
  usePathname: () => '/login',
}));

vi.mock('../../lib/api-client', () => ({
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login form elements with accessible labels', () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /Sign In to Your Account/i })).toBeInTheDocument();
    expect(screen.getByTestId('login-email-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('link-to-register')).toBeInTheDocument();
  });

  it('submits login credentials and redirects to the requested url', async () => {
    vi.mocked(apiClient.apiLogin).mockResolvedValueOnce({
      token: 'jwt-123',
      user: {
        id: 'u-1',
        name: 'John Doe',
        email: 'john@example.com',
        defaultAddress: '123 St',
      },
    });

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'Secret1234!' },
    });
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(apiClient.apiLogin).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'Secret1234!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/store');
    });
  });

  it('displays error banner when login API rejects', async () => {
    vi.mocked(apiClient.apiLogin).mockRejectedValueOnce(
      new Error('Invalid email or password')
    );

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    fireEvent.change(screen.getByTestId('login-email-input'), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByTestId('login-password-input'), {
      target: { value: 'WrongPass' },
    });
    fireEvent.click(screen.getByTestId('login-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('login-error-banner')).toHaveTextContent(
        'Invalid email or password'
      );
    });
  });
});

