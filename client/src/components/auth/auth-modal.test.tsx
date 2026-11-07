// src/components/auth/auth-modal.test.tsx
// Phase 21: Component tests for AuthModal.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from './auth-modal';
import { AuthProvider } from '../../context/auth-context';
import * as apiClient from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(apiClient.apiMe).mockResolvedValue({
      id: 'mock-id',
      email: 'mock@example.com',
      name: 'Mock',
      defaultAddress: '123 St',
    });
  });

  function renderModal(props: Partial<React.ComponentProps<typeof AuthModal>> = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const utils = render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={onClose} onSuccess={onSuccess} {...props} />
      </AuthProvider>
    );

    return { ...utils, onClose, onSuccess };
  }

  it('does not render when isOpen is false', () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={false} onClose={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
  });

  it('renders sign in tab by default', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: /Sign In to OrchestrAI/i })).toBeInTheDocument();
    expect(screen.getByTestId('auth-email-input')).toBeInTheDocument();
    expect(screen.getByTestId('auth-password-input')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-name-input')).not.toBeInTheDocument();
  });

  it('switches between Sign In and Create Account tabs', () => {
    renderModal();

    fireEvent.click(screen.getByTestId('tab-register'));
    expect(screen.getByRole('heading', { name: /Create Customer Account/i })).toBeInTheDocument();
    expect(screen.getByTestId('auth-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('auth-address-input')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-sign-in'));
    expect(screen.getByRole('heading', { name: /Sign In to OrchestrAI/i })).toBeInTheDocument();
    expect(screen.queryByTestId('auth-name-input')).not.toBeInTheDocument();
  });

  it('submits sign in form and calls onSuccess + onClose', async () => {
    vi.mocked(apiClient.apiLogin).mockResolvedValueOnce({
      token: 'test-token',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        defaultAddress: '123 Test St',
      },
    });

    const { onClose, onSuccess } = renderModal();

    fireEvent.change(screen.getByTestId('auth-email-input'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByTestId('auth-password-input'), {
      target: { value: 'Secret123!' },
    });
    fireEvent.click(screen.getByTestId('auth-submit-btn'));

    await waitFor(() => {
      expect(apiClient.apiLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'Secret123!',
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays error banner when login fails', async () => {
    vi.mocked(apiClient.apiLogin).mockRejectedValueOnce(
      new Error('Invalid email or password')
    );

    renderModal();

    fireEvent.change(screen.getByTestId('auth-email-input'), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByTestId('auth-password-input'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByTestId('auth-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
        'Invalid email or password'
      );
    });
  });
});
