'use client';

// src/app/orders/page.tsx
// Phase 22 Step 4: Dedicated Order Management page with live status and 1-click Agent Support.

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
        icon: <Clock className="h-3.5 w-3.5 text-emerald-400" />,
        className: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60',
      };
    case 'shipped':
      return {
        label: 'Shipped',
        icon: <Truck className="h-3.5 w-3.5 text-sky-400" />,
        className: 'bg-sky-950/70 text-sky-300 border-sky-800/60',
      };
    case 'delivered':
      return {
        label: 'Delivered',
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" />,
        className: 'bg-purple-950/70 text-purple-300 border-purple-800/60',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: <XCircle className="h-3.5 w-3.5 text-rose-400" />,
        className: 'bg-rose-950/70 text-rose-300 border-rose-800/60',
      };
    case 'returned':
      return {
        label: 'Returned',
        icon: <RotateCcw className="h-3.5 w-3.5 text-amber-400" />,
        className: 'bg-amber-950/70 text-amber-300 border-amber-800/60',
      };
    case 'pending':
    default:
      return {
        label: 'Pending Confirmation',
        icon: <Clock className="h-3.5 w-3.5 text-amber-400" />,
        className: 'bg-amber-950/70 text-amber-300 border-amber-800/60',
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        <span>Authenticating...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-indigo-400" />
              <h1 className="text-2xl font-bold tracking-tight text-white">Your Orders</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Review order history, view live delivery statuses, and launch direct AI support.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadOrders}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-300 transition-colors disabled:opacity-50"
              title="Refresh order list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/store"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm shadow-indigo-950"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Storefront</span>
            </Link>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadOrders}
              className="px-3 py-1 text-xs font-medium bg-rose-900/60 hover:bg-rose-800/80 rounded-lg text-rose-200 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm">Loading your order history...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
              <Package className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">No orders found</h2>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                You haven&apos;t placed any orders yet. Browse our hardware catalog and place your first checkout order!
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/store"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-indigo-950"
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
                  className="rounded-xl border border-slate-800 bg-slate-900/70 hover:border-slate-700 transition-all p-5 sm:p-6 space-y-4"
                >
                  {/* Order Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                          Order ID
                        </span>
                        <code className="text-xs font-mono font-medium text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-900/60">
                          {order.id}
                        </code>
                      </div>
                      <p className="text-xs text-slate-500">Placed on {formattedDate}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.className}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </div>
                    </div>
                  </div>

                  {/* Order Details Body */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300 pt-1">
                    <div>
                      <span className="text-slate-500 block mb-1">Total Paid</span>
                      <span className="text-lg font-bold text-white">
                        ${parseFloat(order.totalAmount || '0').toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block mb-1">Shipping Destination</span>
                      <div className="flex items-start gap-1.5 text-slate-300">
                        <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                        <span className="truncate">
                          {order.shippingAddressSnapshot || 'Primary address on file'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-800/50">
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Need order tracking, address change, or return assistance?</span>
                    </p>

                    <button
                      type="button"
                      onClick={() => router.push(`/?orderId=${order.id}`)}
                      className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm shadow-indigo-950"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Ask Agent About This Order</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
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
