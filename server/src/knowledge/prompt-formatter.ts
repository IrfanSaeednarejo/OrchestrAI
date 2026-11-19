/**
 * server/src/knowledge/prompt-formatter.ts
 * Implements Part C (Formatting grounded knowledge blocks with document citations).
 */

import { RankedKnowledgeHit } from './rrf-reranker.js';

export function formatHitsForPrompt(hits: RankedKnowledgeHit[]): string {
  if (hits.length === 0) {
    return '';
  }

  const domain = hits[0]?.domain ?? '';
  const topic = hits[0]?.topic ?? '';

  const blocks = hits.map((hit) => {
    const effDate =
      hit.effectiveDate instanceof Date
        ? hit.effectiveDate.toISOString().split('T')[0]
        : String(hit.effectiveDate).split('T')[0];

    return (
      `[Source: ${hit.topic} | Section: ${hit.sectionPath} | v${hit.version} | Effective: ${effDate}]\n` +
      `${hit.content.trim()}`
    );
  });

  return `<grounded_knowledge domain="${domain}" topic="${topic}">\n${blocks.join('\n\n')}\n</grounded_knowledge>`;
}
