// src/context/auth-context.test.tsx
// Phase 21: Unit tests for AuthContext and useAuth hook.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';
import * as apiClient from '../lib/api-client';
import type { AuthUser } from '../types/api';

vi.mock('../lib/api-client', () => ({
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

const mockUser: AuthUser = {
  id: 'usr-1234-5678',
  email: 'test@example.com',
  name: 'Test Customer',
  defaultAddress: '123 Test St',
};

describe('AuthContext & useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes in unauthenticated state when no token is stored', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('restores user profile on mount if token is found in localStorage', async () => {
    localStorage.setItem('orchestrai_token', 'valid-stored-token');
    vi.mocked(apiClient.apiMe).mockResolvedValueOnce(mockUser);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    // Wait for async effect to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(apiClient.apiMe).toHaveBeenCalledWith('valid-stored-token');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.token).toBe('valid-stored-token');
  });

  it('logs in successfully and persists token', async () => {
    vi.mocked(apiClient.apiLogin).mockResolvedValueOnce({
      token: 'new-login-token',
      user: mockUser,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await result.current.login('test@example.com', 'P@ssw0rd123');
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('new-login-token');
    expect(result.current.user).toEqual(mockUser);
    expect(localStorage.getItem('orchestrai_token')).toBe('new-login-token');
  });

  it('logs out and clears token from state and localStorage', async () => {
    localStorage.setItem('orchestrai_token', 'token-to-clear');
    vi.mocked(apiClient.apiLogout).mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider initialToken="token-to-clear" initialUser={mockUser}>
          {children}
        </AuthProvider>
      ),
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('orchestrai_token')).toBeNull();
  });
});
