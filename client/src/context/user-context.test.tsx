// src/context/user-context.test.tsx
// Phase 17 Step 4: Tests for UserProvider and useUser hook.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { UserProvider, useUser, DEFAULT_GUEST_USER } from './user-context';
import * as apiClient from '../lib/api-client';
import type { DemoUser } from '../types/api';

function TestConsumer() {
  const { currentUser, users, isLoading, error, switchUser } = useUser();

  return (
    <div>
      <div data-testid="current-user">{currentUser.name}</div>
      <div data-testid="user-count">{users.length}</div>
      <div data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</div>
      {error && <div data-testid="error-state">{error}</div>}
      <button
        data-testid="switch-alice"
        onClick={() => switchUser('user-alice-123')}
      >
        Switch to Alice
      </button>
    </div>
  );
}

describe('UserProvider & useUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides default guest user initially', () => {
    render(
      <UserProvider initialUsers={[DEFAULT_GUEST_USER]}>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('current-user')).toHaveTextContent('Guest User');
    expect(screen.getByTestId('user-count')).toHaveTextContent('1');
    expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
  });

  it('loads demo users from api-client on mount', async () => {
    const mockUsers: DemoUser[] = [
      DEFAULT_GUEST_USER,
      {
        id: 'user-alice-123',
        name: 'Alice Anderson',
        email: 'alice@example.com',
        scenario: 'Scenario 1',
        isGuest: false,
      },
    ];

    vi.spyOn(apiClient, 'fetchDemoUsers').mockResolvedValue(mockUsers);

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('loading-state')).toHaveTextContent('loading');

    // Wait for effect to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('loading-state')).toHaveTextContent('ready');
    expect(screen.getByTestId('user-count')).toHaveTextContent('2');
  });

  it('switches currentUser when switchUser is invoked', async () => {
    const mockUsers: DemoUser[] = [
      DEFAULT_GUEST_USER,
      {
        id: 'user-alice-123',
        name: 'Alice Anderson',
        email: 'alice@example.com',
        scenario: 'Scenario 1',
        isGuest: false,
      },
    ];

    render(
      <UserProvider initialUsers={mockUsers}>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('current-user')).toHaveTextContent('Guest User');

    act(() => {
      screen.getByTestId('switch-alice').click();
    });

    expect(screen.getByTestId('current-user')).toHaveTextContent('Alice Anderson');
  });

  it('handles fetch failure gracefully and defaults to Guest User', async () => {
    vi.spyOn(apiClient, 'fetchDemoUsers').mockRejectedValue(new Error('Network error'));

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('current-user')).toHaveTextContent('Guest User');
    expect(screen.getByTestId('error-state')).toHaveTextContent('Failed to load demo users');
  });
});

