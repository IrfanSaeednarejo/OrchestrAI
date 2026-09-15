import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createRefund } from './refund.tools.js';
import { db } from '../../persistence/db/client.js';
import {
  users,
  orders,
  returns,
  payments,
  refunds,
} from '../../persistence/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createUser,
  createOrder,
  createReturn,
  createPayment,
  createRefund as createRefundRepo,
  updateReturnStatus,
} from '../../persistence/repositories/marketplace.repository.js';

describe('create_refund', () => {
  let userId: string;
  let order1Id: string;
  let order2Id: string;

  // Payments and Returns setup
  let validPaymentId: string;
  let duplicatePaymentId: string;
  let uncapturedPaymentId: string;
  let refundExistsPaymentId: string;
  let failedRefundPaymentId: string;
  let mismatchAmountPaymentId: string;

  let approvedReturnId: string;
  let requestedReturnId: string;
  let mismatchOrderReturnId: string;

  beforeAll(async () => {
    // 1. Create a user
    const email = `refund-tools-${Date.now()}@example.com`;
    const user = await createUser({
      email,
      name: 'Refund Tools Test User',
      defaultAddress: '1 Refund Way',
    });
    userId = user.id;

    // Helper to create order
    const makeOrder = async () => {
      const o = await createOrder({
        userId,
        status: 'delivered',
        shippingAddressSnapshot: '1 Refund Way',
        totalAmount: '100.00',
      });
      return o.id;
    };

    const oValid = await makeOrder();
    const oDuplicate = await makeOrder();
    const oUncap = await makeOrder();
    const oRefundExists = await makeOrder();
    const oFailedRefund = await makeOrder();
    const oMismatchAmount = await makeOrder();
    const oRequested = await makeOrder();
    
    // For mismatch order case
    const oMismatch1 = await makeOrder();
    const oMismatch2 = await makeOrder();

    // 4. Create Payments
    const pValid = await createPayment({
      orderId: oValid,
      amount: '100.00',
      status: 'captured',
      method: 'credit_card',
    });
    validPaymentId = pValid.id;

    const pDuplicate = await createPayment({
      orderId: oDuplicate,
      amount: '100.00',
      status: 'captured',
      method: 'credit_card',
    });
    duplicatePaymentId = pDuplicate.id;

    const pUncap = await createPayment({
      orderId: oUncap,
      amount: '100.00',
      status: 'authorized', // Not captured
      method: 'credit_card',
    });
    uncapturedPaymentId = pUncap.id;

    const pRefundExists = await createPayment({
      orderId: oRefundExists,
      amount: '100.00',
      status: 'captured',
      method: 'credit_card',
    });
    refundExistsPaymentId = pRefundExists.id;
    // Create existing pending refund
    await createRefundRepo({
      paymentId: refundExistsPaymentId,
      amount: '100.00',
      status: 'pending',
    });

    const pFailedRefund = await createPayment({
      orderId: oFailedRefund,
      amount: '100.00',
      status: 'captured',
      method: 'credit_card',
    });
    failedRefundPaymentId = pFailedRefund.id;
    // Create existing failed refund
    await createRefundRepo({
      paymentId: failedRefundPaymentId,
      amount: '100.00',
      status: 'failed',
    });

    const pMismatch = await createPayment({
      orderId: oMismatchAmount,
      amount: '100.00',
      status: 'captured',
      method: 'credit_card',
    });
    mismatchAmountPaymentId = pMismatch.id;

    const pMismatchReturnOrder = await createPayment({
      orderId: oMismatch1,
      amount: '100.00',
      status: 'captured',
      method: 'credit_card',
    });
    // Override the valid payment id for the mismatch order test? No, the mismatch order test uses validPaymentId and mismatchOrderReturnId.
    // Let's create a new set for mismatch order test so it's isolated, or just point to oMismatch2.
    // In the test we do: paymentId: validPaymentId, returnId: mismatchOrderReturnId.
    // validPaymentId belongs to oValid. We will create mismatchOrderReturnId belonging to oMismatch2.

    // 5. Create Returns
    const rApproved = await createReturn({
      orderId: oValid, // Matches validPaymentId
      reason: 'Defective',
      status: 'requested',
    });
    await updateReturnStatus(rApproved.id, 'approved');
    approvedReturnId = rApproved.id;

    const rRequested = await createReturn({
      orderId: oValid, // Also matches validPaymentId for the unapproved test
      reason: 'Wrong item',
      status: 'requested',
    });
    requestedReturnId = rRequested.id;

    const rMismatch = await createReturn({
      orderId: oMismatch2, // different order
      reason: 'No longer needed',
      status: 'approved',
    });
    mismatchOrderReturnId = rMismatch.id;
  });

  afterEach(async () => {
    // Delete any refunds created during the tests that were not part of the initial setup
    // For our setup, we can just delete refunds belonging to validPaymentId and duplicatePaymentId
    // since those are the ones modified in tests. Or just delete all refunds where amount is '100.00' and status='pending' 
    // EXCEPT the one we want to keep? Actually it's easier to just delete the one we just created in the test.
    // The easiest way to isolate is delete all refunds that are not refundExistsPaymentId or failedRefundPaymentId
    const testPaymentsToClean = [validPaymentId, duplicatePaymentId, mismatchAmountPaymentId, uncapturedPaymentId];
    for (const pid of testPaymentsToClean) {
      await db.delete(refunds).where(eq(refunds.paymentId, pid));
    }
  });

  afterAll(async () => {
    // Delete in dependency order
    const allPaymentIds = [
      validPaymentId,
      duplicatePaymentId,
      uncapturedPaymentId,
      refundExistsPaymentId,
      failedRefundPaymentId,
      mismatchAmountPaymentId,
    ];
    for (const pid of allPaymentIds) {
      await db.delete(refunds).where(eq(refunds.paymentId, pid));
    }
    
    const userOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, userId));
    for (const { id } of userOrders) {
      await db.delete(returns).where(eq(returns.orderId, id));
      await db.delete(payments).where(eq(payments.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  it('happy path with returnId (approved return, matching order, captured payment, matching amount)', async () => {
    const result = await createRefund({
      paymentId: validPaymentId,
      returnId: approvedReturnId,
      amount: '100.00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
      expect(result.data.paymentId).toBe(validPaymentId);
      expect(result.data.returnId).toBe(approvedReturnId);
    }
  });

  it('happy path with returnId: null (duplicate-charge case)', async () => {
    const result = await createRefund({
      paymentId: duplicatePaymentId,
      returnId: null,
      amount: '100.00',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
      expect(result.data.paymentId).toBe(duplicatePaymentId);
      expect(result.data.returnId).toBeNull();
    }
  });

  it('PAYMENT_NOT_FOUND for a nonexistent paymentId', async () => {
    const result = await createRefund({
      paymentId: '00000000-0000-0000-0000-000000000000',
      returnId: null,
      amount: '100.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PAYMENT_NOT_FOUND');
    }
  });

  it('PAYMENT_NOT_CAPTURED for a payment in a non-captured status', async () => {
    const result = await createRefund({
      paymentId: uncapturedPaymentId,
      returnId: null,
      amount: '100.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PAYMENT_NOT_CAPTURED');
    }
  });

  it('REFUND_ALREADY_EXISTS when a pending/processing/completed refund already exists on the payment', async () => {
    const result = await createRefund({
      paymentId: refundExistsPaymentId,
      returnId: null,
      amount: '100.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REFUND_ALREADY_EXISTS');
    }
  });

  it('confirms a "failed" existing refund does NOT block a new attempt', async () => {
    const result = await createRefund({
      paymentId: failedRefundPaymentId,
      returnId: null,
      amount: '100.00',
    });
    expect(result.success).toBe(true);
  });

  it('RETURN_NOT_FOUND for a nonexistent returnId', async () => {
    const result = await createRefund({
      paymentId: validPaymentId,
      returnId: '00000000-0000-0000-0000-000000000000',
      amount: '100.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('RETURN_NOT_FOUND');
    }
  });

  it('RETURN_ORDER_MISMATCH when the return\'s orderId doesn\'t match the payment\'s orderId', async () => {
    const result = await createRefund({
      paymentId: validPaymentId,
      returnId: mismatchOrderReturnId,
      amount: '100.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('RETURN_ORDER_MISMATCH');
    }
  });

  it('RETURN_NOT_APPROVED when the return exists but isn\'t approved', async () => {
    const result = await createRefund({
      paymentId: validPaymentId,
      returnId: requestedReturnId,
      amount: '100.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('RETURN_NOT_APPROVED');
    }
  });

  it('AMOUNT_MISMATCH when amount doesn\'t equal payment.amount exactly', async () => {
    const result = await createRefund({
      paymentId: mismatchAmountPaymentId,
      returnId: null,
      amount: '50.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AMOUNT_MISMATCH');
    }
  });

  it('INVALID_INPUT for malformed input (bad uuid, malformed amount)', async () => {
    const result1 = await createRefund({
      paymentId: 'not-a-uuid',
      returnId: null,
      amount: '100.00',
    });
    expect(result1.success).toBe(false);
    if (!result1.success) {
      expect(result1.error.code).toBe('INVALID_INPUT');
    }

    const result2 = await createRefund({
      paymentId: validPaymentId,
      returnId: null,
      amount: 100 as unknown as string, // Not a string
    });
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.code).toBe('INVALID_INPUT');
    }
  });
});
