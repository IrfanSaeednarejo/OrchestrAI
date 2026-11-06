// src/lib/ops-client.ts
// Phase 18 Step 2: API client for Platform/Ops UI and observability endpoints.

import type {
  OpsConversationListResponse,
  OpsTraceResponse,
  OpsEvalResponse,
  BenchmarkReport,
} from '../types/ops';
import { ApiClientError } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function handleOpsResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorCode = 'OPS_API_ERROR';
    let errorMessage = `HTTP error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiClientError(errorMessage, res.status, errorCode);
  }
  return res.json() as Promise<T>;
}

export async function fetchOpsConversations(
  limit = 50,
  offset = 0
): Promise<OpsConversationListResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/ops/conversations?limit=${limit}&offset=${offset}`
  );
  return handleOpsResponse<OpsConversationListResponse>(res);
}

export async function fetchOpsTrace(conversationId: string): Promise<OpsTraceResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/ops/conversations/${encodeURIComponent(conversationId)}/traces`
  );
  return handleOpsResponse<OpsTraceResponse>(res);
}

export async function fetchOpsEvalResults(): Promise<BenchmarkReport> {
  const res = await fetch(`${API_BASE_URL}/api/ops/eval-results`);
  const data = await handleOpsResponse<OpsEvalResponse>(res);
  return data.report;
}
