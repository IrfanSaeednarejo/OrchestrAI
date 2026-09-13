import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
]);

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'pending',
  'in_transit',
  'delivered',
  'returned_to_sender',
]);

export const returnStatusEnum = pgEnum('return_status', [
  'requested',
  'approved',
  'rejected',
  'in_transit',
  'received',
  'completed',
]);

export const refundStatusEnum = pgEnum('refund_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  defaultAddress: text('default_address').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  sku: text('sku').notNull().unique(),
});

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: orderStatusEnum('status').notNull().default('pending'),
    // Copied value at order-time — never derived from users at read time.
    shippingAddressSnapshot: text('shipping_address_snapshot').notNull(),
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('orders_user_id_idx').on(table.userId)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    // Snapshot of Product.price at order-time — never derived from products.
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [index('order_items_order_id_idx').on(table.orderId)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Unique constraint enforces the v1 rule: exactly one Payment per Order.
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),
    method: text('method').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  }
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    status: shipmentStatusEnum('status').notNull().default('pending'),
    trackingNumber: text('tracking_number'),
    estimatedDelivery: timestamp('estimated_delivery'),
    carrier: text('carrier'),
  },
  (table) => [index('shipments_order_id_idx').on(table.orderId)],
);

export const returns = pgTable(
  'returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    status: returnStatusEnum('status').notNull().default('requested'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('returns_order_id_idx').on(table.orderId)],
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    // Nullable: duplicate-charge refunds (no Return involved) are a valid scenario.
    returnId: uuid('return_id').references(() => returns.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: refundStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('refunds_payment_id_idx').on(table.paymentId),
    index('refunds_return_id_idx').on(table.returnId),
  ],
);

// ---------------------------------------------------------------------------
// Conversation Domain
// ---------------------------------------------------------------------------

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'system',
  'tool',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'completed',
]);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: conversationStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('conversations_user_id_idx').on(table.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  (table) => [index('messages_conversation_id_idx').on(table.conversationId)],
);

// ---------------------------------------------------------------------------
// Orchestration / Observability Domain
// ---------------------------------------------------------------------------

export const routingDecisionTypeEnum = pgEnum('routing_decision_type', [
  'INITIAL_ROUTE',
  'RE_ROUTE',
  'HANDOFF',
  'ESCALATION',
  'FALLBACK',
]);

export const executionStatusEnum = pgEnum('execution_status', [
  'success',
  'failure',
]);

export const routingHistory = pgTable(
  'routing_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    sourceAgent: text('source_agent'),
    destinationAgent: text('destination_agent').notNull(),
    intent: text('intent'),
    decisionType: routingDecisionTypeEnum('decision_type').notNull(),
    reason: text('reason').notNull(),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => [
    index('routing_history_conversation_id_idx').on(table.conversationId),
  ],
);

export const agentExecutions = pgTable(
  'agent_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    agent: text('agent').notNull(),
    inputSummary: text('input_summary'),
    outputSummary: text('output_summary'),
    duration: integer('duration'),
    status: executionStatusEnum('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('agent_executions_conversation_id_idx').on(table.conversationId),
  ],
);

export const toolExecutions = pgTable(
  'tool_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentExecutionId: uuid('agent_execution_id')
      .notNull()
      .references(() => agentExecutions.id),
    tool: text('tool').notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    duration: integer('duration'),
    status: executionStatusEnum('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('tool_executions_agent_execution_id_idx').on(table.agentExecutionId),
  ],
);
