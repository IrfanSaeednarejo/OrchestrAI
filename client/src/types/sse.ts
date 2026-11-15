// src/types/sse.ts
// Phase 17 Step 3: SSE event contracts matching message.controller.ts streaming events.
// Phase 23: Added optional `options` to SSERoutingEvent for interactive service menu.

import type { WorkflowStatus, ServiceOption } from './api';

export interface SSEStartEvent {
  conversationId: string;
  timestamp: string;
}

export interface SSENodeEvent {
  node: string;
  timestamp: string;
}

export interface SSEMessageEvent {
  role: 'assistant';
  content: string;
}

export interface SSERoutingEvent {
  currentAgent: string | null;
  handoffCount: number;
  workflowStatus: WorkflowStatus | null;
  blockedBy?: string | null;
  currentStep?: string | null;
  options?: ServiceOption[] | null;
}

export interface SSEDoneEvent {
  success: boolean;
}

export interface SSEErrorEvent {
  message: string;
}

export type SSEEventPayload =
  | { type: 'start'; data: SSEStartEvent }
  | { type: 'node'; data: SSENodeEvent }
  | { type: 'message'; data: SSEMessageEvent }
  | { type: 'routing'; data: SSERoutingEvent }
  | { type: 'done'; data: SSEDoneEvent }
  | { type: 'error'; data: SSEErrorEvent };

export interface SSECallbacks {
  onStart?: (data: SSEStartEvent) => void;
  onNode?: (data: SSENodeEvent) => void;
  onMessage?: (data: SSEMessageEvent) => void;
  onRouting?: (data: SSERoutingEvent) => void;
  onDone?: (data: SSEDoneEvent) => void;
  onError?: (data: SSEErrorEvent) => void;
}

