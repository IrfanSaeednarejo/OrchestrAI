import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { returns, shipments, orders, users } from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createShipment,
  createReturn,
} from '../../persistence/repositories/marketplace.repository.js';
import { evaluateReturnEligibility } from './return-eligibility.js';

describe('evaluateReturnEligibility', () => {
  let userId: string;
  let deliveredOrderId: string;
  let expiredOrderId: string;
  let inTransitOrderId: string;
  let returnedOrderId: string;
  let rejectedReturnOrderId: string;
  let missingDeliveredAtOrderId: string;
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const user = await createUser({
      name: 'Eligibility Test User',
      email: `eligibility-${Date.now()}@example.com`,
      defaultAddress: '100 Test St',
    });
    userId = user.id;

    // 1. Delivered order (delivered 5 days ago) - Eligible
    const delOrder = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '100 Test St',
      totalAmount: '100.00',
    });
    deliveredOrderId = delOrder.id;
    await createShipment({
      orderId: deliveredOrderId,
      status: 'delivered',
      deliveredAt: fiveDaysAgo,
    });

    // 2. Expired order (delivered 40 days ago) - RETURN_WINDOW_EXPIRED
    const expOrder = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '100 Test St',
      totalAmount: '100.00',
    });
    expiredOrderId = expOrder.id;
    await createShipment({
      orderId: expiredOrderId,
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });

    // 3. In-transit order (status shipped) - ORDER_NOT_DELIVERED
    const inTransitOrder = await createOrder({
      userId,
      status: 'shipped',
      shippingAddressSnapshot: '100 Test St',
      totalAmount: '100.00',
    });
    inTransitOrderId = inTransitOrder.id;
    await createShipment({
      orderId: inTransitOrderId,
      status: 'in_transit',
    });

    // 4. Delivered order with active return - RETURN_ALREADY_EXISTS
    const retOrder = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '100 Test St',
      totalAmount: '100.00',
    });
    returnedOrderId = retOrder.id;
    await createShipment({
      orderId: returnedOrderId,
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await createReturn({
      orderId: returnedOrderId,
      status: 'requested',
      reason: 'Wrong size',
    });

    // 5. Delivered order with rejected return - Eligible (if within window)
    const rejOrder = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '100 Test St',
      totalAmount: '100.00',
    });
    rejectedReturnOrderId = rejOrder.id;
    await createShipment({
      orderId: rejectedReturnOrderId,
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await createReturn({
      orderId: rejectedReturnOrderId,
      status: 'rejected',
      reason: 'Previously rejected',
    });

    // 6. Order delivered in status, but missing shipment deliveredAt - ORDER_NOT_DELIVERED (fallback)
    const missingDel = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '100 Test St',
      totalAmount: '100.00',
    });
    missingDeliveredAtOrderId = missingDel.id;
    await createShipment({
      orderId: missingDeliveredAtOrderId,
      status: 'delivered',
      deliveredAt: null,
    });
  });

  afterAll(async () => {
    await db.delete(returns).where(eq(returns.orderId, returnedOrderId));
    await db.delete(returns).where(eq(returns.orderId, rejectedReturnOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, deliveredOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, expiredOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, inTransitOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, returnedOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, rejectedReturnOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, missingDeliveredAtOrderId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('returns ORDER_NOT_FOUND when order does not exist', async () => {
    const result = await evaluateReturnEligibility('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual({ eligible: false, reason: 'ORDER_NOT_FOUND' });
  });

  it('returns ORDER_NOT_DELIVERED when order status is not delivered', async () => {
    const result = await evaluateReturnEligibility(inTransitOrderId);
    expect(result).toEqual({ eligible: false, reason: 'ORDER_NOT_DELIVERED' });
  });

  it('returns ORDER_NOT_DELIVERED when order status is delivered but shipment.deliveredAt is missing', async () => {
    const result = await evaluateReturnEligibility(missingDeliveredAtOrderId);
    expect(result).toEqual({ eligible: false, reason: 'ORDER_NOT_DELIVERED' });
  });

  it('returns RETURN_WINDOW_EXPIRED when delivered > 30 days ago', async () => {
    const result = await evaluateReturnEligibility(expiredOrderId);
    expect(result).toEqual({ eligible: false, reason: 'RETURN_WINDOW_EXPIRED' });
  });

  it('returns RETURN_ALREADY_EXISTS when an active return exists', async () => {
    const result = await evaluateReturnEligibility(returnedOrderId);
    expect(result).toEqual({ eligible: false, reason: 'RETURN_ALREADY_EXISTS' });
  });

  it('returns eligible: true with deliveredAt and daysSinceDelivery for valid delivered order within 30 days', async () => {
    const result = await evaluateReturnEligibility(deliveredOrderId);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.deliveredAt.getTime()).toBe(fiveDaysAgo.getTime());
    expect(result.daysSinceDelivery).toBe(5);
  });

  it('returns eligible: true when only rejected returns exist for the order', async () => {
    const result = await evaluateReturnEligibility(rejectedReturnOrderId);
    expect(result.eligible).toBe(true);
  });
});
