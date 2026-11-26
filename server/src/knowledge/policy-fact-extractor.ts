/**
 * server/src/knowledge/policy-fact-extractor.ts
 *
 * Shared numeric-fact extraction utilities used by:
 *   - server/scripts/extract-policy-facts.ts
 *   - server/scripts/audit-contradictions.ts
 *   - server/src/knowledge/fact-extractor.test.ts
 *
 * Keeps NUMERIC_PATTERN and normalizeExtractedValue in src/ so they fall under
 * tsconfig rootDir and can be tested by Vitest.
 */

// Clean currency/percentage/duration pattern — supports:
//   • $-prefixed amounts: $6.95, $1,000
//   • Written-out currency: "6.95 dollars", "50 dollars"
//   • Written-out percent: "5 percent", "1.5 percent"
//   • Duration ranges: "5 to 7 business days", "2-3 days"
//   • Hyphenated forms: "30-day", "24-hour"
//   • Count units: characters, attempts, tiers, installments, items, digits
// Never captures trailing commas or leading articles.
export const NUMERIC_PATTERN =
  /(?:\$\d+(?:,\d{3})*(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s*dollars?\b|\d+(?:\.\d+)?\s*(?:%|percent\b)|\b\d+(?:\s*(?:to|-|–)\s*\d+)?\s*(?:calendar\s+days?|business\s+days?|days?|hours?|minutes?|seconds?|months?|years?|characters?|attempts?|tiers?|installments?|items?|digits?)\b|\b\d+\s*-\s*(?:business\s+days?|days?|hours?|minutes?|years?)\b)/gi;

export function normalizeExtractedValue(rawMatch: string): string {
  let s = rawMatch.trim().replace(/\s+/g, ' ');

  // Normalize "1.5 percent" -> "1.5%"
  s = s.replace(/^(\d+(?:\.\d+)?)\s*percent$/i, '$1%');

  // Normalize "6.95 dollars" -> "$6.95", "6 dollars" -> "$6.00"
  const dollarWord = /^(\d+)(?:\.(\d{1,2}))?\s*dollars?$/i.exec(s);
  if (dollarWord?.[1]) {
    const intPart = Number(dollarWord[1]).toLocaleString('en-US');
    const decPart = dollarWord[2] ? `.${dollarWord[2].padEnd(2, '0')}` : '.00';
    return `$${intPart}${decPart}`;
  }

  // Normalize "$5000" -> "$5,000"
  const usdMatch = /^\$(\d+)(\.\d{1,2})?$/.exec(s);
  if (usdMatch?.[1] && usdMatch[1].length >= 4) {
    const withCommas = Number(usdMatch[1]).toLocaleString('en-US');
    s = `$${withCommas}${usdMatch[2] ?? ''}`;
  }

  // Normalize ranges with hyphens/en-dashes: "5-7 business days" -> "5 to 7 business days"
  s = s.replace(/^(\d+)\s*(?:-|–)\s*(\d+)\s+(.+)$/, '$1 to $2 $3');

  // Normalize hyphenated forms: "30-day" -> "30 days", "5-business-day" -> "5 business days"
  const hyph = /^(\d+)\s*-\s*(business\s+days?|days?|hours?|minutes?|years?)$/i.exec(s);
  if (hyph?.[1] && hyph[2]) {
    const n = hyph[1];
    const baseUnit = hyph[2].toLowerCase().replace(/\s+/g, ' ').replace(/s$/, '');
    const pluralUnit = n === '1' ? baseUnit : `${baseUnit}s`;
    return `${n} ${pluralUnit}`;
  }

  // Normalize singular unit when quantity > 1
  // e.g. "365 day" -> "365 days", "24 hour" -> "24 hours", "5 business day" -> "5 business days"
  const unitMatch =
    /^(\d+)\s+(business\s+days?|calendar\s+days?|days?|hours?|minutes?|seconds?|months?|years?|characters?|digits?)$/i.exec(
      s,
    );
  if (unitMatch?.[1] && unitMatch[2]) {
    const n = unitMatch[1];
    const baseUnit = unitMatch[2].toLowerCase().replace(/\s+/g, ' ').replace(/s$/, '');
    const unit = n === '1' ? baseUnit : `${baseUnit}s`;
    return `${n} ${unit}`;
  }

  return s;
}
