'use client';

// src/context/auth-context.tsx
// Phase 21: Authentication context managing Bearer tokens and active user profile.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser } from '../types/api';
import { apiLogin, apiRegister, apiLogout, apiMe } from '../lib/api-client';

const TOKEN_STORAGE_KEY = 'orchestrai_token';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    name: string;
    defaultAddress: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  initialUser = null,
  initialToken = null,
}: {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
  initialToken?: string | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [token, setToken] = useState<string | null>(initialToken);
  const [isLoading, setIsLoading] = useState<boolean>(!initialUser && !initialToken);
  const [error, setError] = useState<string | null>(null);

  // Initialize session from localStorage on mount
  useEffect(() => {
    if (initialUser || initialToken) {
      setIsLoading(false);
      return;
    }

    let storedToken: string | null = null;
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
        storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors in test or restricted environments
    }

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    setToken(storedToken);
    const mePromise = apiMe(storedToken);
    if (mePromise && typeof mePromise.then === 'function') {
      mePromise
        .then((profile) => {
          setUser(profile);
        })
        .catch(() => {
          // Token invalid or expired
          try {
            if (typeof window !== 'undefined' && typeof window.localStorage?.removeItem === 'function') {
              window.localStorage.removeItem(TOKEN_STORAGE_KEY);
            }
          } catch {
            // Ignore
          }
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [initialUser, initialToken]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiLogin({ email, password });
      setToken(res.token);
      setUser(res.user);
      try {
        if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      name: string;
      defaultAddress: string;
      password: string;
    }) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiRegister(data);
        setToken(res.token);
        setUser(res.user);
        try {
          if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
            window.localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
          }
        } catch {
          // Ignore
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiLogout();
    } catch {
      // Non-fatal if logout network call fails
    } finally {
      try {
        if (typeof window !== 'undefined' && typeof window.localStorage?.removeItem === 'function') {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      } catch {
        // Ignore
      }
      setToken(null);
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        error,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
