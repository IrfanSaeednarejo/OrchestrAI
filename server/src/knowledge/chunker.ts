/**
 * server/src/knowledge/chunker.ts
 * Implements Part C & D.5: Section-aware chunking with overlap and contextual breadcrumbs.
 */

import crypto from 'crypto';
import { ParsedPdfDocument } from './pdf-parser.js';
import { cleanText } from './text-cleaner.js';

export interface DocumentChunk {
  chunkIndex: number;
  sectionPath: string;
  content: string;
  contentHash: string;
  tokenEstimate: number;
}

export interface ChunkOptions {
  targetTokens?: number; // default 350
  overlapTokens?: number; // default 50
}

export interface SentenceSegment {
  sentence: string;
  separator: string;
}

const KNOWN_ABBREVIATIONS = new Set([
  'no',
  'dr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'inc',
  'ltd',
  'corp',
  'vs',
  'etc',
  'approx',
  'est',
  'sec',
  'fig',
  'vol',
  'ref',
  'dept',
  'max',
  'min',
  'ver',
]);

const CLOSING_PUNCT = new Set(['"', "'", '”', '’', ')', ']']);

function isAbbreviationAtDot(text: string, dotIndex: number): boolean {
  const prefix = text.slice(0, dotIndex + 1);
  // Multi-letter dotted abbreviations like e.g., i.e., u.s., a.m., p.m.
  if (/(?:^|[\s(])(?:[a-zA-Z]\.){2,}$/.test(prefix)) {
    return true;
  }
  const wordMatch = /(?:^|[\s(])([a-zA-Z]+)\.$/.exec(prefix);
  if (wordMatch?.[1] && KNOWN_ABBREVIATIONS.has(wordMatch[1].toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Splits text into sentence segments while preserving every character and separator.
 * Invariant: segments.map((s) => s.sentence + s.separator).join('') === text
 */
export function splitIntoSentencesWithSeparators(text: string): SentenceSegment[] {
  if (text.length === 0) return [];

  const segments: SentenceSegment[] = [];
  let start = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') {
      i++;
      continue;
    }

    // Decimal or version number (e.g. 25.50, 3.2, 1.0.0)
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    if (ch === '.' && /\d/.test(prev ?? '') && /\d/.test(next ?? '')) {
      i++;
      continue;
    }

    // Consume consecutive sentence-ending punctuation (e.g. ..., ?!, !!)
    let punctEnd = i + 1;
    while (
      punctEnd < text.length &&
      (text[punctEnd] === '.' || text[punctEnd] === '!' || text[punctEnd] === '?')
    ) {
      punctEnd++;
    }

    // Single-dot abbreviation check (e.g. No., e.g., i.e.)
    if (punctEnd === i + 1 && ch === '.' && isAbbreviationAtDot(text, i)) {
      i = punctEnd;
      continue;
    }

    // Consume any closing quotes or brackets attached to the sentence
    let sentEnd = punctEnd;
    while (sentEnd < text.length && CLOSING_PUNCT.has(text[sentEnd] ?? '')) {
      sentEnd++;
    }

    // Require either end-of-string or whitespace after sentence-ending punctuation
    if (sentEnd < text.length && !/\s/.test(text[sentEnd] ?? '')) {
      i = sentEnd;
      continue;
    }

    let sepEnd = sentEnd;
    while (sepEnd < text.length && /\s/.test(text[sepEnd] ?? '')) {
      sepEnd++;
    }

    segments.push({
      sentence: text.slice(start, sentEnd),
      separator: text.slice(sentEnd, sepEnd),
    });
    start = sepEnd;
    i = sepEnd;
  }

  if (start < text.length) {
    segments.push({
      sentence: text.slice(start),
      separator: '',
    });
  }

  return segments;
}

/**
 * Splits sentences by standard punctuation while keeping sentence integrity
 * and guaranteeing zero fragment loss.
 */
export function splitIntoSentences(text: string): string[] {
  return splitIntoSentencesWithSeparators(text)
    .map((s) => s.sentence.trim())
    .filter(Boolean);
}

export function chunkDocument(
  doc: ParsedPdfDocument,
  options: ChunkOptions = {}
): DocumentChunk[] {
  const targetTokens = options.targetTokens ?? 350;
  const overlapTokens = options.overlapTokens ?? 50;

  // Rough estimation: 1 token ~ 4 characters
  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  const chunks: DocumentChunk[] = [];
  let globalChunkIndex = 0;

  for (const section of doc.sections) {
    const rawSectionContent = cleanText(section.paragraphs.join(' '));
    if (!rawSectionContent) continue;

    const breadcrumb = `[Policy: ${doc.metadata.domain} > ${doc.metadata.topic} | Section: ${section.sectionPath} | v${doc.metadata.version}]`;
    const sentences = splitIntoSentences(rawSectionContent);

    let currentSentences: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (!sentence) continue;
      currentSentences.push(sentence);
      currentLength += sentence.length + 1;

      if (currentLength >= targetChars || i === sentences.length - 1) {
        const bodyContent = currentSentences.join(' ');
        const fullContent = `${breadcrumb}\n${bodyContent}`;

        const contentHash = crypto
          .createHash('sha256')
          .update(fullContent)
          .digest('hex');

        chunks.push({
          chunkIndex: globalChunkIndex++,
          sectionPath: section.sectionPath,
          content: fullContent,
          contentHash,
          tokenEstimate: Math.round(fullContent.length / 4),
        });

        // Compute overlap for the next chunk
        let overlapAccum = 0;
        const overlapSentences: string[] = [];
        for (let j = currentSentences.length - 1; j >= 0; j--) {
          const s = currentSentences[j];
          if (!s) continue;
          if (overlapAccum + s.length <= overlapChars) {
            overlapSentences.unshift(s);
            overlapAccum += s.length;
          } else {
            break;
          }
        }

        currentSentences = overlapSentences;
        currentLength = overlapAccum;
      }
    }
  }

  return chunks;
}
