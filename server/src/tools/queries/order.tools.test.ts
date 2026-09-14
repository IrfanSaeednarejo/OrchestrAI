import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { orders, users, shipments } from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createShipment,
} from '../../persistence/repositories/marketplace.repository.js';
import { getOrder, getShipmentStatus } from './order.tools.js';

describe('order tools', () => {
  let userId: string;
  let orderId: string;
  let orderIdNoShipment: string;

  beforeAll(async () => {
    const user = await createUser({
      name: 'Order Tools Test User',
      email: `order-tools-${Date.now()}@example.com`,
      defaultAddress: '1 Tool St',
    });
    userId = user.id;

    const order = await createOrder({
      userId,
      status: 'shipped',
      shippingAddressSnapshot: '1 Tool St',
      totalAmount: '99.99',
    });
    orderId = order.id;

    await createShipment({
      orderId,
      status: 'in_transit',
      trackingNumber: 'TRK-TOOLTEST-1',
      carrier: 'UPS',
    });

    const orderNoShip = await createOrder({
      userId,
      status: 'pending',
      shippingAddressSnapshot: '1 Tool St',
      totalAmount: '49.99',
    });
    orderIdNoShipment = orderNoShip.id;
  });

  afterAll(async () => {
    await db.delete(shipments).where(eq(shipments.orderId, orderId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  // -------------------------------------------------------------------------
  // get_order
  // -------------------------------------------------------------------------

  describe('get_order', () => {
    it('happy path: returns the order for a valid orderId', async () => {
      const result = await getOrder({ orderId });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe(orderId);
      expect(result.data.status).toBe('shipped');
      expect(result.data.totalAmount).toBe('99.99');
    });

    it('not found: returns NOT_FOUND for an unknown orderId', async () => {
      const result = await getOrder({ orderId: '00000000-0000-0000-0000-000000000000' });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // get_shipment_status
  // -------------------------------------------------------------------------

  describe('get_shipment_status', () => {
    it('happy path: returns shipment for an order that has one', async () => {
      const result = await getShipmentStatus({ orderId });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.orderId).toBe(orderId);
      expect(result.data.status).toBe('in_transit');
      expect(result.data.trackingNumber).toBe('TRK-TOOLTEST-1');
    });

    it('not found: returns NOT_FOUND for an order with no shipment', async () => {
      const result = await getShipmentStatus({ orderId: orderIdNoShipment });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});
