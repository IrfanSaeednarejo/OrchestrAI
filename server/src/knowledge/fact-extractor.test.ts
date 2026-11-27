import { describe, expect, it } from 'vitest';
import { NUMERIC_PATTERN, normalizeExtractedValue } from './policy-fact-extractor.js';

describe('Policy Fact Extractor — Written-Out Currency & Percentage Normalization', () => {
  it('extracts and normalizes "6.95 dollars" and "5 percent" to "$6.95" and "5%"', () => {
    const input = 'Item costs 6.95 dollars and 5 percent tax';
    const matches = input.match(NUMERIC_PATTERN) ?? [];
    const normalized = matches.map(normalizeExtractedValue);
    expect(normalized).toEqual(['$6.95', '5%']);
  });

  it('extracts and normalizes integer "6 dollars" to "$6.00"', () => {
    const input = 'Handling fee is 6 dollars per shipment.';
    const matches = input.match(NUMERIC_PATTERN) ?? [];
    const normalized = matches.map(normalizeExtractedValue);
    expect(normalized).toEqual(['$6.00']);
  });
});
