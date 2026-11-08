'use client';

// src/components/store/storefront-modal.tsx
// Phase 21: Storefront modal for browsing catalog and placing live orders.

import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Minus, CheckCircle, Package, ArrowRight, Loader2 } from 'lucide-react';
import type { Product, PlaceOrderResponse } from '../../types/api';
import { fetchProducts, apiPlaceOrder } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';

interface StorefrontModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAskAgent?: (orderId: string) => void;
  onOpenAuth?: () => void;
}

export function StorefrontModal({
  isOpen,
  onClose,
  onAskAgent,
  onOpenAuth,
}: StorefrontModalProps) {
  const { user, token, isAuthenticated } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PlaceOrderResponse | null>(null);

  // Load products when modal opens
  useEffect(() => {
    if (!isOpen) {
      setPlacedOrder(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    fetchProducts()
      .then((items) => {
        setProducts(items);
        // Default quantity 1 for first item, 0 for others
        const initialQtys: Record<string, number> = {};
        items.forEach((p, idx) => {
          initialQtys[p.id] = idx === 0 ? 1 : 0;
        });
        setQuantities(initialQtys);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load products');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  // Selected items calculation
  const orderItems = Object.entries(quantities)
    .filter(([_, qty]) => qty > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));

  const totalAmount = orderItems.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.productId);
    return sum + (prod ? parseFloat(prod.price) * item.quantity : 0);
  }, 0);

  const handlePlaceOrder = async () => {
    if (!isAuthenticated) {
      onOpenAuth?.();
      return;
    }

    if (orderItems.length === 0) {
      setError('Please select at least one item');
      return;
    }

    setIsPlacing(true);
    setError(null);
    try {
      const result = await apiPlaceOrder(orderItems, token, user?.id);
      setPlacedOrder(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="storefront-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          data-testid="storefront-modal-close"
          aria-label="Close store"
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-700/60 text-indigo-400">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              OrchestrAI Storefront
            </h2>
            <p className="text-xs text-slate-400">
              Browse products and place orders with instant tracking.
            </p>
          </div>
        </div>

        {/* Success Screen */}
        {placedOrder ? (
          <div data-testid="order-success-screen" className="text-center py-6 space-y-4 flex-1">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-400">
              <CheckCircle className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Order Placed Successfully!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your order is confirmed and currently in transit.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-700 text-left text-xs space-y-2 max-w-sm mx-auto">
              <div className="flex justify-between">
                <span className="text-slate-400">Order ID:</span>
                <span data-testid="placed-order-id" className="font-mono text-indigo-300 font-semibold truncate max-w-[200px]">
                  {placedOrder.order.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tracking Number:</span>
                <span data-testid="placed-tracking-number" className="font-mono text-emerald-300 font-semibold">
                  {placedOrder.trackingNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Paid:</span>
                <span className="text-white font-medium">
                  ${parseFloat(placedOrder.order.totalAmount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="capitalize text-emerald-400 font-medium">
                  {placedOrder.order.status}
                </span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2 max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => {
                  onAskAgent?.(placedOrder.order.id);
                  onClose();
                }}
                data-testid="ask-agent-about-order-btn"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
              >
                <Package className="h-4 w-4" />
                <span>Ask Agent About This Order</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPlacedOrder(null)}
                className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Place Another Order
              </button>
            </div>
          </div>
        ) : (
          /* Product Catalog & Cart */
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {error && (
              <div
                data-testid="store-error-banner"
                className="mb-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-medium"
              >
                {error}
              </div>
            )}

            {!isAuthenticated && (
              <div className="mb-3 p-3 rounded-lg bg-amber-950/60 border border-amber-800 text-amber-300 text-xs flex items-center justify-between">
                <span>Sign in to complete your checkout and link orders.</span>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  data-testid="storefront-auth-prompt-btn"
                  className="font-semibold underline hover:text-white ml-2 shrink-0"
                >
                  Sign In
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                <span>Loading products...</span>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No products found.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {products.map((product) => {
                  const qty = quantities[product.id] || 0;
                  return (
                    <div
                      key={product.id}
                      data-testid={`product-item-${product.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-medium text-white text-sm truncate">
                          {product.name}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-slate-500">{product.sku}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-semibold">
                            ${parseFloat(product.price).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, -1)}
                          disabled={qty === 0}
                          data-testid={`qty-minus-${product.id}`}
                          className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span
                          data-testid={`qty-val-${product.id}`}
                          className="w-6 text-center text-sm font-semibold text-white"
                        >
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, 1)}
                          data-testid={`qty-plus-${product.id}`}
                          className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 flex items-center justify-center transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cart Footer */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <div className="text-[11px] text-slate-400">Total</div>
                <div data-testid="cart-total" className="text-base font-bold text-white">
                  ${totalAmount.toFixed(2)}
                </div>
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={isPlacing || orderItems.length === 0}
                data-testid="place-order-submit-btn"
                className="flex items-center gap-2 py-2.5 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPlacing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Placing order...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4" />
                    <span>Place Order ({orderItems.reduce((acc, i) => acc + i.quantity, 0)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

