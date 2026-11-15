// src/app/orders/page.test.tsx
// Phase 22 Step 4: Unit & integration tests for dedicated Orders page.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrdersPage from './page';
import { AuthProvider } from '../../context/auth-context';
import * as apiClient from '../../lib/api-client';
import type { Order, AuthUser } from '../../types/api';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => '/orders',
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  fetchUserOrders: vi.fn(),
  fetchProducts: vi.fn(),
  apiPlaceOrder: vi.fn(),
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

const mockUser: AuthUser = {
  id: 'usr-customer-888',
  name: 'Alice Customer',
  email: 'alice@example.com',
  defaultAddress: '123 Market St, San Francisco CA',
};

const mockOrders: Order[] = [
  {
    id: 'ord-test-001',
    userId: mockUser.id,
    status: 'paid',
    shippingAddressSnapshot: '123 Market St, San Francisco CA',
    totalAmount: '149.99',
    createdAt: '2026-11-08T10:00:00.000Z',
  },
  {
    id: 'ord-test-002',
    userId: mockUser.id,
    status: 'shipped',
    shippingAddressSnapshot: '456 Tech Blvd, Seattle WA',
    totalAmount: '89.50',
    createdAt: '2026-11-07T14:30:00.000Z',
  },
];

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  function renderOrders(isAuth = true) {
    return render(
      <AuthProvider
        initialToken={isAuth ? 'valid-token' : null}
        initialUser={isAuth ? mockUser : null}
      >
        <OrdersPage />
      </AuthProvider>
    );
  }

  it('redirects unauthenticated users to /login?redirect=/orders', async () => {
    renderOrders(false);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining('/login?redirect=')
      );
    });
  });

  it('renders empty state when user has no orders', async () => {
    vi.mocked(apiClient.fetchUserOrders).mockResolvedValueOnce([]);

    renderOrders(true);

    await waitFor(() => {
      expect(screen.getByText('No orders found')).toBeInTheDocument();
      expect(screen.getByText('Browse Store Catalog')).toBeInTheDocument();
    });
  });

  it('renders order list with details and badges when orders exist', async () => {
    vi.mocked(apiClient.fetchUserOrders).mockResolvedValueOnce(mockOrders);

    renderOrders(true);

    await waitFor(() => {
      expect(screen.getByText('ord-test-001')).toBeInTheDocument();
      expect(screen.getByText('ord-test-002')).toBeInTheDocument();
      expect(screen.getByText('Paid & Processing')).toBeInTheDocument();
      expect(screen.getByText('Shipped')).toBeInTheDocument();
      expect(screen.getByText('$149.99')).toBeInTheDocument();
      expect(screen.getByText('$89.50')).toBeInTheDocument();
    });
  });

  it('navigates to chat with orderId pre-fill when clicking Ask Agent', async () => {
    vi.mocked(apiClient.fetchUserOrders).mockResolvedValueOnce(mockOrders);

    renderOrders(true);

    await waitFor(() => {
      expect(screen.getByText('ord-test-001')).toBeInTheDocument();
    });

    const askAgentButtons = screen.getAllByRole('button', {
      name: /Ask Agent About This Order/i,
    });
    expect(askAgentButtons.length).toBe(2);

    fireEvent.click(askAgentButtons[0]);

    expect(mockPush).toHaveBeenCalledWith('/?orderId=ord-test-001');
  });

  it('displays error message and allows retry when fetch fails', async () => {
    vi.mocked(apiClient.fetchUserOrders).mockRejectedValueOnce(
      new Error('Database network timeout')
    );

    renderOrders(true);

    await waitFor(() => {
      expect(screen.getByText('Database network timeout')).toBeInTheDocument();
    });

    // Setup success for retry
    vi.mocked(apiClient.fetchUserOrders).mockResolvedValueOnce(mockOrders);
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('ord-test-001')).toBeInTheDocument();
    });
  });
});
