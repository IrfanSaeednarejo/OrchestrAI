/**
 * server/src/knowledge/text-cleaner.ts
 * Implements Part D.4 (Cleaning text runs, hyphen resolution, whitespace/unicode normalization).
 */

export function cleanText(raw: string): string {
  if (!raw) return '';

  return (
    raw
      // Normalize unicode quotation marks and hyphens
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      // Resolve line-break hyphenation (e.g. "deli- \n very" -> "delivery")
      .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
      // Replace multiple newlines or tabs with normalized spacing
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function cleanParagraphs(paragraphs: string[]): string {
  const merged = paragraphs.join(' ');
  return cleanText(merged);
}
