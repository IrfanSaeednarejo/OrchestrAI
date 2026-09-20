import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @google/genai BEFORE any import of the module under test.
// vi.hoisted ensures the factory runs before ES module hoisting.
// ---------------------------------------------------------------------------

const mockValues = Array.from({ length: 768 }, (_, i) => i / 768);

const mockEmbedContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        embedContent: mockEmbedContent,
      };
    },
  };
});

// Import AFTER mock is established
import { embedDocument, embedQuery } from './embeddings-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(values = mockValues) {
  return { embeddings: [{ values }] };
}

describe('embeddings-client', () => {
  beforeEach(() => {
    mockEmbedContent.mockClear();
    mockEmbedContent.mockResolvedValue(makeSuccessResponse());
  });

  // a. embedDocument prefix
  it('embedDocument sends contents with the correct document prefix', async () => {
    await embedDocument('hello world');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { contents: string } | undefined;
    expect(call?.contents).toBe('title: none | text: hello world');
  });

  // b. embedQuery prefix
  it('embedQuery sends contents with the correct query prefix', async () => {
    await embedQuery('hello world');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { contents: string } | undefined;
    expect(call?.contents).toBe('task: search result | query: hello world');
  });

  // c. Asymmetry: same input → different contents strings
  it('embedDocument and embedQuery produce different contents strings for the same input', async () => {
    await embedDocument('same text');
    const docCall = mockEmbedContent.mock.calls[0]?.[0] as { contents: string } | undefined;
    mockEmbedContent.mockClear();

    await embedQuery('same text');
    const queryCall = mockEmbedContent.mock.calls[0]?.[0] as { contents: string } | undefined;

    expect(docCall?.contents).not.toBe(queryCall?.contents);
  });

  // d. outputDimensionality === 768 and NO taskType key
  it('embedDocument sends config.outputDimensionality 768 and no taskType', async () => {
    await embedDocument('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { config: Record<string, unknown> } | undefined;
    expect(call?.config.outputDimensionality).toBe(768);
    expect(Object.prototype.hasOwnProperty.call(call?.config, 'taskType')).toBe(false);
  });

  it('embedQuery sends config.outputDimensionality 768 and no taskType', async () => {
    await embedQuery('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { config: Record<string, unknown> } | undefined;
    expect(call?.config.outputDimensionality).toBe(768);
    expect(Object.prototype.hasOwnProperty.call(call?.config, 'taskType')).toBe(false);
  });

  // e. Both use model 'gemini-embedding-2'
  it('embedDocument uses model gemini-embedding-2', async () => {
    await embedDocument('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { model: string } | undefined;
    expect(call?.model).toBe('gemini-embedding-2');
  });

  it('embedQuery uses model gemini-embedding-2', async () => {
    await embedQuery('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { model: string } | undefined;
    expect(call?.model).toBe('gemini-embedding-2');
  });

  // f. Both throw when response has no embeddings/values
  it('embedDocument throws when response has no embeddings', async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });
    await expect(embedDocument('test')).rejects.toThrow();
  });

  it('embedDocument throws when embeddings[0] has no values', async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{}] });
    await expect(embedDocument('test')).rejects.toThrow();
  });

  it('embedQuery throws when response has no embeddings', async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });
    await expect(embedQuery('test')).rejects.toThrow();
  });

  it('embedQuery throws when embeddings[0] has no values', async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{}] });
    await expect(embedQuery('test')).rejects.toThrow();
  });

  // g. Returned array is the mocked values, unmodified
  it('embedDocument returns the values array unmodified', async () => {
    const result = await embedDocument('test');
    expect(result).toEqual(mockValues);
    expect(result).toHaveLength(768);
  });

  it('embedQuery returns the values array unmodified', async () => {
    const result = await embedQuery('test');
    expect(result).toEqual(mockValues);
    expect(result).toHaveLength(768);
  });
});
