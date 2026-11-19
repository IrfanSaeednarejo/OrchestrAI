import { describe, it, expect } from 'vitest';
import { chunkDocument } from './chunker.js';
import { ParsedPdfDocument } from './pdf-parser.js';

describe('chunkDocument', () => {
  const sampleDoc: ParsedPdfDocument = {
    metadata: {
      docId: 'pol-orders-returns-001',
      domain: 'orders',
      topic: 'returns',
      documentType: 'policy',
      version: '1.0.0',
      effectiveDate: new Date('2026-01-01T00:00:00Z'),
    },
    sections: [
      {
        heading: 'Return Window',
        level: 2,
        sectionPath: 'Customer Return Policy > Return Window',
        paragraphs: [
          'Items may be returned within 30 days of delivery for a full refund.',
          'Items must be unworn, unwashed, and in original packaging with tags intact.',
          'Special promotional items are non-returnable unless defective upon arrival.',
        ],
      },
    ],
  };

  it('generates breadcrumb headers containing domain, topic, section path and version', () => {
    const chunks = chunkDocument(sampleDoc, { targetTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain(
      '[Policy: orders > returns | Section: Customer Return Policy > Return Window | v1.0.0]'
    );
    expect(chunks[0]?.content).toContain('Items may be returned within 30 days');
  });

  it('computes a consistent sha256 hash for identical chunk content', () => {
    const chunks1 = chunkDocument(sampleDoc);
    const chunks2 = chunkDocument(sampleDoc);
    expect(chunks1[0]?.contentHash).toBe(chunks2[0]?.contentHash);
    expect(chunks1[0]?.contentHash).toHaveLength(64);
  });

  it('preserves sectionPath on the generated chunks', () => {
    const chunks = chunkDocument(sampleDoc);
    expect(chunks[0]?.sectionPath).toBe('Customer Return Policy > Return Window');
  });
});
