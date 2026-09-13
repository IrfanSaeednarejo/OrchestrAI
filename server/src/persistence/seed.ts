import 'dotenv/config';
import { db } from './db/client.js';
import {
  toolExecutions,
  agentExecutions,
  routingHistory,
  messages,
  conversations,
  refunds,
  returns,
  shipments,
  payments,
  orderItems,
  orders,
  products,
  users,
} from './db/schema.js';
import {
  createUser,
  createProduct,
  createOrder,
  createOrderItem,
  createPayment,
  createShipment,
  createReturn,
  createRefund,
} from './repositories/marketplace.repository.js';
import {
  createConversation,
  createMessage,
} from './repositories/conversation.repository.js';

async function seed() {
  console.log('--- Wiping database ---');
  // Wipe in FK-safe order
  await db.delete(toolExecutions);
  await db.delete(agentExecutions);
  await db.delete(routingHistory);
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(refunds);
  await db.delete(returns);
  await db.delete(shipments);
  await db.delete(payments);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(products);
  await db.delete(users);

  const stats = {
    users: 0,
    orders: 0,
    payments: 0,
    returns: 0,
    refunds: 0,
  };

  const specialCases: Record<string, unknown> = {};

  console.log('--- Creating Users ---');
  const u1 = await createUser({
    name: 'Alice Anderson',
    email: 'alice@example.com',
    defaultAddress: '123 Alpha St',
  });
  stats.users++;
  console.log(`Created user: ${u1.email}`);

  const u2 = await createUser({
    name: 'Bob Benson',
    email: 'bob@example.com',
    defaultAddress: '456 Beta Ave',
  });
  stats.users++;
  console.log(`Created user: ${u2.email}`);

  const u3 = await createUser({
    name: 'Charlie Chaplin',
    email: 'charlie@example.com',
    defaultAddress: '789 Gamma Blvd',
  });
  stats.users++;
  console.log(`Created user: ${u3.email}`);

  const u4 = await createUser({
    name: 'Dave Daveman',
    email: 'dave@example.com',
    defaultAddress: '101 Delta Ln',
  });
  stats.users++;
  console.log(`Created user: ${u4.email}`);

  console.log('--- Creating Products ---');
  const p1 = await createProduct({
    name: 'Pro Laptop',
    price: '1999.99',
    sku: 'LAP-PRO-1',
  });

  const p2 = await createProduct({
    name: 'Wireless Headphones',
    price: '199.99',
    sku: 'AUD-WH-1',
  });

  // --- Scenario 1: Happy Path ---
  console.log('--- Scenario 1: Happy Path ---');
  const orderHappy = await createOrder({
    userId: u1.id,
    status: 'delivered',
    shippingAddressSnapshot: u1.defaultAddress,
    totalAmount: '1999.99',
  });
  stats.orders++;
  await createOrderItem({
    orderId: orderHappy.id,
    productId: p1.id,
    quantity: 1,
    unitPrice: p1.price,
  });
  await createPayment({
    orderId: orderHappy.id,
    amount: '1999.99',
    status: 'captured',
    method: 'credit_card',
  });
  stats.payments++;
  await createShipment({
    orderId: orderHappy.id,
    status: 'delivered',
    trackingNumber: 'TRK-HAPPY-1',
    carrier: 'FedEx',
  });
  specialCases.happyPathOrderId = orderHappy.id;
  console.log(`Created Happy Path Order: ${orderHappy.id}`);

  // --- Scenario 2: Ambiguous Orders ---
  console.log('--- Scenario 2: Ambiguous Orders ---');
  const orderAmb1 = await createOrder({
    userId: u2.id,
    status: 'pending',
    shippingAddressSnapshot: u2.defaultAddress,
    totalAmount: '199.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderAmb1.id, productId: p2.id, quantity: 1, unitPrice: p2.price });
  
  const orderAmb2 = await createOrder({
    userId: u2.id,
    status: 'pending',
    shippingAddressSnapshot: u2.defaultAddress,
    totalAmount: '199.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderAmb2.id, productId: p2.id, quantity: 1, unitPrice: p2.price });
  specialCases.ambiguousOrderIds = [orderAmb1.id, orderAmb2.id];
  console.log(`Created Ambiguous Orders: ${orderAmb1.id}, ${orderAmb2.id}`);

  // --- Scenario 3 & 7: Duplicate Charge & Refund ---
  console.log('--- Scenario 3 & 7: Duplicate Charge & Refund ---');
  const orderDup1 = await createOrder({
    userId: u3.id,
    status: 'paid',
    shippingAddressSnapshot: u3.defaultAddress,
    totalAmount: '1999.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderDup1.id, productId: p1.id, quantity: 1, unitPrice: p1.price });
  const payDup1 = await createPayment({
    orderId: orderDup1.id,
    amount: '1999.99',
    status: 'captured',
    method: 'credit_card',
  });
  stats.payments++;

  const orderDup2 = await createOrder({
    userId: u3.id,
    status: 'paid',
    shippingAddressSnapshot: u3.defaultAddress,
    totalAmount: '1999.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderDup2.id, productId: p1.id, quantity: 1, unitPrice: p1.price });
  const payDup2 = await createPayment({
    orderId: orderDup2.id,
    amount: '1999.99',
    status: 'captured',
    method: 'credit_card',
  });
  stats.payments++;

  // The refund for the duplicate charge (Scenario 7)
  const dupRefund = await createRefund({
    paymentId: payDup2.id,
    returnId: null,
    amount: '1999.99',
    status: 'completed',
  });
  stats.refunds++;
  specialCases.duplicateCharge = {
    order1: orderDup1.id,
    payment1: payDup1.id,
    order2: orderDup2.id,
    payment2: payDup2.id,
    refundNoReturn: dupRefund.id
  };
  console.log(`Created Duplicate Charge Orders: ${orderDup1.id}, ${orderDup2.id}`);

  // --- Scenario 4: Return Approved, No Refund ---
  console.log('--- Scenario 4: Return Approved, No Refund ---');
  const orderRetApp = await createOrder({
    userId: u4.id,
    status: 'returned',
    shippingAddressSnapshot: u4.defaultAddress,
    totalAmount: '199.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderRetApp.id, productId: p2.id, quantity: 1, unitPrice: p2.price });
  const retApp = await createReturn({
    orderId: orderRetApp.id,
    status: 'approved',
    reason: 'Defective item',
  });
  stats.returns++;
  specialCases.returnApprovedNoRefund = retApp.id;
  console.log(`Created Return (Approved, No Refund): ${retApp.id}`);

  // --- Scenario 5: Return Rejected ---
  console.log('--- Scenario 5: Return Rejected ---');
  const orderRetRej = await createOrder({
    userId: u4.id,
    status: 'delivered',
    shippingAddressSnapshot: u4.defaultAddress,
    totalAmount: '1999.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderRetRej.id, productId: p1.id, quantity: 1, unitPrice: p1.price });
  const retRej = await createReturn({
    orderId: orderRetRej.id,
    status: 'rejected',
    reason: 'Past 30 days policy',
  });
  stats.returns++;
  specialCases.returnRejected = retRej.id;
  console.log(`Created Return (Rejected): ${retRej.id}`);

  // --- Scenario 6: Return Completed, Refund Completed ---
  console.log('--- Scenario 6: Return Completed, Refund Completed ---');
  const orderRetComp = await createOrder({
    userId: u1.id,
    status: 'returned',
    shippingAddressSnapshot: u1.defaultAddress,
    totalAmount: '199.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderRetComp.id, productId: p2.id, quantity: 1, unitPrice: p2.price });
  const payRetComp = await createPayment({
    orderId: orderRetComp.id,
    amount: '199.99',
    status: 'captured',
    method: 'credit_card',
  });
  stats.payments++;
  const retComp = await createReturn({
    orderId: orderRetComp.id,
    status: 'completed',
    reason: 'Changed mind',
  });
  stats.returns++;
  const refComp = await createRefund({
    paymentId: payRetComp.id,
    returnId: retComp.id,
    amount: '199.99',
    status: 'completed',
  });
  stats.refunds++;
  specialCases.returnCompleted = { returnId: retComp.id, refundId: refComp.id };
  console.log(`Created Return (Completed): ${retComp.id}`);

  // --- Scenario 8: Shipped but not Delivered ---
  console.log('--- Scenario 8: Shipped but not Delivered ---');
  const orderShip = await createOrder({
    userId: u2.id,
    status: 'shipped',
    shippingAddressSnapshot: u2.defaultAddress,
    totalAmount: '199.99',
  });
  stats.orders++;
  await createOrderItem({ orderId: orderShip.id, productId: p2.id, quantity: 1, unitPrice: p2.price });
  await createShipment({
    orderId: orderShip.id,
    status: 'in_transit',
    trackingNumber: 'TRK-INTRANSIT-1',
    carrier: 'UPS',
  });
  specialCases.shippedNotDeliveredOrderId = orderShip.id;
  console.log(`Created Order (Shipped/In Transit): ${orderShip.id}`);

  // --- Conversations ---
  console.log('--- Creating Conversation ---');
  const conv = await createConversation({
    userId: u1.id,
    status: 'active',
  });
  await createMessage({
    conversationId: conv.id,
    role: 'user',
    content: 'Hi, where is my order?',
  });
  await createMessage({
    conversationId: conv.id,
    role: 'assistant',
    content: 'I can help with that. Which order are you asking about?',
  });
  await createMessage({
    conversationId: conv.id,
    role: 'user',
    content: 'The most recent one for the headphones.',
  });
  specialCases.conversationId = conv.id;
  console.log(`Created Conversation: ${conv.id}`);

  console.log('\n================ SEED SUMMARY ================');
  console.log('--- Totals ---');
  console.log(`Users:   ${stats.users}`);
  console.log(`Orders:  ${stats.orders}`);
  console.log(`Payments:${stats.payments}`);
  console.log(`Returns: ${stats.returns}`);
  console.log(`Refunds: ${stats.refunds}`);
  console.log('\n--- Special Cases (Save these IDs) ---');
  console.log(JSON.stringify(specialCases, null, 2));
  console.log('==============================================\n');
}

seed().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
