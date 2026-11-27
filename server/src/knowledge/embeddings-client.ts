/**
 * server/src/knowledge/embeddings-client.ts
 * Gemini gemini-embedding-001 (768-dim) asymmetric embeddings with taskType,
 * batching, backoff, and strict driver-boundary assertValidEmbedding checks.
 *
 * CONSTRAINT CHANGE (2026-11-18): text-embedding-004 is NOT_FOUND for this
 * API credential. gemini-embedding-001 is the available successor at 768-dim.
 * See MIGRATION.md § Constraint Changes.
 */

import { GoogleGenAI } from '@google/genai';
import { config } from '../shared/config.js';
import fs from 'node:fs';

// Embedding call instrumentation — only active when LOG_EMBEDDING_CALLS=1
function logEmbedCall(type: 'document' | 'query' | 'batch', count: number): void {
  if (process.env.LOG_EMBEDDING_CALLS !== '1') return;
  fs.mkdirSync('logs', { recursive: true });
  fs.appendFileSync(
    'logs/embedding_calls.log',
    `${new Date().toISOString()} type=${type} count=${count}\n`
  );
}

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// Fixed model — do not make this configurable. See MIGRATION.md.
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

export function assertValidEmbedding(embedding: number[]): void {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`INVALID_EMBEDDING_DIMENSION: Expected ${EMBEDDING_DIMENSIONS} float dimensions, got ${embedding?.length}`);
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      throw new Error(`INVALID_EMBEDDING_VALUE: Non-finite float (NaN/Infinity) at index ${i}`);
    }
  }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 1000): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const errStatus = (err as { status?: number })?.status;
      const delay = errStatus === 429 ? 65_000 : baseDelayMs * Math.pow(2, attempt);
      const errCode = errStatus
        ?? (err as { code?: string })?.code
        ?? (err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60));
      console.error(`[retry] attempt=${attempt} delay=${delay}ms err=${errCode}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('RETRY_EXHAUSTED');
}

/**
 * Core embedding call. taskType must be 'RETRIEVAL_DOCUMENT' for ingest
 * and 'RETRIEVAL_QUERY' for query-time — gemini-embedding-001 is asymmetric.
 * Omitting or mismatching taskType silently degrades retrieval quality.
 */
async function embedWithTaskType(
  contents: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<number[]> {
  const response = await retryWithBackoff(async () => {
    return await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType,
      },
    });
  });

  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error('No embedding returned from Gemini API');
  }

  assertValidEmbedding(values);
  return values;
}

export async function embedDocument(text: string): Promise<number[]> {
  logEmbedCall('document', 1);
  return embedWithTaskType(text, 'RETRIEVAL_DOCUMENT');
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  logEmbedCall('batch', texts.length);

  // Pace requests at ~85 RPM (700ms interval) to stay under the Gemini Free Tier 100 RPM cap.
  const PACE_DELAY_MS = process.env.VITEST ? 0 : 700;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (text === undefined) continue;
    if (i > 0 && PACE_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, PACE_DELAY_MS));
    }
    results.push(await embedWithTaskType(text, 'RETRIEVAL_DOCUMENT'));
  }

  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  return embedWithTaskType(text, 'RETRIEVAL_QUERY');
}
