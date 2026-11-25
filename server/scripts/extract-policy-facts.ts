/**
 * server/scripts/extract-policy-facts.ts
 *
 * Phase 37b.2:
 * Extracts every numeric policy fact from the 12 frozen docs in docs/knowledge-base/src/*.md
 * into docs/knowledge-base/fact-sheet.json as an immutable constraint for all 30 new docs.
 *
 * Usage: npx tsx scripts/extract-policy-facts.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export interface PolicyFact {
  concept: string;
  value: string;
  unit: string;
  source_doc: string;
  source_file: string;
  source_section: string;
  raw_excerpt: string;
}

const FROZEN_FILES = [
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
];

const NUMERIC_PATTERN =
  /(?:\$\d[\d,]*(?:\.\d{1,2})?|\d+(?:\.\d+)?%|\b\d+(?:\s*(?:to|-|–)\s*\d+)?\s*(?:calendar\s+days?|business\s+days?|days?|hours?|minutes?|seconds?|months?|years?|characters?|attempts?|tiers?|installments?|items?|digits?)\b)/gi;

function inferConcept(sentence: string, section: string, topic: string): string {
  const s = `${section} ${sentence}`.toLowerCase();
  if (s.includes('return') && s.includes('day') && (s.includes('within') || s.includes('window') || s.includes('eligib'))) {
    return 'return_window_days';
  }
  if (s.includes('refund') && s.includes('business day')) return 'refund_processing_business_days';
  if (s.includes('cancel') && (s.includes('hour') || s.includes('minute') || s.includes('day'))) {
    return 'cancellation_window';
  }
  if (s.includes('exchange') && s.includes('day')) return 'exchange_window_or_dispatch';
  if (s.includes('chargeback') || s.includes('dispute')) return 'dispute_or_chargeback_window';
  if (s.includes('otp') || s.includes('verification code') || s.includes('one-time')) return 'otp_or_verification_limit';
  if (s.includes('password') && (s.includes('character') || s.includes('day') || s.includes('length'))) {
    return 'password_policy';
  }
  if (s.includes('deletion') || s.includes('erasure') || s.includes('grace')) return 'data_deletion_timeline';
  if (s.includes('retention') || s.includes('retain')) return 'data_retention_period';
  if (s.includes('opt-out') || s.includes('unsubscribe') || s.includes('notification')) return 'notification_opt_out_sla';
  if (s.includes('shipping') && (s.includes('$') || s.includes('free') || s.includes('day'))) {
    return 'shipping_cost_or_transit';
  }
  if (s.includes('klarna') || s.includes('installment') || s.includes('bnpl')) return 'bnpl_terms';
  return `${topic}_numeric_fact`;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function main(): void {
  const srcDir = path.resolve(process.cwd(), '../docs/knowledge-base/src');
  const outPath = path.resolve(process.cwd(), '../docs/knowledge-base/fact-sheet.json');

  const facts: PolicyFact[] = [];

  for (const file of FROZEN_FILES) {
    const fullPath = path.join(srcDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing frozen doc: ${fullPath}`);
    }

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(raw);
    const docId = String(data.docId);
    const topic = String(data.topic);

    const lines = content.split(/\r?\n/);
    let currentSection = 'General';
    let buffer: string[] = [];

    const flushSection = (): void => {
      const text = buffer.join(' ').trim();
      if (!text) return;
      for (const sentence of splitSentences(text)) {
        const matches = sentence.match(NUMERIC_PATTERN);
        if (!matches) continue;
        for (const m of matches) {
          const unitMatch = m.match(/([a-zA-Z%$]+)\s*$/);
          const unit = m.startsWith('$') ? 'USD' : (unitMatch?.[1] ?? 'value').toLowerCase();
          facts.push({
            concept: inferConcept(sentence, currentSection, topic),
            value: m.trim(),
            unit,
            source_doc: docId,
            source_file: file,
            source_section: currentSection,
            raw_excerpt: sentence,
          });
        }
      }
      buffer = [];
    };

    for (const line of lines) {
      const headingMatch = /^#{1,3}\s+(.+)$/.exec(line.trim());
      if (headingMatch?.[1]) {
        flushSection();
        currentSection = headingMatch[1].trim();
      } else {
        buffer.push(line);
      }
    }
    flushSection();
  }

  const output = {
    generatedAt: new Date().toISOString(),
    frozenDocCount: FROZEN_FILES.length,
    factCount: facts.length,
    facts,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Extracted ${facts.length} numeric policy facts from ${FROZEN_FILES.length} frozen docs -> ${outPath}`);
}

main();
