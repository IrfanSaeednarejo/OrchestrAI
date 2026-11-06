'use client';

// src/context/user-context.tsx
// Phase 17 Step 4: Demo identity context providing dynamic seed users.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { DemoUser } from '../types/api';
import { fetchDemoUsers } from '../lib/api-client';

export const DEFAULT_GUEST_USER: DemoUser = {
  id: '00000000-0000-4000-a000-000000000001',
  name: 'Guest User',
  email: 'guest@orchestrai.internal',
  scenario: 'Unauthenticated / Guest access',
  isGuest: true,
};

interface UserContextValue {
  currentUser: DemoUser;
  users: DemoUser[];
  isLoading: boolean;
  error: string | null;
  switchUser: (userId: string) => void;
  refetchUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({
  children,
  initialUsers,
  initialUser,
}: {
  children: React.ReactNode;
  initialUsers?: DemoUser[];
  initialUser?: DemoUser;
}) {
  const [users, setUsers] = useState<DemoUser[]>(
    initialUsers && initialUsers.length > 0 ? initialUsers : [DEFAULT_GUEST_USER]
  );
  const [currentUser, setCurrentUser] = useState<DemoUser>(
    initialUser || DEFAULT_GUEST_USER
  );
  const [isLoading, setIsLoading] = useState(!initialUsers);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await fetchDemoUsers();
      if (fetched && fetched.length > 0) {
        setUsers(fetched);
        // If current user is not in the list, default to first or guest
        const found = fetched.find((u) => u.id === currentUser.id);
        if (!found) {
          const guest = fetched.find((u) => u.isGuest) || fetched[0];
          if (guest) setCurrentUser(guest);
        }
      }
    } catch (err) {
      console.warn('Failed to load demo users from backend; using default guest', err);
      setError('Failed to load demo users');
      // Always ensure at least guest user exists
      setUsers([DEFAULT_GUEST_USER]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    if (!initialUsers) {
      void loadUsers();
    }
  }, [initialUsers, loadUsers]);

  const switchUser = useCallback(
    (userId: string) => {
      const target = users.find((u) => u.id === userId);
      if (target) {
        setCurrentUser(target);
      }
    },
    [users]
  );

  return (
    <UserContext.Provider
      value={{
        currentUser,
        users,
        isLoading,
        error,
        switchUser,
        refetchUsers: loadUsers,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
}
