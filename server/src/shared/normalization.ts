// src/shared/normalization.ts
// Phase 26 Step 3: Name normalization and email masking utilities.
// Enforces:
// - Conservative title casing preserving internal capitals (McDonald, O'Brien)
// - Lowercase particle preservation (van der Berg, de, la)
// - Hyphenated name preservation (Smith-Jones)
// - Single-char local part masking (a@example.com -> a***@example.com)
// - Whitespace collapsing and trimming

const LOWERCASE_PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'la', 'du', 'da', 'di']);

/**
 * Masks an email address for display without leaking user PII.
 * Examples:
 * - "john.doe@example.com" -> "j***@example.com"
 * - "a@example.com" -> "a***@example.com"
 * - "support@mail.co.uk" -> "s***@mail.co.uk"
 * - "" / "   " / invalid -> ""
 */
export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const trimmed = email.trim();
  if (trimmed.length === 0) return '';

  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) return '';

  const localPart = trimmed.slice(0, atIdx);
  const domainPart = trimmed.slice(atIdx + 1);

  if (!domainPart.includes('.')) return '';

  const firstChar = localPart.charAt(0);
  return `${firstChar}***@${domainPart}`;
}

/**
 * Conservatively capitalizes a single word:
 * - If the word already contains mixed-case internal capitals (e.g. McDonald, MacLeod), preserves it.
 * - If the word contains an apostrophe with an internal capital (e.g. O'Brien), preserves it.
 *   If the apostrophe part is lowercase (e.g. o'brien), capitalizes both: O'Brien.
 * - If entirely lowercase or entirely uppercase, transforms to Titlecase (e.g. "irfan" -> "Irfan", "IRFAN" -> "Irfan").
 */
function titleCaseWord(word: string): string {
  if (!word) return '';

  // Handle hyphenated words (e.g. Smith-Jones, smith-jones)
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part) => titleCaseWord(part))
      .join('-');
  }

  // Handle apostrophes (e.g. O'Brien, d'Angelo, o'brien)
  if (word.includes("'")) {
    const parts = word.split("'");
    if (parts.length === 2 && parts[0] && parts[1]) {
      // If already has internal capital in second part (e.g. O'Brien), preserve
      if (/[a-z][A-Z]/.test(word)) {
        return word;
      }
      return (
        parts[0].charAt(0).toUpperCase() +
        parts[0].slice(1).toLowerCase() +
        "'" +
        parts[1].charAt(0).toUpperCase() +
        parts[1].slice(1).toLowerCase()
      );
    }
  }

  // If already contains an internal capital letter (e.g. McDonald, McCartney), preserve as-is
  if (/[a-z][A-Z]/.test(word)) {
    return word;
  }

  // If all-caps or all-lowercase: capitalize first letter, lower the rest
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Conservatively normalizes a customer name:
 * - Trims leading and trailing whitespace
 * - Collapses consecutive spaces into single spaces
 * - Preserves McDonald, O'Brien, and particles like van der Berg
 */
export function conservativeTitleCaseName(raw: string): string {
  if (!raw) return '';
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';

  const words = collapsed.split(' ');
  const titleCasedWords = words.map((word, idx) => {
    const lower = word.toLowerCase();
    // Keep known particles lowercase if not the first or last word
    if (idx > 0 && idx < words.length - 1 && LOWERCASE_PARTICLES.has(lower)) {
      return lower;
    }
    return titleCaseWord(word);
  });

  return titleCasedWords.join(' ');
}

/**
 * Validates and normalizes raw customer name input, preserving the original string.
 */
export function normalizeName(raw?: string | null): {
  normalized: string;
  raw: string;
  isValid: boolean;
} {
  const rawString = typeof raw === 'string' ? raw : '';
  const normalized = conservativeTitleCaseName(rawString);
  const isValid = normalized.length >= 2 && normalized.length <= 100;

  return {
    normalized,
    raw: rawString,
    isValid,
  };
}

