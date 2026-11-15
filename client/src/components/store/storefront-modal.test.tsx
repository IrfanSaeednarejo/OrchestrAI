// src/components/store/storefront-modal.test.tsx
// Phase 21: Component tests for StorefrontModal.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StorefrontModal } from './storefront-modal';
import { AuthProvider } from '../../context/auth-context';
import * as apiClient from '../../lib/api-client';
import type { Product, AuthUser } from '../../types/api';

vi.mock('../../lib/api-client', () => ({
  fetchProducts: vi.fn(),
  apiPlaceOrder: vi.fn(),
  apiLogin: vi.fn(),
  apiRegister: vi.fn(),
  apiLogout: vi.fn(),
  apiMe: vi.fn(),
}));

const mockProducts: Product[] = [
  { id: 'prod-1', name: 'Wireless Headphones', price: '99.99', sku: 'AUDIO-001' },
  { id: 'prod-2', name: 'Smart Watch', price: '199.99', sku: 'TECH-002' },
];

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'shopper@example.com',
  name: 'Store Shopper',
  defaultAddress: '456 Shopper Way',
};

describe('StorefrontModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(apiClient.apiMe).mockResolvedValue(mockUser);
  });

  function renderStore(props: Partial<React.ComponentProps<typeof StorefrontModal>> = {}, isAuth = true) {
    const onClose = vi.fn();
    const onAskAgent = vi.fn();
    const onOpenAuth = vi.fn();

    const utils = render(
      <AuthProvider
        initialToken={isAuth ? 'test-token' : null}
        initialUser={isAuth ? mockUser : null}
      >
        <StorefrontModal
          isOpen={true}
          onClose={onClose}
          onAskAgent={onAskAgent}
          onOpenAuth={onOpenAuth}
          {...props}
        />
      </AuthProvider>
    );

    return { ...utils, onClose, onAskAgent, onOpenAuth };
  }

  it('does not render when isOpen is false', () => {
    render(
      <AuthProvider>
        <StorefrontModal isOpen={false} onClose={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.queryByTestId('storefront-modal')).not.toBeInTheDocument();
  });

  it('loads and displays product catalog', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);

    renderStore();

    await waitFor(() => {
      expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      expect(screen.getByText('Smart Watch')).toBeInTheDocument();
      expect(screen.getAllByText('$99.99').length).toBeGreaterThan(0);
    });
  });

  it('adjusts quantity and updates cart total', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);

    renderStore();

    await waitFor(() => {
      expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    });

    // Default: item 1 has qty 1 ($99.99)
    expect(screen.getByTestId('cart-total')).toHaveTextContent('$99.99');

    // Increase qty for item 2
    fireEvent.click(screen.getByTestId('qty-plus-prod-2'));
    expect(screen.getByTestId('qty-val-prod-2')).toHaveTextContent('1');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('$299.98');
  });

  it('places order successfully and displays confirmation screen with agent action', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);
    vi.mocked(apiClient.apiPlaceOrder).mockResolvedValueOnce({
      order: {
        id: 'ord-9999-8888',
        userId: 'user-1',
        status: 'paid',
        shippingAddressSnapshot: '456 Shopper Way',
        totalAmount: '99.99',
        createdAt: new Date().toISOString(),
      },
      trackingNumber: 'OAI-ABC1234XYZ',
    });

    const { onAskAgent, onClose } = renderStore();

    await waitFor(() => {
      expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('place-order-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('order-success-screen')).toBeInTheDocument();
      expect(screen.getByTestId('placed-order-id')).toHaveTextContent('ord-9999-8888');
      expect(screen.getByTestId('placed-tracking-number')).toHaveTextContent('OAI-ABC1234XYZ');
    });

    // Click "Ask Agent About This Order"
    fireEvent.click(screen.getByTestId('ask-agent-about-order-btn'));
    expect(onAskAgent).toHaveBeenCalledWith('ord-9999-8888');
    expect(onClose).toHaveBeenCalled();
  });

  it('prompts user to sign in when unauthenticated', async () => {
    vi.mocked(apiClient.fetchProducts).mockResolvedValueOnce(mockProducts);

    const { onOpenAuth } = renderStore({}, false);

    await waitFor(() => {
      expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    });

    expect(screen.getByTestId('storefront-auth-prompt-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('storefront-auth-prompt-btn'));
    expect(onOpenAuth).toHaveBeenCalled();
  });
});
