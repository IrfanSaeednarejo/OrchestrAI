import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../persistence/db/client.js';
import { knowledgeDocuments, users, conversations, agentExecutions, toolExecutions } from '../../persistence/db/schema.js';
import { inArray, like, eq, desc } from 'drizzle-orm';
import { createKnowledgeDocument } from '../../persistence/repositories/knowledge.repository.js';
import { searchKnowledge, searchKnowledgeMetadata, MIN_SIMILARITY, SearchKnowledgeInputSchema } from './knowledge.tools.js';
import { executeTool } from '../execution.js';
import { createAgentExecution } from '../../persistence/repositories/orchestration.repository.js';

// ---------------------------------------------------------------------------
// Mock embeddings-client — embedQuery is a controllable vi.fn
// ---------------------------------------------------------------------------

vi.mock('../../knowledge/embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn(),
}));

import { embedQuery } from '../../knowledge/embeddings-client.js';
const mockedEmbedQuery = embedQuery as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

function unitVec(index: number): number[] {
  const v = new Array(768).fill(0);
  v[index] = 1;
  return v;
}

function docVec(s: number, k: number): number[] {
  const v = new Array(768).fill(0);
  v[0] = s;
  v[k] = Math.sqrt(1 - s * s);
  return v;
}

// ---------------------------------------------------------------------------
// Fixtures — distinct prefix '__test_tool__' to avoid collision with retrieval.test.ts
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

let idHigh: string;  // sim ~0.95 — above threshold
let idMid: string;   // sim ~0.75 — above threshold
let idLow: string;   // sim ~0.45 — below MIN_SIMILARITY
let idPayments: string; // payments domain, high sim

// executeTool fixture
let testUserId: string;
let testConversationId: string;
let testAgentExecutionId: string;

beforeAll(async () => {
  // Clean leftover test rows from prior runs
  await db.delete(knowledgeDocuments).where(like(knowledgeDocuments.topic, '__test_tool__%'));

  const docHigh = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: '__test_tool__high',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'tool test content high',
    embedding: docVec(0.95, 10),
  });
  idHigh = docHigh.id;

  const docMid = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: '__test_tool__mid',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'tool test content mid',
    embedding: docVec(0.75, 11),
  });
  idMid = docMid.id;

  const docLow = await createKnowledgeDocument({
    domain: 'orders',
    documentType: 'policy',
    topic: '__test_tool__low',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'tool test content low',
    embedding: docVec(0.45, 12),
  });
  idLow = docLow.id;

  const docPay = await createKnowledgeDocument({
    domain: 'payments',
    documentType: 'policy',
    topic: '__test_tool__payments',
    version: '1.0',
    effectiveDate: FIXED_DATE,
    content: 'tool test content payments',
    embedding: docVec(0.95, 13),
  });
  idPayments = docPay.id;

  // executeTool fixture
  const uResult = await db.insert(users).values({
    name: 'KnowledgeTool Test User',
    email: `knowledge-tool-${Date.now()}@example.com`,
    defaultAddress: 'KT St',
  }).returning();
  if (!uResult[0]) throw new Error('Failed to create test user');
  testUserId = uResult[0].id;

  const cResult = await db.insert(conversations).values({
    userId: testUserId,
    status: 'active',
  }).returning();
  if (!cResult[0]) throw new Error('Failed to create test conversation');
  testConversationId = cResult[0].id;

  const exec = await createAgentExecution({
    conversationId: testConversationId,
    agent: 'test_knowledge_agent',
    status: 'success',
  });
  testAgentExecutionId = exec.id;
});

afterAll(async () => {
  await db.delete(knowledgeDocuments).where(
    inArray(knowledgeDocuments.id, [idHigh, idMid, idLow, idPayments])
  );
  await db.delete(knowledgeDocuments).where(like(knowledgeDocuments.topic, '__test_tool__%'));

  await db.delete(toolExecutions).where(eq(toolExecutions.agentExecutionId, testAgentExecutionId));
  await db.delete(agentExecutions).where(eq(agentExecutions.id, testAgentExecutionId));
  await db.delete(conversations).where(eq(conversations.id, testConversationId));
  await db.delete(users).where(eq(users.id, testUserId));
});

