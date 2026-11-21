'use client';

// src/app/orders/page.tsx
// Phase 22 Step 4: Dedicated Order Management page with live status and 1-click Agent Support.
// Phase 32: Redesigned with Midnight Burgundy / Imperial Crimson design system.

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  MessageSquare,
  ArrowRight,
  Clock,
  CheckCircle2,
  Truck,
  RotateCcw,
  XCircle,
  AlertCircle,
  Loader2,
  ShoppingBag,
  MapPin,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { TopNav } from '../../components/navigation/top-nav';
import { useRequireAuth } from '../../hooks/use-require-auth';
import { fetchUserOrders } from '../../lib/api-client';
import type { Order } from '../../types/api';

function getStatusBadge(status: Order['status']) {
  switch (status) {
    case 'paid':
      return {
        label: 'Paid & Processing',
        icon: <Clock className="h-3.5 w-3.5 text-status-success" />,
        className: 'bg-status-success/10 text-status-success border-status-success/20',
      };
    case 'shipped':
      return {
        label: 'Shipped',
        icon: <Truck className="h-3.5 w-3.5 text-status-info" />,
        className: 'bg-status-info/10 text-status-info border-status-info/20',
      };
    case 'delivered':
      return {
        label: 'Delivered',
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />,
        className: 'bg-status-success/15 text-status-success border-status-success/30',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: <XCircle className="h-3.5 w-3.5 text-status-error" />,
        className: 'bg-status-error/10 text-status-error border-status-error/20',
      };
    case 'returned':
      return {
        label: 'Returned',
        icon: <RotateCcw className="h-3.5 w-3.5 text-status-warning" />,
        className: 'bg-status-warning/10 text-status-warning border-status-warning/20',
      };
    case 'pending':
    default:
      return {
        label: 'Pending Confirmation',
        icon: <Clock className="h-3.5 w-3.5 text-status-warning" />,
        className: 'bg-status-warning/10 text-status-warning border-status-warning/20',
      };
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading: isAuthLoading } = useRequireAuth('/orders');

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchUserOrders(token, user?.id);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order history');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token, user?.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center text-content-secondary gap-2.5">
        <Loader2 className="h-5 w-5 animate-spin text-brand-link" />
        <span className="text-sm font-medium">Authenticating...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-canvas text-content-primary flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-edge-subtle">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-control bg-surface border border-edge-subtle flex items-center justify-center text-brand-link shadow-sm">
                <Package className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-content-primary">Your Orders</h1>
            </div>
            <p className="text-xs sm:text-sm text-content-secondary mt-1.5">
              Review order history, view live delivery statuses, and launch direct AI support.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadOrders}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-control bg-surface border border-edge-subtle hover:bg-surface-hover hover:border-edge-strong text-content-secondary hover:text-content-primary transition-colors disabled:opacity-50"
              title="Refresh order list"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-brand-link ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/store"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-control bg-surface hover:bg-surface-hover border border-edge-subtle text-content-primary transition-colors shadow-sm"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-brand-link" />
              <span>Storefront</span>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="flex items-center justify-between p-4 rounded-card bg-status-error/10 border border-status-error/30 text-status-error text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadOrders}
              className="px-3 py-1.5 text-xs font-semibold bg-status-error/20 hover:bg-status-error/30 border border-status-error/30 rounded-control text-status-error transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-content-secondary space-y-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand-link" />
            <p className="text-sm font-medium">Loading your order history...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && orders.length === 0 && (
          <div className="rounded-dialog border border-dashed border-edge-subtle bg-surface/40 p-12 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-surface-elevated border border-edge-subtle flex items-center justify-center text-brand-link shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-content-primary">No orders found</h2>
              <p className="text-sm text-content-secondary max-w-sm mx-auto">
                You haven&apos;t placed any orders yet. Browse our hardware catalog and place your first checkout order!
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/store"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white text-sm font-semibold transition-all shadow-md shadow-brand-primary/20"
              >
                <span>Browse Store Catalog</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Orders List */}
        {!isLoading && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => {
              const badge = getStatusBadge(order.status);
              const formattedDate = order.createdAt
                ? new Date(order.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recent';

              return (
                <div
                  key={order.id}
                  className="rounded-card border border-edge-subtle bg-surface hover:border-edge-strong transition-all p-5 sm:p-6 space-y-4 shadow-sm"
                >
                  {/* Order Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-edge-subtle">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-content-muted">
                          Order ID
                        </span>
                        <code className="text-xs font-mono font-semibold text-brand-link bg-surface-inset px-2.5 py-0.5 rounded border border-edge-subtle">
                          {order.id}
                        </code>
                        <span className="text-xs text-content-muted hidden sm:inline">•</span>
                        <span className="text-xs text-content-muted">Placed on {formattedDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-tag text-xs font-semibold border ${badge.className}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </div>
                    </div>
                  </div>

                  {/* Order Details Body */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                    <div>
                      <span className="text-content-muted block mb-1">Total Paid</span>
                      <span className="text-xl font-bold text-content-primary tabular-nums tracking-tight">
                        ${parseFloat(order.totalAmount || '0').toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-content-muted block mb-1">Shipping Destination</span>
                      <div className="flex items-start gap-1.5 text-content-secondary">
                        <MapPin className="h-3.5 w-3.5 text-brand-link flex-shrink-0 mt-0.5" />
                        <span className="truncate">
                          {order.shippingAddressSnapshot || 'Primary address on file'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Footer — AI Autonomous Assistant Dock */}
                  <div className="pt-2 border-t border-edge-subtle">
                    <div className="p-3 rounded-control bg-surface-inset border border-edge-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <p className="text-xs text-content-muted flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-brand-link flex-shrink-0" />
                        <span>Need order tracking, address change, or return assistance?</span>
                      </p>

                      <button
                        type="button"
                        onClick={() => router.push(`/?orderId=${order.id}`)}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-control bg-brand-primary hover:bg-brand-hover active:bg-brand-deep text-white text-xs font-semibold transition-all shadow-sm shadow-brand-primary/20 shrink-0"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>Ask Agent About This Order</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
