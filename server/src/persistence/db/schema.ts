import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  vector,
  doublePrecision,
  customType,
} from 'drizzle-orm/pg-core';

export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

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

export const reviewRequestStatusEnum = pgEnum('review_request_status', [
  'pending',
  'approved',
  'rejected',
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  defaultAddress: text('default_address').notNull(),
  // Nullable — seeded test users have no password; only real registered users do.
  passwordHash: text('password_hash'),
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
    deliveredAt: timestamp('delivered_at'),
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
  (table) => [uniqueIndex('returns_order_id_idx').on(table.orderId)],
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
    uniqueIndex('refunds_payment_id_idx')
      .on(table.paymentId)
      .where(sql`${table.status} != 'failed'`),
    index('refunds_return_id_idx').on(table.returnId),
  ],
);

export const reviewRequests = pgTable(
  'review_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orderId: uuid('order_id').references(() => orders.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    duplicatePaymentId: uuid('duplicate_payment_id').references(() => payments.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: reviewRequestStatusEnum('status').notNull().default('pending'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('review_requests_conversation_id_idx').on(table.conversationId),
    index('review_requests_user_id_idx').on(table.userId),
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
    routingPath: text('routing_path'),
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

export const retrievalExecutions = pgTable(
  'retrieval_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    agentExecutionId: uuid('agent_execution_id').references(() => agentExecutions.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    topic: text('topic'),
    embedMs: integer('embed_ms').notNull(),
    searchMs: integer('search_ms').notNull(),
    resultCount: integer('result_count').notNull(),
    topSimilarity: doublePrecision('top_similarity'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('retrieval_executions_conversation_id_idx').on(table.conversationId),
    index('retrieval_executions_agent_execution_id_idx').on(table.agentExecutionId),
  ],
);

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    node: text('node').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    durationMs: integer('duration_ms').notNull(),
    attempts: integer('attempts').notNull(),
    status: executionStatusEnum('status').notNull(),
    errorKind: text('error_kind'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('llm_calls_conversation_id_idx').on(table.conversationId),
    index('llm_calls_node_idx').on(table.node),
  ],
);

// ---------------------------------------------------------------------------
// Knowledge / RAG Domain
// ---------------------------------------------------------------------------

export const knowledgeDomainEnum = pgEnum('knowledge_domain', [
  'orders',
  'payments',
  'account',
]);
export type KnowledgeDomain = (typeof knowledgeDomainEnum.enumValues)[number];

// Deprecated legacy table retained for migration safety (dropped in follow-up PR)
export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: knowledgeDomainEnum('domain').notNull(),
    documentType: text('document_type').notNull(),
    topic: text('topic').notNull(),
    version: text('version').notNull(),
    effectiveDate: timestamp('effective_date').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('knowledge_documents_domain_idx').on(table.domain),
  ],
);

export const knowledgeDocStatusEnum = pgEnum('knowledge_doc_status', [
  'active',
  'superseded',
  'draft',
  'archived',
]);

// Part C.3: Document Lifecycle & Version Registry
export const knowledgeDocVersions = pgTable(
  'knowledge_doc_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: text('doc_id').notNull(),
    domain: knowledgeDomainEnum('domain').notNull(),
    topic: text('topic').notNull(),
    documentType: text('document_type').notNull(),
    version: text('version').notNull(),
    effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
    fileHash: text('file_hash').notNull(),
    status: knowledgeDocStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_doc_versions_doc_id_version_idx').on(table.docId, table.version),
    index('knowledge_doc_versions_domain_topic_status_idx').on(table.domain, table.topic, table.status),
  ],
);

// Part C.3: Searchable Document Chunks
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => knowledgeDocVersions.id, { onDelete: 'cascade' }),
    domain: knowledgeDomainEnum('domain').notNull(),
    topic: text('topic').notNull(),
    sectionPath: text('section_path').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    pageNumber: integer('page_number').notNull().default(0),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: vector('embedding', { dimensions: 768 }),
    searchVector: tsvector('search_vector'),
    status: knowledgeDocStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_chunks_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('idx_knowledge_chunks_search_vector_gin').using('gin', table.searchVector),
    index('idx_knowledge_chunks_scope_section').on(table.domain, table.topic, table.status, table.sectionPath),
  ],
);
