'use client';

// src/hooks/use-require-auth.ts
// Phase 22: Authentication guard hook redirecting unauthenticated visitors to /login.

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/auth-context';

export function useRequireAuth(redirectPath?: string) {
  const { user, token, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const destination = redirectPath || pathname || '/';
      const encoded = encodeURIComponent(destination);
      router.replace(`/login?redirect=${encoded}`);
    }
  }, [isLoading, isAuthenticated, router, pathname, redirectPath]);

  return { user, token, isAuthenticated, isLoading };
}

