'use client';

// src/components/providers.tsx
// Phase 22: Root client providers wrapper.

import React from 'react';
import { AuthProvider } from '../context/auth-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
