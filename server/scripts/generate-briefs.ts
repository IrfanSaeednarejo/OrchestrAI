/**
 * server/scripts/generate-briefs.ts
 *
 * Phase 37b.3b:
 * Generates 30 brief files in docs/knowledge-base/briefs/{doc_id}.md from:
 *   - docs/knowledge-base/scope-map.md
 *   - docs/knowledge-base/fact-subtopic-relevance.md
 *   - docs/knowledge-base/fact-sheet.json
 *   - server/scripts/brief-outlines-{1,2,3}.ts
 *
 * Enforces all 6 required checks programmatically before exiting 0.
 * Zero LLM/embedding calls.
 *
 * Usage: npx tsx scripts/generate-briefs.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { ORDERS_OUTLINES, type BriefOutlineSpec } from './brief-outlines-1.js';
import { PAYMENTS_OUTLINES } from './brief-outlines-2.js';
import { ACCOUNT_OUTLINES } from './brief-outlines-3.js';

interface ScopeRow {
  docId: string;
  domain: string;
  topic: string;
  owningSpecialist: string;
  filename: string;
  sectionCount: number;
  subtopicOneLiner: string;
}

interface FactEntry {
  concept: string;
  value: string;
}

function parseScopeMap(mdPath: string): ScopeRow[] {
  const lines = fs.readFileSync(mdPath, 'utf-8').split(/\r?\n/);
  const rows: ScopeRow[] = [];
  for (const line of lines) {
    if (!line.startsWith('| `')) continue;
    const cols = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cols.length < 7) continue;
    rows.push({
      docId: cols[0] ?? '',
      domain: cols[1] ?? '',
      topic: cols[2] ?? '',
      owningSpecialist: cols[3] ?? '',
      filename: cols[4] ?? '',
      sectionCount: parseInt(cols[5] ?? '15', 10),
      subtopicOneLiner: cols[6] ?? '',
    });
  }
  return rows;
}

function parseRelevanceMatrix(mdPath: string): Map<string, string[]> {
  const lines = fs.readFileSync(mdPath, 'utf-8').split(/\r?\n/);
  const map = new Map<string, string[]>();
  for (const line of lines) {
    if (!line.startsWith('| `')) continue;
    const cols = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cols.length < 2) continue;
    const docMatch = /\(`([^`]+)`\)/.exec(cols[0] ?? '');
    if (!docMatch?.[1]) continue;
    const concepts = (cols[1] ?? '')
      .split(',')
      .map((c) => c.trim().replace(/^`|`$/g, ''))
      .filter(Boolean);
    map.set(docMatch[1], concepts);
  }
  return map;
}

function buildFactValueMap(factSheetPath: string): Map<string, string[]> {
  const data = JSON.parse(fs.readFileSync(factSheetPath, 'utf-8')) as { facts: FactEntry[] };
  const map = new Map<string, Set<string>>();
  for (const f of data.facts) {
    const set = map.get(f.concept) ?? new Set<string>();
    set.add(f.value);
    map.set(f.concept, set);
  }
  const out = new Map<string, string[]>();
  for (const [k, v] of map.entries()) {
    out.set(k, [...v]);
  }
  return out;
}

function main(): void {
  const rootDir = path.resolve(process.cwd(), '..');
  const scopeMapPath = path.join(rootDir, 'docs/knowledge-base/scope-map.md');
  const relevancePath = path.join(rootDir, 'docs/knowledge-base/fact-subtopic-relevance.md');
  const factSheetPath = path.join(rootDir, 'docs/knowledge-base/fact-sheet.json');
  const briefsDir = path.join(rootDir, 'docs/knowledge-base/briefs');

  fs.mkdirSync(briefsDir, { recursive: true });

  const scopeRows = parseScopeMap(scopeMapPath);
  const relevanceMap = parseRelevanceMatrix(relevancePath);
  const factValues = buildFactValueMap(factSheetPath);

  const allOutlines: BriefOutlineSpec[] = [...ORDERS_OUTLINES, ...PAYMENTS_OUTLINES, ...ACCOUNT_OUTLINES];
  const outlineByDocId = new Map<string, BriefOutlineSpec>();
  for (const o of allOutlines) {
    outlineByDocId.set(o.docId, o);
  }

  if (scopeRows.length !== 30) {
    throw new Error(`Expected 30 rows in scope-map.md, got ${scopeRows.length}`);
  }

  const globalHeadings = new Map<string, string>();
  const coveredConcepts = new Set<string>();
  let totalSections = 0;

  console.log('doc_id | section_count | concept_count');

  for (const row of scopeRows) {
    const outline = outlineByDocId.get(row.docId);
    if (!outline) {
      throw new Error(`Missing outline spec for ${row.docId}`);
    }
    const allowedConcepts = relevanceMap.get(row.docId);
    if (!allowedConcepts || allowedConcepts.length === 0) {
      throw new Error(`Missing relevance-matrix row for ${row.docId}`);
    }
    if (outline.sections.length < 14 || outline.sections.length > 16) {
      throw new Error(`Section count out of 14-16 range for ${row.docId}: ${outline.sections.length}`);
    }

    // Check 4 & 5: unique headings + no stray numbers/procedural triggers in intent or outline
    const cleanedOneLiner = row.subtopicOneLiner.replace(/\b6-digit\s+/gi, '');
    const localHeadings = new Set<string>();
    const textToScan = [cleanedOneLiner, outline.notCovered];

    for (const sec of outline.sections) {
      const normH = sec.heading.trim().toLowerCase();
      if (!sec.heading.endsWith('?')) {
        throw new Error(`Heading must be a reader question ending in '?': "${sec.heading}" in ${row.docId}`);
      }
      if (localHeadings.has(normH)) {
        throw new Error(`Duplicate heading within ${row.docId}: "${sec.heading}"`);
      }
      if (globalHeadings.has(normH)) {
        throw new Error(
          `Heading overlap across briefs: "${sec.heading}" in ${row.docId} and ${globalHeadings.get(normH)}`
        );
      }
      localHeadings.add(normH);
      globalHeadings.set(normH, row.docId);
      textToScan.push(sec.heading, ...sec.keyPoints.filter((x): x is string => Boolean(x)));
    }

    const joinedScan = textToScan.join(' ');
    if (/\b(?:3\s+distinct\s+ip|5\s+failed\s+otp|5\s+consecutive|3\s+consecutive|6-digit)\b/i.test(joinedScan)) {
      throw new Error(`Procedural trigger leaked into brief ${row.docId}`);
    }
    if (/gift\s*card/i.test(joinedScan)) {
      throw new Error(`Gift-card reference leaked into brief ${row.docId}`);
    }

    const constraintLines: string[] = [];
    for (const concept of allowedConcepts) {
      const vals = factValues.get(concept);
      if (!vals || vals.length === 0) {
        throw new Error(`Concept "${concept}" in relevance matrix not found in fact-sheet.json`);
      }
      coveredConcepts.add(concept);
      constraintLines.push(`- \`${concept} = ${vals.join(' to ')}\``);
    }

    const subtopicSlug = path
      .basename(row.filename, '.md')
      .replace(`${row.domain}-${row.topic}-`, '');

    const outlineLines = outline.sections
      .map((s, idx) => {
        const pts = s.keyPoints.filter((p): p is string => Boolean(p)).map((p) => `     - ${p}`).join('\n');
        return `${idx + 1}. ${s.heading}\n   Reader question: ${s.heading}\n   Key points:\n${pts}`;
      })
      .join('\n');

    const md = `# Brief: ${row.docId}

## Metadata
- doc_id: ${row.docId}
- domain: ${row.domain}
- topic: ${row.topic}
- subtopic: ${subtopicSlug}
- owning_specialist: ${row.owningSpecialist}
- version: 1.0.0
- target_sections: ${outline.sections.length}
- filename: ${row.filename}

## Subtopic intent
${cleanedOneLiner} This document answers customer and support questions specific to ${subtopicSlug.replace(/-/g, ' ')} within ${row.domain}/${row.topic}. ${outline.notCovered}

## Section outline (each = one chunk, ~700-800 chars)
${outlineLines}

## Constraints — facts this doc may cite
${constraintLines.join('\n')}

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
`;

    fs.writeFileSync(path.join(briefsDir, `${row.docId}.md`), md, 'utf-8');
    totalSections += outline.sections.length;
    console.log(`${row.docId} | ${outline.sections.length} | ${allowedConcepts.length}`);
  }

  // Coverage check against all 96 concepts in fact-sheet.json
  const missingConcepts: string[] = [];
  for (const concept of factValues.keys()) {
    if (!coveredConcepts.has(concept)) {
      missingConcepts.push(concept);
    }
  }
  if (missingConcepts.length > 0) {
    throw new Error(`Uncovered concepts from fact-sheet.json: ${missingConcepts.join(', ')}`);
  }

  console.log(`\nAggregate: ${scopeRows.length} briefs, ${totalSections} total sections, ${coveredConcepts.size}/${factValues.size} concepts covered (0 heading overlaps).`);
}

main();
