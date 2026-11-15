// src/types/api.ts
// Phase 17 Step 3: API data contracts matching backend Express schemas.
// Phase 21: Added AuthUser, AuthResponse, Product, Order, and Storefront types.
// Phase 23: Added ServiceOption for interactive service menu buttons.

export type WorkflowStatus =
  | 'ACTIVE'
  | 'WAITING_FOR_USER_INPUT'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'ESCALATED'
  | 'FAILED';

/** A single interactive service-menu option returned by the greeting response. */
export interface ServiceOption {
  label: string;
  message: string;
}

export interface MessageMetadata {
  specialist?: string | null;
  workflowStatus?: WorkflowStatus | null;
  handoffCount?: number;
  blockedBy?: string | null;
  currentStep?: string | null;
  options?: ServiceOption[] | null;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO 8601 string from Postgres timestamp column
  metadata?: MessageMetadata | null;
}

export interface Conversation {
  id: string;
  userId: string;
  status: 'active' | 'archived' | 'escalated';
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  limit: number;
  offset: number;
  count: number;
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  scenario: string;
  isGuest: boolean;
}

// Phase 21: Real user authentication types
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  defaultAddress: string;
  createdAt?: string;
  isGuest?: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthMeResponse {
  user: AuthUser;
}

// Phase 21: Storefront and orders types
export interface Product {
  id: string;
  name: string;
  price: string;
  sku: string;
}

export interface ProductsResponse {
  products: Product[];
}

export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  shippingAddressSnapshot: string;
  totalAmount: string;
  createdAt: string;
}

export interface OrdersResponse {
  orders: Order[];
}

export interface PlaceOrderResponse {
  order: Order;
  trackingNumber: string;
}

// Wrapped response contracts
export interface ConversationResponse {
  conversation: Conversation;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  pagination: Pagination;
}

export interface MessageListResponse {
  conversationId: string;
  messages: Message[];
}

export interface DemoUsersResponse {
  users: DemoUser[];
}

export interface DevVerificationCodeResponse {
  userId: string;
  code: string | null;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
