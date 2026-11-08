// src/app/register/page.test.tsx
// Phase 22: Tests for the dedicated Register page.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './page';
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
    get: (key: string) => (key === 'redirect' ? '/orders' : null),
  }),
  usePathname: () => '/register',
}));

vi.mock('../../lib/api-client', () => ({
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders registration form fields', () => {
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { name: /Create Customer Account/i })).toBeInTheDocument();
    expect(screen.getByTestId('register-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-email-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-address-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('register-submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('link-to-login')).toBeInTheDocument();
  });

  it('submits registration data and redirects to destination', async () => {
    vi.mocked(apiClient.apiRegister).mockResolvedValueOnce({
      token: 'reg-token-456',
      user: {
        id: 'u-reg',
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        defaultAddress: '742 Evergreen Terrace',
      },
    });

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    fireEvent.change(screen.getByTestId('register-name-input'), {
      target: { value: 'Sarah Connor' },
    });
    fireEvent.change(screen.getByTestId('register-email-input'), {
      target: { value: 'sarah@example.com' },
    });
    fireEvent.change(screen.getByTestId('register-address-input'), {
      target: { value: '742 Evergreen Terrace' },
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByTestId('register-submit-btn'));

    await waitFor(() => {
      expect(apiClient.apiRegister).toHaveBeenCalledWith({
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        defaultAddress: '742 Evergreen Terrace',
        password: 'Password123!',
      });
      expect(mockReplace).toHaveBeenCalledWith('/orders');
    });
  });

  it('displays client-side validation error if password is less than 8 characters', async () => {
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    fireEvent.change(screen.getByTestId('register-name-input'), {
      target: { value: 'Sarah' },
    });
    fireEvent.change(screen.getByTestId('register-email-input'), {
      target: { value: 'sarah@example.com' },
    });
    fireEvent.change(screen.getByTestId('register-address-input'), {
      target: { value: 'Address' },
    });
    fireEvent.change(screen.getByTestId('register-password-input'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByTestId('register-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('register-error-banner')).toHaveTextContent(
        'Password must be at least 8 characters'
      );
      expect(apiClient.apiRegister).not.toHaveBeenCalled();
    });
  });
});

