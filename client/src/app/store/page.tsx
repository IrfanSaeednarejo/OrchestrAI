'use client';

// src/app/store/page.tsx
// Phase 22 Step 3: Dedicated Storefront page with catalog, live cart, and checkout receipt.
// Phase 31: Redesigned with Midnight Burgundy / Imperial Crimson design system.

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle,
  Package,
  ArrowRight,
  Loader2,
  MapPin,
  Sparkles,
  CreditCard,
  ShieldCheck,
  Keyboard,
  Mic,
} from 'lucide-react';
import { TopNav } from '../../components/navigation/top-nav';
import { useRequireAuth } from '../../hooks/use-require-auth';
import { fetchProducts, apiPlaceOrder } from '../../lib/api-client';
import type { Product, PlaceOrderResponse } from '../../types/api';

function getProductIcon(product: Product) {
  const nameLower = product.name.toLowerCase();
  const skuLower = product.sku.toLowerCase();
  if (skuLower.includes('hw-001') || nameLower.includes('keyboard')) {
    return <Keyboard className="h-5 w-5 text-brand-link" />;
  }
  if (skuLower.includes('hw-002') || nameLower.includes('mic') || nameLower.includes('headphone')) {
    return <Mic className="h-5 w-5 text-brand-link" />;
  }
  return <Package className="h-5 w-5 text-brand-link" />;
}

