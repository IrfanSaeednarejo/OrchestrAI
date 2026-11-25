/**
 * server/scripts/generate-policy-docs.ts
 *
 * Phase 37b.4:
 * Resumable LLM document generator that drafts the 30 new policy/FAQ markdown docs
 * in docs/knowledge-base/src/*.md from the 30 approved briefs in docs/knowledge-base/briefs/*.md.
 *
 * - Uses existing generateStructuredOutput from src/agents/llm/client.ts
 * - Resumable by brief SHA-256 hash stored in docs/knowledge-base/briefs/.doc-gen-manifest.json
 * - Never touches the 12 frozen docs
 * - Never run inside Vitest; explicit script invocation only
 *
 * Usage: npx tsx scripts/generate-policy-docs.ts
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pLimit from 'p-limit';
import { z } from 'zod';
import { generateStructuredOutput } from '../src/agents/llm/client.js';

const FROZEN_FILES = new Set([
  'account-security-faq.md',
  'cancellations.md',
  'data-deletion.md',
  'disputes.md',
  'exchanges.md',
  'methods.md',
  'notifications.md',
  'payments-faq.md',
  'privacy.md',
  'refunds-policy.md',
  'returns-policy.md',
  'shipping-faq.md',
]);

const DocOutputSchema = z.object({
  title: z.string().min(5),
  sections: z
    .array(
      z.object({
        heading: z.string().min(5),
        body: z.string().min(340).max(1050),
      })
    )
    .min(14)
    .max(16),
});

interface ManifestEntry {
  briefHash: string;
  file: string;
  chars: number;
  sections: number;
  timestamp: string;
}

interface ParsedBriefMeta {
  docId: string;
  domain: string;
  topic: string;
  version: string;
  filename: string;
  targetSections: number;
}

function parseBriefMeta(raw: string): ParsedBriefMeta {
  const get = (key: string): string => {
    const m = new RegExp(`^- ${key}:\\s*(.+)$`, 'm').exec(raw);
    return m?.[1]?.trim() ?? '';
  };
  return {
    docId: get('doc_id'),
    domain: get('domain'),
    topic: get('topic'),
    version: get('version') || '1.0.0',
    filename: get('filename'),
    targetSections: parseInt(get('target_sections') || '15', 10),
  };
}

function buildPrompt(briefContent: string, meta: ParsedBriefMeta): string {
  return `You are a senior e-commerce policy author for Northvale. Draft the complete policy/FAQ document specified by the brief below.

STRICT RULES (NON-NEGOTIABLE):
1. Return JSON matching the schema: { "title": string, "sections": [{ "heading": string, "body": string }] }.
2. Produce EXACTLY ${meta.targetSections} sections, using the EXACT H2 section headings from the brief's "Section outline" in the exact same order.
3. Each section "body" MUST be a single cohesive paragraph of neutral, authoritative third-person policy prose between 550 and 800 characters long (5 to 6 complete, detailed sentences). Answer the heading's reader question directly in the first sentence.
4. No marketing language, no first person ("we", "our", "I"), no bullet lists in the body, no rhetorical questions in the body. Use "Northvale" and "customers" or "you".
5. NUMERIC FACT CONSTRAINT (CRITICAL):
   - You may ONLY cite numeric policy facts listed under "## Constraints — facts this doc may cite" in the brief, using their EXACT values.
   - Do NOT invent, estimate, or introduce ANY other numbers, dollar amounts, percentages, day counts, hour limits, minute limits, or year counts anywhere in the text.
   - If a range constraint is listed (e.g. "$50 to $2,000" or "1% to 3%"), whenever you mention that concept you MUST include BOTH the minimum and maximum values together.
   - Do NOT cite facts from other subtopics or contradict the frozen corpus.

BRIEF:
${briefContent}`;
}

async function main(): Promise<void> {
  const rootDir = path.resolve(process.cwd(), '..');
  const briefsDir = path.join(rootDir, 'docs/knowledge-base/briefs');
  const manifestPath = path.join(briefsDir, '.doc-gen-manifest.json');

  const manifest: Record<string, ManifestEntry> = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, ManifestEntry>)
    : {};

  const briefFiles = fs
    .readdirSync(briefsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (briefFiles.length !== 30) {
    throw new Error(`Expected 30 brief files in ${briefsDir}, found ${briefFiles.length}`);
  }

  console.log(`\n=== Phase 37b.4 Resumable Doc Generation (${briefFiles.length} briefs) ===`);
  const limit = pLimit(1);

  await Promise.all(
    briefFiles.map((bf) =>
      limit(async () => {
        const briefPath = path.join(briefsDir, bf);
        const rawBrief = fs.readFileSync(briefPath, 'utf-8');
        const briefHash = crypto.createHash('sha256').update(rawBrief).digest('hex');
        const meta = parseBriefMeta(rawBrief);

        if (!meta.docId || !meta.filename) {
          throw new Error(`Invalid brief metadata in ${bf}`);
        }

        const outBase = path.basename(meta.filename);
        if (FROZEN_FILES.has(outBase)) {
          throw new Error(`REFUSED: Attempted to overwrite frozen doc ${outBase}`);
        }

        const outPath = path.join(rootDir, meta.filename);
        const prev = manifest[meta.docId];
        if (prev && prev.briefHash === briefHash && fs.existsSync(outPath)) {
          console.log(`  ↷ Skipped (matching hash): ${meta.docId} -> ${outBase}`);
          return;
        }

        const documentType = meta.docId.startsWith('pol-') ? 'policy' : 'faq';
        const prompt = buildPrompt(rawBrief, meta);

        let res = await generateStructuredOutput(DocOutputSchema, prompt, {
          temperature: 0.2,
          timeoutMs: 90_000,
          maxRetries: 2,
          maxOutputTokens: 8192,
          node: 'phase37_doc_gen',
        });

        for (let retry = 1; !res.success && retry <= 6; retry++) {
          const waitMs = Math.min(30_000, 5000 * Math.pow(2, retry - 1));
          console.warn(`  ↻ Retry ${retry}/6 for ${meta.docId} after ${waitMs}ms (${res.error.kind})`);
          await new Promise((r) => setTimeout(r, waitMs));
          res = await generateStructuredOutput(DocOutputSchema, prompt, {
            temperature: 0.2,
            timeoutMs: 90_000,
            maxRetries: 2,
            maxOutputTokens: 8192,
            node: 'phase37_doc_gen',
          });
        }

        if (!res.success) {
          throw new Error(`LLM failed for ${meta.docId}: ${res.error.kind} - ${res.error.message}`);
        }

        const { title, sections } = res.data;
        if (sections.length !== meta.targetSections) {
          throw new Error(
            `Section count mismatch for ${meta.docId}: expected ${meta.targetSections}, got ${sections.length}`
          );
        }

        const frontmatter = [
          '---',
          `docId: ${meta.docId}`,
          `domain: ${meta.domain}`,
          `topic: ${meta.topic}`,
          `documentType: ${documentType}`,
          `version: ${meta.version}`,
          `effectiveDate: '2026-11-26T00:00:00Z'`,
          `title: ${JSON.stringify(title)}`,
          '---',
          '',
          `# ${title}`,
          '',
        ].join('\n');

        const body = sections
          .map((s) => `## ${s.heading.trim()}\n\n${s.body.trim()}\n`)
          .join('\n');

        const fullDoc = `${frontmatter}${body}`;
        fs.writeFileSync(outPath, fullDoc, 'utf-8');

        const ts = new Date().toISOString();
        manifest[meta.docId] = {
          briefHash,
          file: meta.filename,
          chars: fullDoc.length,
          sections: sections.length,
          timestamp: ts,
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

        console.log(
          `  ✓ ${meta.docId} | chars=${fullDoc.length} | sections=${sections.length} | ${ts}`
        );
      })
    )
  );

  console.log(`\nDoc generation complete: ${Object.keys(manifest).length}/30 docs in manifest.`);
}

main().catch((err) => {
  console.error('Doc generation failed:', err);
  process.exit(1);
});
