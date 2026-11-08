// src/app/store/page.test.tsx
// Phase 22 Step 3: Integration tests for dedicated Storefront page.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StorePage from './page';
import { AuthProvider } from '../../context/auth-context';
import * as apiClient from '../../lib/api-client';
import type { Product, AuthUser } from '../../types/api';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => '/store',
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  fetchProducts: vi.fn(),
  apiPlaceOrder: vi.fn(),
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

const mockProducts: Product[] = [
  { id: 'prod-101', name: 'Ergonomic Keyboard', price: '129.99', sku: 'HW-001' },
  { id: 'prod-102', name: 'Noise-Cancelling Mic', price: '79.99', sku: 'HW-002' },
];

const mockUser: AuthUser = {
  id: 'usr-bob-456',
  name: 'Bob Buyer',
  email: 'bob@example.com',
  defaultAddress: '55 Commerce St, Austin TX',
};

describe('StorePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  function renderStore(isAuth = true) {
    return render(
      <AuthProvider
        initialToken={isAuth ? 'valid-token' : null}
        initialUser={isAuth ? mockUser : null}
      >
        <StorePage />
      </AuthProvider>
    );
  }

  it('renders products and default cart calculation', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);

    renderStore();

    await waitFor(() => {
      expect(screen.getAllByText('Ergonomic Keyboard').length).toBeGreaterThan(0);
      expect(screen.getByText('Noise-Cancelling Mic')).toBeInTheDocument();
      expect(screen.getByTestId('store-cart-total')).toHaveTextContent('$129.99');
    });
  });

  it('adjusts quantities and recalculates total due', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);

    renderStore();

    await waitFor(() => {
      expect(screen.getAllByText('Ergonomic Keyboard').length).toBeGreaterThan(0);
    });

    // Add 1 unit of product 102 ($79.99)
    fireEvent.click(screen.getByTestId('qty-plus-prod-102'));
    expect(screen.getByTestId('qty-count-prod-102')).toHaveTextContent('1');
    expect(screen.getByTestId('store-cart-total')).toHaveTextContent('$209.98');
  });

  it('submits order placement and displays receipt with agent action', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);
    vi.mocked(apiClient.apiPlaceOrder).mockResolvedValueOnce({
      order: {
        id: 'ord-real-7777',
        userId: mockUser.id,
        status: 'paid',
        shippingAddressSnapshot: mockUser.defaultAddress,
        totalAmount: '129.99',
        createdAt: new Date().toISOString(),
      },
      trackingNumber: 'OAI-TRACK777',
    });

    renderStore();

    await waitFor(() => {
      expect(screen.getAllByText('Ergonomic Keyboard').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId('store-checkout-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('order-confirmation-card')).toBeInTheDocument();
      expect(screen.getByTestId('receipt-order-id')).toHaveTextContent('ord-real-7777');
      expect(screen.getByTestId('receipt-tracking-number')).toHaveTextContent('OAI-TRACK777');
    });

    // Click "Ask Agent to Track Order"
    fireEvent.click(screen.getByTestId('receipt-ask-agent-btn'));
    expect(mockPush).toHaveBeenCalledWith('/?orderId=ord-real-7777');
  });

  it('redirects to /login when visitor is not authenticated', async () => {
    renderStore(false);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fstore');
    });
  });
});
