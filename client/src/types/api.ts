// src/types/api.ts
// Phase 17 Step 3: API data contracts matching backend Express schemas.

export type WorkflowStatus =
  | 'ACTIVE'
  | 'WAITING_FOR_USER_INPUT'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'ESCALATED'
  | 'FAILED';

export interface MessageMetadata {
  specialist?: string | null;
  workflowStatus?: WorkflowStatus | null;
  handoffCount?: number;
  blockedBy?: string | null;
  currentStep?: string | null;
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
