// src/shared/normalization.test.ts
// Unit tests for normalization and email masking utilities.

import { describe, it, expect } from 'vitest';
import {
  maskEmail,
  conservativeTitleCaseName,
  normalizeName,
} from './normalization.js';

describe('Normalization Utilities', () => {
  describe('maskEmail', () => {
    it('masks standard email addresses preserving domain and first char', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
      expect(maskEmail('irfan@gmail.com')).toBe('i***@gmail.com');
    });

    it('correctly masks single-character local parts without throwing or breaking', () => {
      expect(maskEmail('a@example.com')).toBe('a***@example.com');
      expect(maskEmail('z@test.org')).toBe('z***@test.org');
    });

    it('preserves multi-level subdomains intact', () => {
      expect(maskEmail('support@sub.domain.co.uk')).toBe('s***@sub.domain.co.uk');
      expect(maskEmail('user@mail.internal.orchestrai.dev')).toBe('u***@mail.internal.orchestrai.dev');
    });

    it('returns empty string on empty, null, undefined, or whitespace-only inputs', () => {
      expect(maskEmail('')).toBe('');
      expect(maskEmail(null)).toBe('');
      expect(maskEmail(undefined)).toBe('');
      expect(maskEmail('   ')).toBe('');
      expect(maskEmail('\t\n')).toBe('');
    });

    it('returns empty string on malformed email addresses', () => {
      expect(maskEmail('notanemail')).toBe('');
      expect(maskEmail('user@')).toBe('');
      expect(maskEmail('@domain.com')).toBe('');
      expect(maskEmail('user@nodot')).toBe('');
    });
  });

  describe('conservativeTitleCaseName', () => {
    it('normalizes all-lowercase and all-uppercase names to title case', () => {
      expect(conservativeTitleCaseName('irfan billo raja')).toBe('Irfan Billo Raja');
      expect(conservativeTitleCaseName('IRFAN BILLO RAJA')).toBe('Irfan Billo Raja');
    });

    it('collapses multiple consecutive whitespace characters and trims', () => {
      expect(conservativeTitleCaseName('   irfan    billo   raja   ')).toBe('Irfan Billo Raja');
      expect(conservativeTitleCaseName('\tirfan\n\n\tbillo\t')).toBe('Irfan Billo');
    });

    it('preserves internal capitalization like McDonald and MacLeod', () => {
      expect(conservativeTitleCaseName('Ronald McDonald')).toBe('Ronald McDonald');
      expect(conservativeTitleCaseName('ronald McDonald')).toBe('Ronald McDonald');
      expect(conservativeTitleCaseName('Connor MacLeod')).toBe('Connor MacLeod');
    });

    it('preserves and formats apostrophes like O\'Brien', () => {
      expect(conservativeTitleCaseName("Conan O'Brien")).toBe("Conan O'Brien");
      expect(conservativeTitleCaseName("conan o'brien")).toBe("Conan O'Brien");
    });

    it('preserves lowercase particles like van, der, de, la', () => {
      expect(conservativeTitleCaseName('Ludwig van Beethoven')).toBe('Ludwig van Beethoven');
      expect(conservativeTitleCaseName('Vincent van Gogh')).toBe('Vincent van Gogh');
      expect(conservativeTitleCaseName('Johannes van der Berg')).toBe('Johannes van der Berg');
      expect(conservativeTitleCaseName('Jean de La Fontaine')).toBe('Jean de la Fontaine');
    });

    it('handles hyphenated names correctly', () => {
      expect(conservativeTitleCaseName('Mary-Jane Watson')).toBe('Mary-Jane Watson');
      expect(conservativeTitleCaseName('mary-jane watson')).toBe('Mary-Jane Watson');
    });

    it('returns empty string for empty or whitespace-only names', () => {
      expect(conservativeTitleCaseName('')).toBe('');
      expect(conservativeTitleCaseName('   ')).toBe('');
    });
  });

  describe('normalizeName', () => {
    it('returns normalized, raw, and validity flag', () => {
      const res = normalizeName('  irfan billo raja  ');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('Irfan Billo Raja');
      expect(res.raw).toBe('  irfan billo raja  ');
    });

    it('marks single-character or empty names as invalid', () => {
      expect(normalizeName('').isValid).toBe(false);
      expect(normalizeName('x').isValid).toBe(false);
      expect(normalizeName('   ').isValid).toBe(false);
    });
  });
});

