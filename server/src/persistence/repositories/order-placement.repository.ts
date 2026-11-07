// src/persistence/repositories/order-placement.repository.ts
// Phase 21: Atomic order placement — creates order + items + payment + shipment
// in a single Drizzle transaction. Called by POST /api/orders.

import { db } from '../db/client.js';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { orders, orderItems, payments, shipments, products } from '../db/schema.js';
import type { Order } from './marketplace.repository.js';
import { NotFoundError } from '../../api/errors/app-error.js';

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export interface PlacedOrderResult {
  order: Order;
  trackingNumber: string;
}

/**
 * Places a real order for a registered user.
 * Validates all productIds exist, then in a single transaction:
 *   1. Inserts orders row (status: 'paid').
 *   2. Inserts order_items rows with price snapshots.
 *   3. Inserts payments row (status: 'captured').
 *   4. Inserts shipments row (status: 'in_transit').
 *
 * Never throws on validation success — propagates DB errors up to the caller.
 */
export async function placeOrder(
  userId: string,
  shippingAddress: string,
  items: OrderLineInput[],
): Promise<PlacedOrderResult> {
  if (items.length === 0) {
    throw new Error('Order must contain at least one item');
  }

  // ── Validate & snapshot product prices ────────────────────────────────────
  const productRows = await Promise.all(
    items.map(async (line) => {
      const rows = await db.select().from(products).where(eq(products.id, line.productId));
      const product = rows[0];
      if (!product) {
        throw new NotFoundError(`Product not found: ${line.productId}`);
      }
      return { product, quantity: line.quantity };
    }),
  );

  // ── Compute total ─────────────────────────────────────────────────────────
  const totalAmount = productRows
    .reduce(
      (sum, { product, quantity }) => sum + parseFloat(product.price) * quantity,
      0,
    )
    .toFixed(2);

  // ── Tracking number: short alphanumeric derived from a UUID fragment ───────
  const trackingNumber = `OAI-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const estimatedDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

  // ── Atomic transaction ────────────────────────────────────────────────────
  return db.transaction(async (tx) => {
    // 1. Order
    const orderRows = await tx
      .insert(orders)
      .values({
        userId,
        status: 'paid',
        shippingAddressSnapshot: shippingAddress,
        totalAmount,
      })
      .returning();
    const order = orderRows[0];
    if (!order) throw new Error('Failed to create order');

    // 2. Order items (price snapshot)
    await tx.insert(orderItems).values(
      productRows.map(({ product, quantity }) => ({
        orderId: order.id,
        productId: product.id,
        quantity,
        unitPrice: product.price,
      })),
    );

    // 3. Payment (captured immediately — simulated)
    await tx.insert(payments).values({
      orderId: order.id,
      amount: totalAmount,
      status: 'captured',
      method: 'card',
    });

    // 4. Shipment (in_transit immediately — simulated fulfilment)
    await tx.insert(shipments).values({
      orderId: order.id,
      status: 'in_transit',
      trackingNumber,
      carrier: 'OrchestrAI Fulfillment',
      estimatedDelivery,
    });

    return { order, trackingNumber };
  });
}