export default function StorePage() {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading: isAuthLoading } = useRequireAuth('/store');

  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PlaceOrderResponse | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    setIsLoadingProducts(true);
    fetchProducts()
      .then((items) => {
        setProducts(items);
        const initialQtys: Record<string, number> = {};
        items.forEach((p, idx) => {
          initialQtys[p.id] = idx === 0 ? 1 : 0;
        });
        setQuantities(initialQtys);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load catalog');
      })
      .finally(() => {
        setIsLoadingProducts(false);
      });
  }, [isAuthenticated]);

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center text-content-secondary gap-2.5">
        <Loader2 className="h-5 w-5 animate-spin text-brand-link" />
        <span className="text-sm font-medium">Authenticating...</span>
      </div>
    );
  }

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const selectedItems = Object.entries(quantities)
    .filter(([_, qty]) => qty > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));

  const totalAmount = selectedItems.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.productId);
    return sum + (prod ? parseFloat(prod.price) * item.quantity : 0);
  }, 0);

  const totalItemCount = selectedItems.reduce((acc, i) => acc + i.quantity, 0);

  const handleCheckout = async () => {
    if (selectedItems.length === 0) {
      setError('Please select at least one product to purchase');
      return;
    }

    setIsPlacingOrder(true);
    setError(null);
    try {
      const result = await apiPlaceOrder(selectedItems, token, user?.id);
      setPlacedOrder(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order placement failed');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleAskAgent = (orderId: string) => {
    router.push(`/?orderId=${encodeURIComponent(orderId)}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-content-primary">
      <TopNav />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-edge-subtle gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand-link text-xs font-semibold uppercase tracking-wider mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>OrchestrAI Marketplace</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-content-primary tracking-tight">
              Products Catalog
            </h1>
            <p className="text-xs md:text-sm text-content-secondary mt-1">
              Browse items, place real orders, and query autonomous agents for delivery & returns.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/orders"
              data-testid="view-orders-cta"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-control bg-surface hover:bg-surface-hover text-content-secondary hover:text-content-primary text-xs font-medium border border-edge-subtle transition-colors"
            >
              <Package className="h-4 w-4 text-brand-link" />
              <span>View My Orders</span>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            data-testid="store-error-banner"
            className="mb-6 p-4 rounded-control bg-status-error/10 border border-status-error/30 text-status-error text-xs font-medium"
          >
            {error}
          </div>
        )}

        {/* Order Success Receipt Modal / View */}
        {placedOrder ? (
          <div
            data-testid="order-confirmation-card"
            className="w-full max-w-xl mx-auto my-auto bg-surface border border-edge-subtle rounded-dialog shadow-2xl p-6 md:p-8 text-center animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-status-success/10 border border-status-success/30 text-status-success mb-4 shadow-lg shadow-status-success/10">
              <CheckCircle className="h-9 w-9" />
            </div>

            <h2 className="text-2xl font-bold text-content-primary tracking-tight">
              Order Confirmed & Paid
            </h2>
            <p className="text-xs text-content-secondary mt-1 mb-6">
              Your order has been captured and dispatched to fulfillment.
            </p>

            {/* Receipt Summary Table */}
            <div className="p-5 rounded-card bg-surface-inset border border-edge-subtle text-left text-xs space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-content-muted">Order ID:</span>
                <span
                  data-testid="receipt-order-id"
                  className="font-mono text-brand-link font-semibold truncate max-w-[240px]"
                >
                  {placedOrder.order.id}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-content-muted">Tracking Number:</span>
                <span
                  data-testid="receipt-tracking-number"
                  className="font-mono text-status-success font-semibold"
                >
                  {placedOrder.trackingNumber}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-content-muted">Shipping Address:</span>
                <span className="text-content-primary truncate max-w-[240px]">
                  {placedOrder.order.shippingAddressSnapshot}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-content-muted">Payment Status:</span>
                <span className="capitalize font-semibold text-status-success flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Captured ($ {parseFloat(placedOrder.order.totalAmount).toFixed(2)})</span>
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-edge-subtle pt-2.5 font-medium">
                <span className="text-content-muted">Shipment Status:</span>
                <span className="px-2 py-0.5 rounded-tag bg-status-info/10 text-status-info border border-status-info/20 text-[11px] font-semibold">
                  In Transit
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleAskAgent(placedOrder.order.id)}
                data-testid="receipt-ask-agent-btn"
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white font-medium text-sm transition-all shadow-md shadow-brand-primary/20"
              >
                <Package className="h-4 w-4" />
                <span>Ask Agent to Track Order</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setPlacedOrder(null)}
                data-testid="receipt-continue-btn"
                className="py-3 px-4 rounded-control bg-surface-elevated hover:bg-surface-hover text-content-secondary hover:text-content-primary border border-edge-subtle text-xs font-semibold transition-colors"
              >
                Back to Catalog
              </button>
            </div>
          </div>
        ) : (
          /* Catalog & Sticky Checkout Layout */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Products Grid (left 2 cols) */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Available Items ({products.length})
              </h2>

              {isLoadingProducts ? (
                <div className="flex items-center justify-center py-20 text-content-secondary text-sm gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-link" />
                  <span>Loading product catalog...</span>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-16 bg-surface border border-edge-subtle rounded-card text-content-muted text-sm">
                  No catalog products available.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {products.map((product) => {
                    const qty = quantities[product.id] || 0;
                    const isSelected = qty > 0;
                    return (
                      <div
                        key={product.id}
                        data-testid={`product-card-${product.id}`}
                        className={`p-5 rounded-card bg-surface border transition-all shadow-md flex flex-col justify-between ${
                          isSelected
                            ? 'border-edge-strong bg-surface-elevated/40'
                            : 'border-edge-subtle hover:border-edge-strong/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-content-secondary mb-3">
                            <div className="w-10 h-10 rounded-control bg-surface-elevated border border-edge-subtle flex items-center justify-center">
                              {getProductIcon(product)}
                            </div>
                            <span className="px-2.5 py-0.5 rounded-tag bg-status-success/10 text-status-success border border-status-success/20 text-[10px] font-semibold">
                              In Stock
                            </span>
                          </div>

                          <div className="font-mono text-content-disabled text-xs mb-1">
                            {product.sku}
                          </div>

                          <h3 className="font-semibold text-content-primary text-base leading-snug">
                            {product.name}
                          </h3>

                          <div className="text-xl font-bold text-content-primary mt-2 tabular-nums">
                            <sup className="text-xs font-normal text-content-muted mr-0.5">$</sup>
                            {parseFloat(product.price).toFixed(2)}
                          </div>
                        </div>

                        {/* Quantity Adjuster */}
                        <div className="mt-5 pt-3 border-t border-edge-subtle flex items-center justify-between">
                          <span className="text-xs text-content-secondary font-medium">Quantity</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateQuantity(product.id, -1)}
                              disabled={qty === 0}
                              aria-label={`Decrease quantity of ${product.name}`}
                              data-testid={`qty-minus-${product.id}`}
                              className="w-8 h-8 rounded-control bg-surface-elevated hover:bg-surface-hover text-content-primary border border-edge-subtle flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span
                              data-testid={`qty-count-${product.id}`}
                              className="w-8 text-center text-sm font-semibold text-content-primary tabular-nums"
                            >
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(product.id, 1)}
                              aria-label={`Increase quantity of ${product.name}`}
                              data-testid={`qty-plus-${product.id}`}
                              className="w-8 h-8 rounded-control bg-surface-elevated hover:bg-surface-hover text-content-primary border border-edge-subtle flex items-center justify-center transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart & Checkout Panel (right 1 col) */}
            <div className="lg:col-span-1 sticky top-6">
              <div
                data-testid="store-checkout-card"
                className="bg-surface border border-edge-subtle rounded-dialog shadow-xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between pb-3 border-b border-edge-subtle">
                  <div className="flex items-center gap-2 font-semibold text-content-primary text-sm">
                    <ShoppingBag className="h-4 w-4 text-brand-link" />
                    <span>Order Summary</span>
                  </div>
                  <span className="text-xs text-brand-link font-semibold bg-brand-deep/70 border border-brand-mid/70 px-2.5 py-0.5 rounded-full">
                    {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {/* Items Breakdown */}
                {selectedItems.length === 0 ? (
                  <div className="py-6 text-center text-xs text-content-muted">
                    Your cart is empty. Add items from the catalog.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 text-xs">
                    {selectedItems.map((item) => {
                      const prod = products.find((p) => p.id === item.productId);
                      if (!prod) return null;
                      const lineTotal = parseFloat(prod.price) * item.quantity;
                      return (
                        <div key={item.productId} className="flex justify-between items-center text-content-secondary">
                          <span className="truncate max-w-[170px]">
                            {prod.name} <span className="text-content-muted font-mono">×{item.quantity}</span>
                          </span>
                          <span className="font-semibold text-content-primary tabular-nums">
                            ${lineTotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Shipping Details */}
                <div className="p-3.5 rounded-card bg-surface-inset border border-edge-subtle space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-content-secondary font-medium">
                    <MapPin className="h-3.5 w-3.5 text-brand-link" />
                    <span>Deliver to</span>
                  </div>
                  <div className="font-semibold text-content-primary truncate">{user?.name}</div>
                  <div className="text-content-muted text-[11px] truncate">{user?.defaultAddress}</div>
                </div>

                {/* Total & Checkout Button */}
                <div className="pt-2 border-t border-edge-subtle space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-content-secondary font-medium">Total Due</span>
                    <span data-testid="store-cart-total" className="text-2xl font-bold text-content-primary tabular-nums tracking-tight">
                      ${totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={isPlacingOrder || selectedItems.length === 0}
                    data-testid="store-checkout-btn"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white font-medium text-sm transition-all shadow-md shadow-brand-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isPlacingOrder ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Processing Order...</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        <span>Pay & Place Order</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-content-disabled">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-link" />
                    <span>Captured at checkout · End-to-end encrypted</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