beforeEach(() => {
  mockedEmbedQuery.mockResolvedValue(unitVec(0));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchKnowledge', () => {
  // a. Hits above MIN_SIMILARITY are returned, and include the 0.95 fixture
  it('a. returns only hits with similarity >= MIN_SIMILARITY (includes 0.95 fixture)', async () => {
    const result = await searchKnowledge({ query: 'test', domains: ['orders'], topK: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ids = result.data.map(h => h.id);
    expect(ids).toContain(idHigh);
    for (const hit of result.data) {
      expect(hit.similarity).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    }
  });

  // b. 0.45 fixture is never returned (threshold enforced server-side)
  it('b. the 0.45-similarity fixture is never returned', async () => {
    const result = await searchKnowledge({ query: 'test', domains: ['orders'], topK: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map(h => h.id)).not.toContain(idLow);
  });

  // c. topK default is 3 via schema default
  it('c. topK defaults to 3 via schema parse', () => {
    const parsed = SearchKnowledgeInputSchema.safeParse({ query: 'x', domains: ['orders'] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.topK).toBe(3);
    }
  });

  // d. Extra minSimilarity in raw input is stripped by zod; 0.45 fixture still absent
  it('d. extra minSimilarity: -1 in raw input is stripped (zod), 0.45 fixture still absent', async () => {
    const result = await searchKnowledge({ query: 'test', domains: ['orders'], topK: 5, minSimilarity: -1 } as unknown);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map(h => h.id)).not.toContain(idLow);
  });

  // e. Orthogonal query -> success true, data [] (for fixture ids at least)
  it('e. orthogonal query (unitVec(500)) returns no fixture hits', async () => {
    mockedEmbedQuery.mockResolvedValueOnce(unitVec(500));
    const result = await searchKnowledge({ query: 'test', domains: ['orders'], topK: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const ids = result.data.map(h => h.id);
    expect(ids).not.toContain(idHigh);
    expect(ids).not.toContain(idMid);
    expect(ids).not.toContain(idLow);
  });

  // f. Bad inputs -> INVALID_INPUT
  it('f-1. empty query -> INVALID_INPUT', async () => {
    const result = await searchKnowledge({ query: '', domains: ['orders'] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('f-2. empty domains -> INVALID_INPUT', async () => {
    const result = await searchKnowledge({ query: 'test', domains: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  it('f-3. unknown domain -> INVALID_INPUT', async () => {
    const result = await searchKnowledge({ query: 'test', domains: ['profile'] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_INPUT');
  });

  // g. Metadata
  it('g. searchKnowledgeMetadata has name search_knowledge and requiredVerification NONE', () => {
    expect(searchKnowledgeMetadata.name).toBe('search_knowledge');
    expect(searchKnowledgeMetadata.requiredVerification).toBe('NONE');
  });

  // h. executeTool integration
  it('h. executeTool integration: writes a tool_executions row with status success', async () => {
    const result = await executeTool(
      searchKnowledge,
      searchKnowledgeMetadata,
      { query: 'test', domains: ['orders'], topK: 3 },
      { agentExecutionId: testAgentExecutionId }
    );

    expect(result.success).toBe(true);

    // Verify DB row
    const rows = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.agentExecutionId, testAgentExecutionId))
      .orderBy(desc(toolExecutions.createdAt))
      .limit(1);

    const logRow = rows[0];
    expect(logRow).toBeDefined();
    expect(logRow?.tool).toBe('search_knowledge');
    expect(logRow?.status).toBe('success');
    expect(logRow?.duration).not.toBeNull();

    // Report: what is stored in the output jsonb column?
    // The output column contains the full result.data array — an array of KnowledgeHit objects.
    // Each object includes: id, domain, documentType, topic, version, content (full text), similarity.
    // content IS stored in full — this is intentional (hits are meant for the LLM to consume).
    // No redaction applies: searchKnowledgeMetadata has no sensitiveOutputFields defined,
    // so executeTool's redact() is a no-op and the output is stored verbatim.
    expect(Array.isArray(logRow?.output)).toBe(true);
  });
});
