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
import { embedBatch, embedDocument, embedQuery } from './embeddings-client.js';

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

  // a. embedDocument passes raw text (taskType handles asymmetry, no prefix wrappers)
  it('embedDocument sends the raw text as contents', async () => {
    await embedDocument('hello world');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { contents: string } | undefined;
    expect(call?.contents).toBe('hello world');
  });

  // b. embedQuery passes raw text (taskType handles asymmetry, no prefix wrappers)
  it('embedQuery sends the raw text as contents', async () => {
    await embedQuery('hello world');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { contents: string } | undefined;
    expect(call?.contents).toBe('hello world');
  });

  // c. Asymmetry: same input text → different taskType values (not different content strings)
  it('embedDocument uses RETRIEVAL_DOCUMENT taskType and embedQuery uses RETRIEVAL_QUERY taskType', async () => {
    await embedDocument('same text');
    const docCall = mockEmbedContent.mock.calls[0]?.[0] as { config: Record<string, unknown> } | undefined;
    mockEmbedContent.mockClear();

    await embedQuery('same text');
    const queryCall = mockEmbedContent.mock.calls[0]?.[0] as { config: Record<string, unknown> } | undefined;

    expect(docCall?.config.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(queryCall?.config.taskType).toBe('RETRIEVAL_QUERY');
    expect(docCall?.config.taskType).not.toBe(queryCall?.config.taskType);
  });

  // d. outputDimensionality === 768 and correct taskType keys
  it('embedDocument sends config.outputDimensionality 768 and taskType RETRIEVAL_DOCUMENT', async () => {
    await embedDocument('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { config: Record<string, unknown> } | undefined;
    expect(call?.config.outputDimensionality).toBe(768);
    expect(call?.config.taskType).toBe('RETRIEVAL_DOCUMENT');
  });

  it('embedQuery sends config.outputDimensionality 768 and taskType RETRIEVAL_QUERY', async () => {
    await embedQuery('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { config: Record<string, unknown> } | undefined;
    expect(call?.config.outputDimensionality).toBe(768);
    expect(call?.config.taskType).toBe('RETRIEVAL_QUERY');
  });

  // e. Both use model 'gemini-embedding-001'
  it('embedDocument uses model gemini-embedding-001', async () => {
    await embedDocument('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { model: string } | undefined;
    expect(call?.model).toBe('gemini-embedding-001');
  });

  it('embedQuery uses model gemini-embedding-001', async () => {
    await embedQuery('test');
    const call = mockEmbedContent.mock.calls[0]?.[0] as { model: string } | undefined;
    expect(call?.model).toBe('gemini-embedding-001');
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

  // h. Retry policy split: embedQuery uses 2s/2 retries on 429; embedBatch uses 65s/3 retries on 429
  it('embedQuery retries once with 2000ms delay on 429 and throws on second 429', async () => {
    vi.useFakeTimers();
    const err429 = Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    mockEmbedContent.mockRejectedValue(err429);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = embedQuery('rate limited query').catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await promise;

    expect(err).toBe(err429);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2_000);

    setTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('embedBatch retries with 65000ms delay on 429 up to 3 attempts', async () => {
    vi.useFakeTimers();
    const err429 = Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    mockEmbedContent
      .mockRejectedValueOnce(err429)
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce(makeSuccessResponse());
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = embedBatch(['chunk 1']);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([mockValues]);
    expect(mockEmbedContent).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 65_000);

    setTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
