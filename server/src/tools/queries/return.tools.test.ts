import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { returns, orders, users } from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createReturn,
} from '../../persistence/repositories/marketplace.repository.js';
import { getReturnStatus, getReturnByOrder } from './return.tools.js';

describe('return tools', () => {
  let userId: string;
  let orderId: string;
  let returnId: string;
  let orderIdNoReturn: string;

  beforeAll(async () => {
    const user = await createUser({
      name: 'Return Tools Test User',
      email: `return-tools-${Date.now()}@example.com`,
      defaultAddress: '2 Return Ave',
    });
    userId = user.id;

    const order = await createOrder({
      userId,
      status: 'returned',
      shippingAddressSnapshot: '2 Return Ave',
      totalAmount: '199.99',
    });
    orderId = order.id;

    const ret = await createReturn({
      orderId,
      status: 'approved',
      reason: 'Defective item',
    });
    returnId = ret.id;

    const orderNoReturn = await createOrder({
      userId,
      status: 'delivered',
      shippingAddressSnapshot: '2 Return Ave',
      totalAmount: '49.99',
    });
    orderIdNoReturn = orderNoReturn.id;
  });

  afterAll(async () => {
    await db.delete(returns).where(eq(returns.orderId, orderId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  // -------------------------------------------------------------------------
  // get_return_status
  // -------------------------------------------------------------------------

  describe('get_return_status', () => {
    it('happy path: returns the return record for a valid returnId', async () => {
      const result = await getReturnStatus({ returnId });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe(returnId);
      expect(result.data.orderId).toBe(orderId);
      expect(result.data.status).toBe('approved');
      expect(result.data.reason).toBe('Defective item');
    });

    it('not found: returns NOT_FOUND for an unknown returnId', async () => {
      const result = await getReturnStatus({ returnId: '00000000-0000-0000-0000-000000000000' });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('invalid input: returns INVALID_INPUT for a malformed returnId', async () => {
      const result = await getReturnStatus({ returnId: 'not-a-uuid' });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_INPUT');
    });
  });

  // -------------------------------------------------------------------------
  // get_return_by_order
  // -------------------------------------------------------------------------

  describe('get_return_by_order', () => {
    it('happy path: returns all returns for an order that has one', async () => {
      const result = await getReturnByOrder({ orderId });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe(returnId);
      expect(result.data[0]?.status).toBe('approved');
    });

    it('empty: returns an empty array for an order with no returns', async () => {
      const result = await getReturnByOrder({ orderId: orderIdNoReturn });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual([]);
    });

    it('invalid input: returns INVALID_INPUT for a malformed orderId', async () => {
      const result = await getReturnByOrder({ orderId: 'not-a-uuid' });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_INPUT');
    });
  });
});
