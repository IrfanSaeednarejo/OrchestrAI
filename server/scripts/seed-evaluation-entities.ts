import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import {
  users,
  orders,
  payments,
  shipments,
  returns,
  refunds,
} from '../src/persistence/db/schema.js';

export async function seedEvaluationEntities() {
  console.log('--- Seeding evaluation scenario entities ---');

  const userId = '00000000-0000-4000-8000-000000000001';

  // 1. Ensure primary evaluation user
  await db.insert(users).values({
    id: userId,
    name: 'Jane Doe',
    email: 'customer@example.com',
    defaultAddress: '123 Main St, Springfield',
  }).onConflictDoUpdate({
    target: users.id,
    set: {
      name: 'Jane Doe',
      email: 'customer@example.com',
      defaultAddress: '123 Main St, Springfield',
    },
  });

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  // 2. Orders
  const orderData = [
    { id: '00000000-0000-4000-8000-000000000101', status: 'delivered' as const, createdAt: daysAgo(3), deliveredAt: daysAgo(2), totalAmount: '120.00' },
    { id: '00000000-0000-4000-8000-000000000102', status: 'shipped' as const, createdAt: daysAgo(2), deliveredAt: null, totalAmount: '85.50' },
    { id: '00000000-0000-4000-8000-000000000103', status: 'delivered' as const, createdAt: daysAgo(2), deliveredAt: daysAgo(1), totalAmount: '99.99' },
    { id: '00000000-0000-4000-8000-000000000104', status: 'delivered' as const, createdAt: daysAgo(5), deliveredAt: daysAgo(4), totalAmount: '45.00' },
    { id: '00000000-0000-4000-8000-000000000105', status: 'delivered' as const, createdAt: daysAgo(3), deliveredAt: daysAgo(2), totalAmount: '49.99' },
    { id: '00000000-0000-4000-8000-000000000106', status: 'delivered' as const, createdAt: daysAgo(10), deliveredAt: daysAgo(9), totalAmount: '150.00' },
    { id: '00000000-0000-4000-8000-000000000107', status: 'delivered' as const, createdAt: daysAgo(12), deliveredAt: daysAgo(11), totalAmount: '200.00' },
    { id: '00000000-0000-4000-8000-000000000108', status: 'delivered' as const, createdAt: daysAgo(15), deliveredAt: daysAgo(14), totalAmount: '110.00' },
    { id: '00000000-0000-4000-8000-000000000109', status: 'delivered' as const, createdAt: daysAgo(50), deliveredAt: daysAgo(45), totalAmount: '60.00' }, // Ineligible
    { id: '00000000-0000-4000-8000-000000000115', status: 'shipped' as const, createdAt: daysAgo(2), deliveredAt: null, totalAmount: '75.00' },
    { id: '00000000-0000-4000-8000-000000000117', status: 'delivered' as const, createdAt: daysAgo(10), deliveredAt: daysAgo(8), totalAmount: '130.00' },
    { id: '00000000-0000-4000-8000-000000000118', status: 'shipped' as const, createdAt: daysAgo(3), deliveredAt: null, totalAmount: '95.00' },
    { id: '00000000-0000-4000-8000-000000000119', status: 'delivered' as const, createdAt: daysAgo(4), deliveredAt: daysAgo(2), totalAmount: '129.99' },
    { id: '00000000-0000-4000-8000-000000000120', status: 'delivered' as const, createdAt: daysAgo(3), deliveredAt: daysAgo(1), totalAmount: '89.00' },
    { id: '00000000-0000-4000-8000-000000000122', status: 'delivered' as const, createdAt: daysAgo(14), deliveredAt: daysAgo(12), totalAmount: '75.00' },
    { id: '00000000-0000-4000-8000-000000000128', status: 'delivered' as const, createdAt: daysAgo(4), deliveredAt: daysAgo(3), totalAmount: '160.00' },
  ];

  for (const o of orderData) {
    await db.insert(orders).values({
      id: o.id,
      userId,
      status: o.status,
      shippingAddressSnapshot: '123 Main St, Springfield',
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
    }).onConflictDoUpdate({
      target: orders.id,
      set: { status: o.status, totalAmount: o.totalAmount },
    });
  }

  // 3. Payments
  const paymentData = [
    // S03 duplicate payment pair (two different orders for same user with same amount within 24h)
    { id: '00000000-0000-4000-8000-000000000901', orderId: '00000000-0000-4000-8000-000000000103', amount: '99.99', status: 'captured' as const, createdAt: daysAgo(1) },
    { id: '00000000-0000-4000-8000-000000000902', orderId: '00000000-0000-4000-8000-000000000104', amount: '99.99', status: 'captured' as const, createdAt: daysAgo(1) },
    // S05 receipt
    { id: '00000000-0000-4000-8000-000000000905', orderId: '00000000-0000-4000-8000-000000000105', amount: '49.99', status: 'captured' as const, createdAt: daysAgo(3) },
    // S19 receipt
    { id: '00000000-0000-4000-8000-000000000919', orderId: '00000000-0000-4000-8000-000000000119', amount: '129.99', status: 'captured' as const, createdAt: daysAgo(4) },
    // S20 single payment (no duplicate)
    { id: '00000000-0000-4000-8000-000000000920', orderId: '00000000-0000-4000-8000-000000000120', amount: '89.00', status: 'captured' as const, createdAt: daysAgo(3) },
    // S22 refund
    { id: '00000000-0000-4000-8000-000000000922', orderId: '00000000-0000-4000-8000-000000000122', amount: '75.00', status: 'captured' as const, createdAt: daysAgo(14) },
  ];

  for (const p of paymentData) {
    await db.insert(payments).values({
      id: p.id,
      orderId: p.orderId,
      amount: p.amount,
      status: p.status,
      method: 'credit_card',
      createdAt: p.createdAt,
    }).onConflictDoUpdate({
      target: payments.id,
      set: { status: p.status, amount: p.amount },
    });
  }

  // 4. Shipments
  const shipmentData = [
    { id: '00000000-0000-4000-8000-000000000801', orderId: '00000000-0000-4000-8000-000000000101', carrier: 'FedEx', trackingNumber: 'TRK-101-FEDEX', status: 'delivered' as const },
    { id: '00000000-0000-4000-8000-000000000802', orderId: '00000000-0000-4000-8000-000000000102', carrier: 'UPS', trackingNumber: 'TRK-102-UPS', status: 'in_transit' as const },
    { id: '00000000-0000-4000-8000-000000000815', orderId: '00000000-0000-4000-8000-000000000115', carrier: 'USPS', trackingNumber: 'TRK-115-USPS', status: 'in_transit' as const },
    { id: '00000000-0000-4000-8000-000000000818', orderId: '00000000-0000-4000-8000-000000000118', carrier: 'DHL', trackingNumber: 'TRK-118-DHL', status: 'in_transit' as const },
  ];

  for (const s of shipmentData) {
    await db.insert(shipments).values({
      id: s.id,
      orderId: s.orderId,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      status: s.status,
    }).onConflictDoUpdate({
      target: shipments.id,
      set: { status: s.status, trackingNumber: s.trackingNumber },
    });
  }

  // 5. Returns
  const returnData = [
    // S08: approved return
    { id: '00000000-0000-4000-8000-000000000708', orderId: '00000000-0000-4000-8000-000000000108', status: 'approved' as const, reason: 'Wrong size' },
    // S16: return status check
    { id: '00000000-0000-4000-8000-000000000216', orderId: '00000000-0000-4000-8000-000000000106', status: 'in_transit' as const, reason: 'Defective item' },
    // S22: approved return for refund
    { id: '00000000-0000-4000-8000-000000000222', orderId: '00000000-0000-4000-8000-000000000122', status: 'approved' as const, reason: 'Changed mind' },
  ];

  for (const r of returnData) {
    await db.insert(returns).values({
      id: r.id,
      orderId: r.orderId,
      status: r.status,
      reason: r.reason,
    }).onConflictDoUpdate({
      target: returns.id,
      set: { status: r.status },
    });
  }

  // 6. Refunds
  const refundData = [
    // S21: refund status check
    { id: '00000000-0000-4000-8000-000000000321', paymentId: '00000000-0000-4000-8000-000000000922', amount: '75.00', status: 'completed' as const, reason: 'Returned item refund' },
  ];

  for (const rf of refundData) {
    await db.insert(refunds).values({
      id: rf.id,
      paymentId: rf.paymentId,
      amount: rf.amount,
      status: rf.status,
      reason: rf.reason,
    }).onConflictDoUpdate({
      target: refunds.id,
      set: { status: rf.status, amount: rf.amount },
    });
  }

  console.log('Seeding complete successfully.');
}

if (process.argv[1] && process.argv[1].includes('seed-evaluation-entities')) {
  seedEvaluationEntities().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
