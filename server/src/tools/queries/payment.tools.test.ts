import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { refunds, payments, orders, users } from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createPayment,
  createRefund,
} from '../../persistence/repositories/marketplace.repository.js';
import { getPayment, getRefundStatus } from './payment.tools.js';

describe('payment tools', () => {
  let userId: string;
  let orderId: string;
  let paymentId: string;
  let refundId: string;
  let orderIdNoPayment: string;

  beforeAll(async () => {
    const user = await createUser({
      name: 'Payment Tools Test User',
      email: `payment-tools-${Date.now()}@example.com`,
      defaultAddress: '3 Payment Blvd',
    });
    userId = user.id;

    const order = await createOrder({
      userId,
      status: 'paid',
      shippingAddressSnapshot: '3 Payment Blvd',
      totalAmount: '299.99',
    });
    orderId = order.id;

    const payment = await createPayment({
      orderId,
      amount: '299.99',
      status: 'captured',
      method: 'credit_card',
    });
    paymentId = payment.id;

    const refund = await createRefund({
      paymentId,
      returnId: null,
      amount: '299.99',
      status: 'completed',
    });
    refundId = refund.id;

    const orderNoPayment = await createOrder({
      userId,
      status: 'pending',
      shippingAddressSnapshot: '3 Payment Blvd',
      totalAmount: '49.99',
    });
    orderIdNoPayment = orderNoPayment.id;
  });

  afterAll(async () => {
    await db.delete(refunds).where(eq(refunds.paymentId, paymentId));
    await db.delete(payments).where(eq(payments.orderId, orderId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  // -------------------------------------------------------------------------
  // get_payment
  // -------------------------------------------------------------------------

  describe('get_payment', () => {
    it('happy path: returns payment for a valid orderId', async () => {
      const result = await getPayment({ orderId });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe(paymentId);
      expect(result.data.orderId).toBe(orderId);
      expect(result.data.status).toBe('captured');
      expect(result.data.method).toBe('credit_card');
      expect(result.data.amount).toBe('299.99');
    });

    it('not found: returns NOT_FOUND for an order with no payment', async () => {
      const result = await getPayment({ orderId: orderIdNoPayment });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // get_refund_status
  // -------------------------------------------------------------------------

  describe('get_refund_status', () => {
    it('happy path: returns the refund record for a valid refundId', async () => {
      const result = await getRefundStatus({ refundId });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe(refundId);
      expect(result.data.paymentId).toBe(paymentId);
      expect(result.data.returnId).toBeNull();
      expect(result.data.status).toBe('completed');
      expect(result.data.amount).toBe('299.99');
    });

    it('not found: returns NOT_FOUND for an unknown refundId', async () => {
      const result = await getRefundStatus({ refundId: '00000000-0000-0000-0000-000000000000' });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});
