// src/lib/api-client.ts
// Phase 17 Step 3: Type-safe API client and strict SSE consumer.
// Phase 21: Added Bearer token support, auth API methods, and storefront endpoints.

import type {
  Conversation,
  Message,
  DemoUser,
  ConversationResponse,
  ConversationListResponse,
  MessageListResponse,
  DemoUsersResponse,
  DevVerificationCodeResponse,
  ApiErrorPayload,
  AuthUser,
  AuthResponse,
  AuthMeResponse,
  Product,
  ProductsResponse,
  Order,
  OrdersResponse,
  PlaceOrderResponse,
} from '../types/api';
import type {
  SSECallbacks,
  SSEStartEvent,
  SSENodeEvent,
  SSEMessageEvent,
  SSERoutingEvent,
  SSEDoneEvent,
  SSEErrorEvent,
} from '../types/sse';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, status = 500, code = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = `HTTP error ${res.status}`;
    let details: unknown = undefined;

    try {
      const data = (await res.json()) as ApiErrorPayload;
      if (data?.error) {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
        details = data.error.details;
      }
    } catch {
      // Body not JSON
    }

    throw new ApiClientError(errorMessage, res.status, errorCode, details);
  }

  return (await res.json()) as T;
}

export function getAuthHeaders(userId?: string, token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Priority 1: Bearer token for authenticated real users
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }
  // Priority 2: x-user-id if caller is not guest
  if (userId && userId !== '00000000-0000-4000-a000-000000000001') {
    headers['x-user-id'] = userId;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Auth Endpoints (Phase 21)
// ---------------------------------------------------------------------------

export async function apiRegister(data: {
  email: string;
  name: string;
  defaultAddress: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiLogin(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiLogout(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<{ success: boolean }>(res);
}

export async function apiMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await handleResponse<AuthMeResponse>(res);
  return data.user;
}

// ---------------------------------------------------------------------------
// Storefront Endpoints (Phase 21)
// ---------------------------------------------------------------------------

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE_URL}/api/products`);
  const data = await handleResponse<ProductsResponse>(res);
  return data.products;
}

export async function fetchUserOrders(token?: string | null, userId?: string): Promise<Order[]> {
  const res = await fetch(`${API_BASE_URL}/api/orders`, {
    headers: getAuthHeaders(userId, token),
  });
  const data = await handleResponse<OrdersResponse>(res);
  return data.orders;
}

export async function apiPlaceOrder(
  items: { productId: string; quantity: number }[],
  token?: string | null,
  userId?: string
): Promise<PlaceOrderResponse> {
  const res = await fetch(`${API_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: getAuthHeaders(userId, token),
    body: JSON.stringify({ items }),
  });
  return handleResponse<PlaceOrderResponse>(res);
}

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

export async function fetchDemoUsers(): Promise<DemoUser[]> {
  const res = await fetch(`${API_BASE_URL}/api/demo-users`);
  const data = await handleResponse<DemoUsersResponse>(res);
  return data.users;
}

export async function fetchConversations(
  userId: string,
  limit = 20,
  offset = 0,
  token?: string | null
): Promise<ConversationListResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/conversations?limit=${limit}&offset=${offset}`,
    {
      headers: getAuthHeaders(userId, token),
    }
  );
  return handleResponse<ConversationListResponse>(res);
}

export async function fetchConversation(
  conversationId: string,
  userId: string,
  token?: string | null
): Promise<Conversation> {
  const res = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    headers: getAuthHeaders(userId, token),
  });
  const data = await handleResponse<ConversationResponse>(res);
  return data.conversation;
}

export async function createConversation(
  userId: string,
  token?: string | null
): Promise<Conversation> {
  const res = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: getAuthHeaders(userId, token),
    body: JSON.stringify({}),
  });
  const data = await handleResponse<ConversationResponse>(res);
  return data.conversation;
}

export async function fetchMessages(
  conversationId: string,
  userId: string,
  token?: string | null
): Promise<Message[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
    {
      headers: getAuthHeaders(userId, token),
    }
  );
  const data = await handleResponse<MessageListResponse>(res);
  return data.messages;
}

export async function peekDevVerificationCode(userId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/dev/verification-code?userId=${encodeURIComponent(userId)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as DevVerificationCodeResponse;
    return data.code;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strict SSE Consumer
// ---------------------------------------------------------------------------

export async function streamMessage(
  conversationId: string,
  content: string,
  userId: string,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
  token?: string | null
): Promise<void> {
  const headers = getAuthHeaders(userId, token);
  headers['Accept'] = 'text/event-stream';

  const res = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ content }),
      signal,
    }
  );

  if (!res.ok) {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = `HTTP error ${res.status}`;
    try {
      const data = (await res.json()) as ApiErrorPayload;
      if (data?.error) {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiClientError(errorMessage, res.status, errorCode);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    throw new ApiClientError(
      'Invalid server response: expected text/event-stream Content-Type',
      res.status,
      'PROTOCOL_ERROR'
    );
  }

  if (!res.body) {
    throw new ApiClientError('Response body is missing', res.status, 'EMPTY_BODY');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Normalize line breaks to standard LF
      const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Split into complete SSE frames separated by double newline
      const parts = normalized.split('\n\n');

      // The last part may be incomplete; retain it in buffer
      buffer = parts.pop() || '';

      for (const frame of parts) {
        if (!frame.trim()) continue;

        let eventType = 'message';
        let dataStr = '';

        const lines = frame.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr = line.substring(5).trim();
          }
        }

        if (!dataStr) continue;

        try {
          const parsedData = JSON.parse(dataStr);

          switch (eventType) {
            case 'start':
              callbacks.onStart?.(parsedData as SSEStartEvent);
              break;
            case 'node':
              callbacks.onNode?.(parsedData as SSENodeEvent);
              break;
            case 'message':
              callbacks.onMessage?.(parsedData as SSEMessageEvent);
              break;
            case 'routing':
              callbacks.onRouting?.(parsedData as SSERoutingEvent);
              break;
            case 'done':
              callbacks.onDone?.(parsedData as SSEDoneEvent);
              break;
            case 'error':
              callbacks.onError?.(parsedData as SSEErrorEvent);
              throw new ApiClientError(
                (parsedData as SSEErrorEvent).message || 'Server-sent error event',
                500,
                'STREAM_ERROR'
              );
            default:
              // Unknown event type: ignore gracefully
              break;
          }
        } catch (jsonErr) {
          if (jsonErr instanceof ApiClientError) {
            throw jsonErr;
          }
          // Malformed JSON data in frame
          console.warn('Failed to parse SSE data JSON:', dataStr, jsonErr);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
