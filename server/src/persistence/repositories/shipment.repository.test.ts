import { describe, it, expect, afterAll } from 'vitest';
import { db } from '../db/client.js';
import { shipments, orders, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createShipment,
  markShipmentDelivered,
} from './marketplace.repository.js';

describe('markShipmentDelivered', () => {
  let userId: string;
  let orderId: string;
  let shipmentId: string;

  afterAll(async () => {
    await db.delete(shipments).where(eq(shipments.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('sets status to delivered and deliveredAt to a non-null timestamp atomically', async () => {
    const user = await createUser({
      name: 'Shipment Test User',
      email: `shipment-test-${Date.now()}@example.com`,
      defaultAddress: '10 Delivery Lane',
    });
    userId = user.id;

    const order = await createOrder({
      userId,
      status: 'shipped',
      shippingAddressSnapshot: '10 Delivery Lane',
      totalAmount: '49.99',
    });
    orderId = order.id;

    const shipment = await createShipment({
      orderId,
      status: 'in_transit',
      trackingNumber: 'TRK-TEST-DELIVER',
      carrier: 'FedEx',
    });
    shipmentId = shipment.id;

    // Precondition: deliveredAt is null before marking delivered
    expect(shipment.deliveredAt).toBeNull();
    expect(shipment.status).toBe('in_transit');

    const before = new Date();
    const updated = await markShipmentDelivered(shipmentId);
    const after = new Date();

    expect(updated).toBeDefined();
    expect(updated?.status).toBe('delivered');
    expect(updated?.deliveredAt).not.toBeNull();

    // deliveredAt must be within the window of this test execution
    const deliveredAt = updated?.deliveredAt;
    expect(deliveredAt).toBeDefined();
    if (!deliveredAt) return; // type-narrow without non-null assertion
    expect(deliveredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(deliveredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns undefined for a non-existent shipmentId', async () => {
    const result = await markShipmentDelivered('00000000-0000-0000-0000-000000000000');
    expect(result).toBeUndefined();
  });
});
