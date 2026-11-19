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

/**
 * Splits sentences by standard punctuation while keeping sentence integrity.
 */
function splitIntoSentences(text: string): string[] {
  const matched = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  return matched ? matched.map((s) => s.trim()).filter(Boolean) : [text];
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
