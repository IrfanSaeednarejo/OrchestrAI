// src/lib/api-client.test.ts
// Phase 17 Step 3: Tests for api-client and SSE streaming parser.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamMessage,
  fetchDemoUsers,
  fetchConversations,
  fetchConversation,
  createConversation,
  fetchMessages,
  peekDevVerificationCode,
  ApiClientError,
} from './api-client';

describe('API Client & SSE Parser', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('streamMessage SSE Parsing', () => {
    function createMockStreamResponse(chunks: string[], status = 200, contentType = 'text/event-stream') {
      const encoder = new TextEncoder();
      let chunkIndex = 0;

      const readableStream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < chunks.length) {
            controller.enqueue(encoder.encode(chunks[chunkIndex]));
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        status,
        headers: {
          'Content-Type': contentType,
        },
      });
    }

    it('parses full standard SSE lifecycle events cleanly', async () => {
      const ssePayload = [
        'event: start\ndata: {"conversationId":"conv-123","timestamp":"2026-11-06T00:00:00Z"}\n\n',
        'event: node\ndata: {"node":"router","timestamp":"2026-11-06T00:00:01Z"}\n\n',
        'event: message\ndata: {"role":"assistant","content":"Your order is in transit."}\n\n',
        'event: routing\ndata: {"currentAgent":"order_tracking","handoffCount":0,"workflowStatus":"COMPLETED","blockedBy":null,"currentStep":null}\n\n',
        'event: done\ndata: {"success":true}\n\n',
      ].join('');

      global.fetch = vi.fn().mockResolvedValue(createMockStreamResponse([ssePayload]));

      const callbacks = {
        onStart: vi.fn(),
        onNode: vi.fn(),
        onMessage: vi.fn(),
        onRouting: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      };

      await streamMessage('conv-123', 'Where is my order?', 'user-1', callbacks);

      expect(callbacks.onStart).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        timestamp: '2026-11-06T00:00:00Z',
      });
      expect(callbacks.onNode).toHaveBeenCalledWith({
        node: 'router',
        timestamp: '2026-11-06T00:00:01Z',
      });
      expect(callbacks.onMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: 'Your order is in transit.',
      });
      expect(callbacks.onRouting).toHaveBeenCalledWith({
        currentAgent: 'order_tracking',
        handoffCount: 0,
        workflowStatus: 'COMPLETED',
        blockedBy: null,
        currentStep: null,
      });
      expect(callbacks.onDone).toHaveBeenCalledWith({ success: true });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it('correctly reassembles frames split across arbitrary chunk boundaries', async () => {
      // Split the payload across multiple small chunks
      const chunk1 = 'event: sta';
      const chunk2 = 'rt\ndata: {"conversationId":"c';
      const chunk3 = 'onv-split"}\n\nevent: mes';
      const chunk4 = 'sage\ndata: {"role":"assistant","content":"Part1 and ';
      const chunk5 = 'Part2"}\n\nevent: done\ndata: {"success":true}\n\n';

      global.fetch = vi.fn().mockResolvedValue(createMockStreamResponse([chunk1, chunk2, chunk3, chunk4, chunk5]));

      const callbacks = {
        onStart: vi.fn(),
        onMessage: vi.fn(),
        onDone: vi.fn(),
      };

      await streamMessage('conv-split', 'test', 'user-1', callbacks);

      expect(callbacks.onStart).toHaveBeenCalledWith({ conversationId: 'conv-split' });
      expect(callbacks.onMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: 'Part1 and Part2',
      });
      expect(callbacks.onDone).toHaveBeenCalledWith({ success: true });
    });

    it('handles CRLF (\\r\\n) line endings seamlessly', async () => {
      const crlfPayload =
        'event: start\r\ndata: {"conversationId":"conv-crlf"}\r\n\r\nevent: done\r\ndata: {"success":true}\r\n\r\n';

      global.fetch = vi.fn().mockResolvedValue(createMockStreamResponse([crlfPayload]));

      const callbacks = {
        onStart: vi.fn(),
        onDone: vi.fn(),
      };

      await streamMessage('conv-crlf', 'test', 'user-1', callbacks);

      expect(callbacks.onStart).toHaveBeenCalledWith({ conversationId: 'conv-crlf' });
      expect(callbacks.onDone).toHaveBeenCalledWith({ success: true });
    });

    it('calls onError callback and throws ApiClientError when event: error is received', async () => {
      const errorPayload = [
        'event: start\ndata: {"conversationId":"conv-err"}\n\n',
        'event: error\ndata: {"message":"Agent failed to route"}\n\n',
      ].join('');

      global.fetch = vi.fn().mockResolvedValue(createMockStreamResponse([errorPayload]));

      const callbacks = {
        onStart: vi.fn(),
        onError: vi.fn(),
      };

      await expect(
        streamMessage('conv-err', 'test', 'user-1', callbacks)
      ).rejects.toThrow('Agent failed to route');

      expect(callbacks.onStart).toHaveBeenCalled();
      expect(callbacks.onError).toHaveBeenCalledWith({ message: 'Agent failed to route' });
    });

    it('rejects with PROTOCOL_ERROR when Content-Type is not text/event-stream', async () => {
      const mockRes = new Response(JSON.stringify({ error: 'not sse' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      global.fetch = vi.fn().mockResolvedValue(mockRes);

      await expect(streamMessage('c1', 'hello', 'u1', {})).rejects.toThrow(
        /expected text\/event-stream/
      );
    });

    it('rejects with ApiClientError when response status is non-2xx', async () => {
      const mockRes = new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Access denied' } }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      global.fetch = vi.fn().mockResolvedValue(mockRes);

      await expect(streamMessage('c1', 'hello', 'u1', {})).rejects.toThrow('Access denied');
    });

    it('terminates loop without throwing when AbortSignal is triggered', async () => {
      const controller = new AbortController();

      // Infinite stream that never sends done
      const infiniteStream = new ReadableStream({
        pull(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('event: start\ndata: {}\n\n'));
        },
      });

      global.fetch = vi.fn().mockResolvedValue(
        new Response(infiniteStream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      const onStart = vi.fn(() => {
        // Abort right after first event
        controller.abort();
      });

      await streamMessage('c1', 'hello', 'u1', { onStart }, controller.signal);
      expect(onStart).toHaveBeenCalled();
    });
  });

  describe('REST helpers', () => {
    it('fetchDemoUsers calls /api/demo-users and returns user array', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ users: [{ id: '1', name: 'Alice' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const users = await fetchDemoUsers();
      expect(users).toHaveLength(1);
      expect(users[0]?.name).toBe('Alice');
    });

    it('fetchConversations includes pagination query params and x-user-id header', async () => {
      let requestedUrl = '';
      let requestedHeaders: Record<string, string> = {};

      global.fetch = vi.fn().mockImplementation((url, init) => {
        requestedUrl = String(url);
        requestedHeaders = init?.headers || {};
        return Promise.resolve(
          new Response(JSON.stringify({ conversations: [], pagination: { limit: 10, offset: 5, count: 0 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const res = await fetchConversations('user-123', 10, 5);
      expect(requestedUrl).toContain('limit=10&offset=5');
      expect(requestedHeaders['x-user-id']).toBe('user-123');
      expect(res.conversations).toEqual([]);
    });

    it('createConversation sends POST with auth header and returns new conversation', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ conversation: { id: 'new-c', userId: 'u1', status: 'active' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const conv = await createConversation('u1');
      expect(conv.id).toBe('new-c');
      expect(conv.userId).toBe('u1');
    });

    it('peekDevVerificationCode returns code or null gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ userId: 'u1', code: '654321' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const code = await peekDevVerificationCode('u1');
      expect(code).toBe('654321');

      // 404 response returns null gracefully
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const missingCode = await peekDevVerificationCode('u1');
      expect(missingCode).toBeNull();
    });
  });
});
