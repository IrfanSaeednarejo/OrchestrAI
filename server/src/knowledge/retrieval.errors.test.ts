import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// This file isolates the REPOSITORY_ERROR path in retrieveKnowledge.
// It must be separate from retrieval.test.ts because a module-level vi.mock
// of the repository would prevent the real-DB tests from using the real impl.
// ---------------------------------------------------------------------------

vi.mock('../persistence/repositories/knowledge.repository.js', () => ({
  searchKnowledgeByEmbedding: vi.fn().mockRejectedValue(new Error('DB offline')),
  createKnowledgeDocument: vi.fn(),
}));

vi.mock('./embeddings-client.js', () => ({
  embedDocument: vi.fn(),
  embedQuery: vi.fn().mockResolvedValue(new Array(768).fill(0).map((_, i) => i / 768)),
}));

import { retrieveKnowledge } from './retrieval.js';

describe('retrieveKnowledge — REPOSITORY_ERROR path', () => {
  it('returns REPOSITORY_ERROR when searchKnowledgeByEmbedding rejects, and does not throw', async () => {
    const result = await retrieveKnowledge({ query: 'test', domains: ['orders'] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('REPOSITORY_ERROR');
  });
});
