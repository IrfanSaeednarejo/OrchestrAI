import { describe, it, expect } from 'vitest';
import {
  chunkDocument,
  splitIntoSentences,
  splitIntoSentencesWithSeparators,
} from './chunker.js';
import { ParsedPdfDocument } from './pdf-parser.js';

function assertVerbatimRoundTrip(input: string): void {
  const segments = splitIntoSentencesWithSeparators(input);
  const reconstructed = segments.map((s) => s.sentence + s.separator).join('');
  expect(reconstructed).toBe(input);
}

describe('splitIntoSentences (adversarial)', () => {
  it('preserves decimal numbers mid-sentence without fragment loss', () => {
    const input = 'Orders over USD 25.50 require approval. Standard shipping applies.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'Orders over USD 25.50 require approval.',
      'Standard shipping applies.',
    ]);
  });

  it('preserves two-part version numbers mid-sentence', () => {
    const input = 'Please see section 3.2 for details. Contact support if needed.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'Please see section 3.2 for details.',
      'Contact support if needed.',
    ]);
  });

  it('preserves abbreviations like No. 5 without splitting', () => {
    const input = 'No. 5 is excluded from discounts. All other items qualify.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'No. 5 is excluded from discounts.',
      'All other items qualify.',
    ]);
  });

  it('preserves e.g. and i.e. abbreviations without splitting', () => {
    const input = 'Digital goods, e.g. these items, are final sale. Refunds apply, i.e. that case only.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'Digital goods, e.g. these items, are final sale.',
      'Refunds apply, i.e. that case only.',
    ]);
  });

  it('preserves semver strings like Ver 1.0.0 without splitting', () => {
    const input = 'Ver 1.0.0 was superseded by Ver 2.1.0. Check the changelog.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'Ver 1.0.0 was superseded by Ver 2.1.0.',
      'Check the changelog.',
    ]);
  });

  it('handles sentence ending without trailing whitespace', () => {
    const input = 'This policy applies immediately.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual(['This policy applies immediately.']);
  });

  it('handles trailing question marks and exclamation marks', () => {
    const input = 'Need help with a return? Contact us today! We respond fast.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'Need help with a return?',
      'Contact us today!',
      'We respond fast.',
    ]);
  });

  it('handles multi-sentence paragraph combining decimals, versions, abbreviations, and punctuation', () => {
    const input =
      'Orders above USD 25.50 (see section 3.2 for details) require review. ' +
      'Item No. 5 and similar goods, e.g. these items, are excluded; i.e. that case is final! ' +
      'Did Ver 1.0.0 apply? Yes, it did.';
    assertVerbatimRoundTrip(input);
    expect(splitIntoSentences(input)).toEqual([
      'Orders above USD 25.50 (see section 3.2 for details) require review.',
      'Item No. 5 and similar goods, e.g. these items, are excluded; i.e. that case is final!',
      'Did Ver 1.0.0 apply?',
      'Yes, it did.',
    ]);
  });

  it('handles edge cases: empty string, whitespace-only, single word, single sentence', () => {
    for (const input of ['', '   \t\n ', 'Policy', 'Single sentence without period']) {
      assertVerbatimRoundTrip(input);
    }
    expect(splitIntoSentences('')).toEqual([]);
    expect(splitIntoSentences('   \t\n ')).toEqual([]);
    expect(splitIntoSentences('Policy')).toEqual(['Policy']);
    expect(splitIntoSentences('Single sentence without period')).toEqual([
      'Single sentence without period',
    ]);
  });

  it('handles unicode punctuation: em dash, ellipsis, and smart quotes', () => {
    const emDashInput = 'Standard returns—within 30 days—are free. Expedited fees are excluded.';
    assertVerbatimRoundTrip(emDashInput);
    expect(splitIntoSentences(emDashInput)).toEqual([
      'Standard returns—within 30 days—are free.',
      'Expedited fees are excluded.',
    ]);

    const smartQuoteInput = 'The policy states “Returns are accepted within 30 days.” No exceptions… unless defective.';
    assertVerbatimRoundTrip(smartQuoteInput);
    expect(splitIntoSentences(smartQuoteInput)).toEqual([
      'The policy states “Returns are accepted within 30 days.”',
      'No exceptions… unless defective.',
    ]);
  });
});

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

  it('does not drop USD 25.50 fragment when chunking', () => {
    const decimalDoc: ParsedPdfDocument = {
      ...sampleDoc,
      sections: [
        {
          heading: 'Fees',
          level: 2,
          sectionPath: 'Fees',
          paragraphs: ['Orders over USD 25.50 require approval.'],
        },
      ],
    };
    const chunks = chunkDocument(decimalDoc);
    expect(chunks[0]?.content).toContain('Orders over USD 25.50 require approval.');
  });
});
