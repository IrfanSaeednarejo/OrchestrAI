import { db } from '../db/client.js';
import { eq, desc } from 'drizzle-orm';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  users,
  products,
  orders,
  orderItems,
  payments,
  shipments,
  returns,
  refunds,
} from '../db/schema.js';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Product = InferSelectModel<typeof products>;
export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type NewOrderItem = InferInsertModel<typeof orderItems>;
export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;
export type Shipment = InferSelectModel<typeof shipments>;
export type NewShipment = InferInsertModel<typeof shipments>;
export type Return = InferSelectModel<typeof returns>;
export type NewReturn = InferInsertModel<typeof returns>;
export type Refund = InferSelectModel<typeof refunds>;
export type NewRefund = InferInsertModel<typeof refunds>;

export async function getUserById(id: string): Promise<User | undefined> {
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const result = await db.select().from(users).where(eq(users.email, email));
  return result[0];
}

export async function createUser(input: NewUser): Promise<User> {
  const result = await db.insert(users).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const result = await db.select().from(products).where(eq(products.id, id));
  return result[0];
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const result = await db.select().from(orders).where(eq(orders.id, id));
  return result[0];
}

export async function getOrdersByUserId(userId: string): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
}

export async function createOrder(input: NewOrder): Promise<Order> {
  const result = await db.insert(orders).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function updateOrderStatus(
  id: string,
  status: Order['status']
): Promise<Order | undefined> {
  const result = await db
    .update(orders)
    .set({ status })
    .where(eq(orders.id, id))
    .returning();
  return result[0];
}

export async function getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function createOrderItem(input: NewOrderItem): Promise<OrderItem> {
  const result = await db.insert(orderItems).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
  const result = await db.select().from(payments).where(eq(payments.orderId, orderId));
  return result[0];
}

export async function createPayment(input: NewPayment): Promise<Payment> {
  const result = await db.insert(payments).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function updatePaymentStatus(
  id: string,
  status: Payment['status']
): Promise<Payment | undefined> {
  const result = await db
    .update(payments)
    .set({ status })
    .where(eq(payments.id, id))
    .returning();
  return result[0];
}

export async function getShipmentByOrderId(orderId: string): Promise<Shipment | undefined> {
  const result = await db.select().from(shipments).where(eq(shipments.orderId, orderId));
  return result[0];
}

export async function createShipment(input: NewShipment): Promise<Shipment> {
  const result = await db.insert(shipments).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function getReturnById(id: string): Promise<Return | undefined> {
  const result = await db.select().from(returns).where(eq(returns.id, id));
  return result[0];
}

export async function getReturnsByOrderId(orderId: string): Promise<Return[]> {
  return db.select().from(returns).where(eq(returns.orderId, orderId));
}

export async function createReturn(input: NewReturn): Promise<Return> {
  const result = await db.insert(returns).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function updateReturnStatus(
  id: string,
  status: Return['status']
): Promise<Return | undefined> {
  const result = await db
    .update(returns)
    .set({ status })
    .where(eq(returns.id, id))
    .returning();
  return result[0];
}

export async function getRefundById(id: string): Promise<Refund | undefined> {
  const result = await db.select().from(refunds).where(eq(refunds.id, id));
  return result[0];
}

export async function getRefundsByPaymentId(paymentId: string): Promise<Refund[]> {
  return db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
}

export async function getRefundsByReturnId(returnId: string): Promise<Refund[]> {
  return db.select().from(refunds).where(eq(refunds.returnId, returnId));
}

export async function createRefund(input: NewRefund): Promise<Refund> {
  const result = await db.insert(refunds).values(input).returning();
  if (!result[0]) throw new Error('Failed to create record'); return result[0];
}

export async function updateRefundStatus(
  id: string,
  status: Refund['status']
): Promise<Refund | undefined> {
  const result = await db
    .update(refunds)
    .set({ status })
    .where(eq(refunds.id, id))
    .returning();
  return result[0];
}
