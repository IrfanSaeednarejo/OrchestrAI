import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { returns, shipments, orders, users } from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createShipment,
} from '../../persistence/repositories/marketplace.repository.js';
import { checkReturnEligibility, createReturn } from './return.tools.js';

describe('return mutation tools', () => {
  let userId: string;
  let eligibleOrderId: string;
  let ineligibleOrderId: string;
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const user = await createUser({
      name: 'Return Tools Mutation Test User',
      email: `return-mutation-${Date.now()}@example.com`,
      defaultAddress: '200 Mutation St',
    });
    userId = user.id;

    // Eligible order
    const elgOrder = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '200 Mutation St',
      totalAmount: '150.00',
    });
    eligibleOrderId = elgOrder.id;
    await createShipment({
      orderId: eligibleOrderId,
      status: 'delivered',
      deliveredAt: twoDaysAgo,
    });

    // Ineligible order (not delivered)
    const inelgOrder = await createOrder({
      userId,
      status: 'shipped',
      shippingAddressSnapshot: '200 Mutation St',
      totalAmount: '50.00',
    });
    ineligibleOrderId = inelgOrder.id;
    await createShipment({
      orderId: ineligibleOrderId,
      status: 'in_transit',
    });
  });

  afterAll(async () => {
    await db.delete(returns).where(eq(returns.orderId, eligibleOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, eligibleOrderId));
    await db.delete(shipments).where(eq(shipments.orderId, ineligibleOrderId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  // -------------------------------------------------------------------------
  // check_return_eligibility
  // -------------------------------------------------------------------------

  describe('check_return_eligibility', () => {
    it('returns eligible: true with deliveredAt and daysSinceDelivery for an eligible order', async () => {
      const result = await checkReturnEligibility({ orderId: eligibleOrderId });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.eligible).toBe(true);
      expect(result.data.reason).toBeUndefined();
      expect(result.data.deliveredAt).toEqual(twoDaysAgo);
      expect(result.data.daysSinceDelivery).toBe(2);
    });

    it('returns eligible: false with reason for an ineligible order', async () => {
      const result = await checkReturnEligibility({ orderId: ineligibleOrderId });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.eligible).toBe(false);
      expect(result.data.reason).toBe('ORDER_NOT_DELIVERED');
    });

    it('returns INVALID_INPUT for bad input schema', async () => {
      const result = await checkReturnEligibility({ orderId: 'not-a-uuid' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_INPUT');
    });
  });

  // -------------------------------------------------------------------------
  // create_return
  // -------------------------------------------------------------------------

  describe('create_return', () => {
    it('creates a return successfully for an eligible order', async () => {
      const result = await createReturn({
        orderId: eligibleOrderId,
        reason: 'Item damaged during shipping',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.orderId).toBe(eligibleOrderId);
      expect(result.data.status).toBe('requested');
      expect(result.data.reason).toBe('Item damaged during shipping');
    });

    it('rejects return creation for an ineligible order with error code matching reason', async () => {
      const result = await createReturn({
        orderId: ineligibleOrderId,
        reason: 'Does not fit',
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('ORDER_NOT_DELIVERED');
    });

    it('returns INVALID_INPUT when reason is empty', async () => {
      const result = await createReturn({
        orderId: eligibleOrderId,
        reason: '',
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_INPUT');
    });
  });
});
