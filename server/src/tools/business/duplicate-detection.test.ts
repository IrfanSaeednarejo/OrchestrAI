import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { payments, orders, users } from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createPayment,
} from '../../persistence/repositories/marketplace.repository.js';
import { detectDuplicateCharge } from './duplicate-detection.js';

describe('detectDuplicateCharge', () => {
  let userId: string;
  let order1Id: string;
  let payment1Id: string;
  let order2Id: string;
  let payment2Id: string;
  let normalOrderId: string;
  let normalPaymentId: string;

  beforeAll(async () => {
    const user = await createUser({
      name: 'Duplicate Test User',
      email: `duplicate-${Date.now()}@example.com`,
      defaultAddress: '300 Duplicate Ln',
    });
    userId = user.id;

    // Order 1 + Payment 1
    const o1 = await createOrder({
      userId,
      status: 'paid',
      shippingAddressSnapshot: '300 Duplicate Ln',
      totalAmount: '299.99',
    });
    order1Id = o1.id;
    const p1 = await createPayment({
      orderId: order1Id,
      amount: '299.99',
      status: 'captured',
      method: 'credit_card',
    });
    payment1Id = p1.id;

    // Order 2 + Payment 2 (Duplicate charge on another order within 24h, same amount)
    const o2 = await createOrder({
      userId,
      status: 'paid',
      shippingAddressSnapshot: '300 Duplicate Ln',
      totalAmount: '299.99',
    });
    order2Id = o2.id;
    const p2 = await createPayment({
      orderId: order2Id,
      amount: '299.99',
      status: 'captured',
      method: 'credit_card',
    });
    payment2Id = p2.id;

    // Normal Order + Payment (different amount)
    const oNormal = await createOrder({
      userId,
      status: 'paid',
      shippingAddressSnapshot: '300 Duplicate Ln',
      totalAmount: '49.99',
    });
    normalOrderId = oNormal.id;
    const pNormal = await createPayment({
      orderId: normalOrderId,
      amount: '49.99',
      status: 'captured',
      method: 'credit_card',
    });
    normalPaymentId = pNormal.id;
  });

  afterAll(async () => {
    await db.delete(payments).where(eq(payments.orderId, order1Id));
    await db.delete(payments).where(eq(payments.orderId, order2Id));
    await db.delete(payments).where(eq(payments.orderId, normalOrderId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('detects potential duplicate when matching captured payment exists on another order within 24h using string comparison', async () => {
    const result = await detectDuplicateCharge({ paymentId: payment1Id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.potentialDuplicate).toBe(true);
    expect(result.data.duplicatePaymentId).toBe(payment2Id);
  });

  it('returns potentialDuplicate: false for a payment without duplicate charges', async () => {
    const result = await detectDuplicateCharge({ paymentId: normalPaymentId });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.potentialDuplicate).toBe(false);
  });

  it('returns NOT_FOUND for non-existent paymentId', async () => {
    const result = await detectDuplicateCharge({ paymentId: '00000000-0000-0000-0000-000000000000' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns INVALID_INPUT for invalid paymentId format', async () => {
    const result = await detectDuplicateCharge({ paymentId: 'invalid-uuid' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});
