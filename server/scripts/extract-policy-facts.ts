/**
 * server/scripts/extract-policy-facts.ts
 *
 * Phase 37b.2 (Refactored + Hyphenated Duration Support):
 * Extracts every numeric policy fact from the 12 frozen docs in docs/knowledge-base/src/*.md
 * into docs/knowledge-base/fact-sheet.json with a strict semantic concept taxonomy
 * (<= 2 distinct values per concept, zero *_numeric_fact placeholders) and built-in
 * sanity validation (Tasks A, B, C).
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

// Clean currency/percentage/duration pattern — supports hyphenated forms (30-day, 24-hour, 15-minute)
// and never captures trailing commas.
const NUMERIC_PATTERN =
  /(?:\$\d+(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d+)?%|\b\d+(?:\s*(?:to|-|–)\s*\d+)?\s*(?:calendar\s+days?|business\s+days?|days?|hours?|minutes?|seconds?|months?|years?|characters?|attempts?|tiers?|installments?|items?|digits?)\b|\b\d+\s*-\s*(?:days?|hours?|minutes?|years?)\b)/gi;

function normalizeExtractedValue(rawMatch: string): string {
  const trimmed = rawMatch.trim();
  const hyph = /^(\d+)\s*-\s*(day|days|hour|hours|minute|minutes|year|years)$/i.exec(trimmed);
  if (hyph?.[1] && hyph[2]) {
    const n = hyph[1];
    const baseUnit = hyph[2].toLowerCase().replace(/s$/, '');
    const pluralUnit = n === '1' ? baseUnit : `${baseUnit}s`;
    return `${n} ${pluralUnit}`;
  }
  return trimmed;
}

function inferConcept(sentence: string, value: string): string {
  const s = sentence.toLowerCase();
  const v = value.toLowerCase();

  // Account security
  if (s.includes('minimum of 12 characters') && v === '12 characters') return 'password_min_length';
  if (s.includes('maximum length of 128 characters') && v === '128 characters') return 'password_max_length';
  if (s.includes('passwords expire automatically after 365 days')) return 'password_rotation_days';
  if (s.includes('one-time verification code (otp)') && v === '10 minutes') return 'otp_validity_minutes';
  if (s.includes('verification lockout') && v === '15 minutes') return 'otp_lockout_duration';
  if (s.includes('compromised accounts are placed into a frozen state')) return 'compromised_account_freeze_sla';
  if (s.includes('consecutive incorrect passwords') && v === '30 minutes') return 'password_lockout_duration';
  if (s.includes('30-minute lockout') && v === '30 minutes') return 'password_lockout_duration';
  if (s.includes('emailed recovery link that remains valid')) return 'password_recovery_link_ttl';
  if ((s.includes('24-hour period') || s.includes('24-hour window')) && v === '24 hours') {
    return 'security_velocity_window_hours';
  }

  // Cancellations
  if (s.includes('displaying an active "processing" status')) return 'cancellation_cutoff_standard';
  if (s.includes('between initial processing and final shipping')) return 'warehouse_processing_to_ship_window';
  if (s.includes('cancel their pre-ordered items') || s.includes('within 48 hours of the scheduled release date')) {
    return 'cancellation_cutoff_preorder';
  }
  if (s.includes('bulk orders comprising 10 or more units')) return 'cancellation_notice_bulk';
  if (s.includes('bulk order') && s.includes('15% cancellation fee')) return 'cancellation_fee_bulk_custom';
  if (s.includes('entered shipped status cannot be cancelled')) return 'return_window_standard';
  if (s.includes('initiated within 2 hours of confirmed cancellation')) return 'refund_initiation_after_cancel';
  if (s.includes('debit cards') && v === '10 business days') return 'refund_processing_debit_card';

  // Data deletion
  if (s.includes('deletion request is verified') && v === '24 hours') return 'data_deletion_confirmation_sla';
  if (s.includes('grace period') && v === '30 days') return 'data_deletion_grace_period';
  if (s.includes('order records') && s.includes('7 years')) return 'data_retention_order_records';
  if (s.includes('security records') && s.includes('5 years')) return 'data_retention_security_records';
  if (s.includes('permanent database deletion executes')) return 'data_deletion_purge_sla';
  if (s.includes('backup archives') && v === '30 days') return 'data_deletion_backup_purge_days';

  // Disputes
  if (s.includes('dispute claims must be submitted within 60 days')) return 'dispute_filing_window';
  if (s.includes('internal billing review within 2 business days')) return 'dispute_internal_review_start_sla';
  if (s.includes('formal internal dispute decision within 10 business days') || s.includes('resolution determined within 10 business days')) {
    return 'dispute_internal_decision_sla';
  }
  if (s.includes('dispute is approved') && v === '5 business days') return 'dispute_refund_execution_sla';
  if (s.includes('resolved in favor of the customer') && v === '5 business days') return 'dispute_refund_execution_sla';
  if (s.includes('evidence to the merchant bank') || s.includes('bank chargeback timelines')) return 'chargeback_issuer_window';
  if (s.includes('police report is strictly mandatory') && v === '$500') return 'dispute_police_report_threshold';
  if (s.includes('dispute receipt acknowledgment within 24 hours')) return 'dispute_acknowledgment_sla';
  if (s.includes('re-open after 30 days')) return 'dispute_reopen_window';

  // Exchanges
  if (s.includes('request an exchange on eligible items within 30 days')) return 'exchange_window_standard';
  if (s.includes('exchange inventory is reserved and held for 48 hours')) return 'exchange_inventory_hold_hours';
  if (s.includes('expedited replacement shipping') && v === '$12.95') return 'exchange_expedited_shipping_fee';
  if (s.includes('replacement orders are dispatched within 2 to 3 business days')) return 'exchange_replacement_dispatch_sla';
  if (s.includes('change-of-mind exchanges') && v === '$6.95') return 'shipping_return_first_item';
  if (s.includes('replacement outbound shipping is completely free') && v === '$50') return 'shipping_standard_min_order_free';
  if (s.includes('alaska and hawaii') && v === '$12.00') return 'shipping_ak_hi_surcharge';

  // Methods
  if (s.includes('digital wallet payments exceeding $500')) return 'digital_wallet_stepup_threshold';
  if (s.includes('klarna') && (v === '$50' || v === '$2,000')) return 'bnpl_klarna_order_range';
  if (s.includes('financed through klarna') && v === '5 business days') return 'refund_processing_klarna';
  if (s.includes('ach) bank transfers on qualifying orders exceeding $200')) return 'ach_min_order_threshold';
  if (s.includes('ach transfers require 3 business days to clear')) return 'ach_settlement_days';
  if (s.includes('domestic wire transfers') && v === '$5,000') return 'wire_transfer_min_order';
  if (s.includes('wire processing fee') && v === '$25') return 'wire_transfer_fee';
  if (s.includes('returned transfer fee') && v === '$15') return 'ach_nsf_returned_fee';
  if (s.includes('paid via bank transfer are cancelled or refunded') && v === '3 business days') return 'refund_processing_ach';

  // Notifications
  if (s.includes('dispatch notification') && v === '4 hours') return 'notification_dispatch_delay';
  if (s.includes('delivery exception alerts') && v === '2 hours') return 'notification_transit_exception_delay';
  if (s.includes('unsubscribe request') && v === '24 hours') return 'notification_unsubscribe_effect';
  if (s.includes('can-spam') && v === '10 business days') return 'notification_can_spam_max';

  // Payments FAQ
  if (s.includes('subscription renewal charge fails') && v === '7 days') return 'subscription_retry_max_days';
  if (s.includes('authorization holds expire automatically after 7 days')) return 'payment_auth_hold_expiry_days';
  if (s.includes('initial authorization amount can exceed') && v === '20%') return 'payment_auth_buffer_max_pct';
  if (s.includes('debit card holds may take 3 to 5 business days')) return 'debit_hold_release_window';
  if (s.includes('locks the payment card from further checkout retries for 24 hours')) return 'payment_card_retry_lockout_hours';
  if (s.includes('hard declines require a mandatory 24-hour waiting period')) return 'payment_hard_decline_cooldown_hours';
  if (s.includes('foreign currency conversion fees') && (v === '1%' || v === '3%')) return 'fx_issuer_fee_range';
  if (s.includes('experiencing payment failure are held securely for 72 hours')) return 'payment_failure_order_hold_hours';
  if (s.includes('three consecutive failed transaction attempts') && v === '48 hours') return 'checkout_account_lockout_hours';
  if (s.includes('3-d secure') && v === '$250') return 'threeds_challenge_threshold';

  // Privacy
  if (s.includes('transactional order data') && s.includes('7 years')) return 'data_retention_order_records';
  if (s.includes('customer service records') && s.includes('3 years')) return 'data_retention_support_records';
  if (s.includes('marketing telemetry') && s.includes('2 years')) return 'data_retention_marketing_telemetry';
  if (s.includes('at least 18 years of age')) return 'account_min_age_majority';
  if (s.includes('minor under 13') && v === '5 business days') return 'minor_account_deletion_sla';
  if (s.includes('13 and 17 years of age') && v === '17 years') return 'adolescent_consent_max_age';

  // Refunds & Returns
  if (s.includes('formal refund approval decision within 48 hours')) return 'return_inspection_decision_sla';
  if (s.includes('credited back to the original funding source within 5 to 7 business days') || s.includes('standard refund processing requires 5 to 7 business days')) {
    return 'refund_processing_standard';
  }
  if (s.includes('ach) typically settle within 3 business days')) return 'refund_processing_ach';
  if (s.includes('missing components') && v === '25%') return 'return_deduction_missing_components';
  if (s.includes('damaged, torn, or defaced manufacturer packaging') && v === '15%') return 'return_deduction_damaged_packaging';
  if (s.includes('50% restocking fee') && v === '50%') return 'restocking_fee_late_return';
  if (s.includes('30-day window') && v === '30 days') return 'return_window_standard';
  if (s.includes('30-day return window') && v === '30 days') return 'return_window_standard';
  if (s.includes('fails to meet baseline inspection') && v === '60%') return 'refund_rate_failed_inspection';
  if (s.includes('via paypal are returned') && v === '48 hours') return 'refund_processing_paypal';
  if (s.includes('challenge a refund determination') && v === '60 days') return 'dispute_filing_window';
  if (s.includes('submitted dispute cases are thoroughly investigated') && v === '5 business days') return 'dispute_refund_execution_sla';
  if (s.includes('manual refund re-issue within 24 hours')) return 'dispute_manual_reissue_sla';
  if (s.includes('standard customer returns are accepted within 30 days')) return 'return_window_standard';
  if (s.includes('electronics and appliances') && v === '15 days') return 'return_window_electronics';
  if (s.includes('14-day advance notice') && v === '14 days') return 'return_notice_bulk';
  if (s.includes('first item') && v === '$6.95') return 'shipping_return_first_item';
  if (s.includes('subsequent item') && v === '$2.50') return 'shipping_return_additional_item';
  if (s.includes('prepaid return shipping label') && v === '24 hours') return 'return_label_availability_sla';
  if (s.includes('returned package carrying a value exceeding $500')) return 'return_high_value_signature_threshold';

  // Shipping FAQ
  if (s.includes('standard shipping delivers within 5 to 7 business days') && v === '5 to 7 business days') return 'shipping_standard_transit';
  if (s.includes('standard shipping') && v === '$50') return 'shipping_standard_min_order_free';
  if (s.includes('expedited shipping') && v === '2 to 3 business days') return 'shipping_expedited_transit';
  if (s.includes('expedited shipping') && v === '$9.95') return 'shipping_expedited_fee';
  if (s.includes('next-day shipping') && v === '1 business day') return 'shipping_nextday_transit';
  if (s.includes('next-day shipping') && v === '$19.95') return 'shipping_nextday_fee';
  if (s.includes('pick, verify, and pack') && v === '24 hours') return 'warehouse_pick_pack_sla';
  if (s.includes('carrier tracking numbers activate within 4 hours')) return 'shipping_tracking_activation_sla';
  if (s.includes('carrier will return the package') && v === '7 days') return 'carrier_hold_before_rto_days';
  if (s.includes('international delivery typically takes 10 to 21 business days')) return 'shipping_international_transit';
  if (s.includes('international orders valued over $200')) return 'shipping_international_signature_threshold';
  if (s.includes('international shipping starts at a base rate of $24.95')) return 'shipping_international_base_fee';
  if (s.includes('package protection insurance') && v === '1.5%') return 'shipping_insurance_rate_pct';
  if (s.includes('package was stolen') && v === '$100') return 'shipping_stolen_police_report_threshold';
  if (s.includes('damage claims must be filed') && v === '48 hours') return 'shipping_damage_claim_window';
  if (s.includes('covers 100% of verified transit loss') && v === '100%') return 'shipping_insured_coverage_pct';
  if (s.includes('without insurance, coverage is limited') && v === '$100') return 'shipping_uninsured_max_coverage';
  if (s.includes('replacement order is dispatched at no cost within 3 business days')) return 'shipping_claim_replacement_dispatch_sla';

  throw new Error(`UNCLASSIFIED_FACT: value="${value}" in "${sentence}"`);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateFacts(facts: PolicyFact[], sourceTexts: Map<string, string>): void {
  const byConcept = new Map<string, Set<string>>();

  for (const f of facts) {
    if (f.concept.endsWith('_numeric_fact')) {
      throw new Error(`VALIDATION_FAIL: Placeholder concept name "${f.concept}"`);
    }
    if (/^\s|\s$/.test(f.value) || f.value.endsWith(',')) {
      throw new Error(`VALIDATION_FAIL: Malformed value "${f.value}" in ${f.concept}`);
    }
    const numberToken = /\d[\d,.]*/.exec(f.value)?.[0] ?? f.value;
    if (!f.raw_excerpt.includes(numberToken)) {
      throw new Error(`VALIDATION_FAIL: Number "${numberToken}" from value "${f.value}" missing in excerpt "${f.raw_excerpt}"`);
    }

    const src = sourceTexts.get(f.source_file) ?? '';
    if (!src.includes(f.raw_excerpt)) {
      throw new Error(`VALIDATION_FAIL: Excerpt not verbatim in ${f.source_file}: "${f.raw_excerpt}"`);
    }

    const set = byConcept.get(f.concept) ?? new Set<string>();
    set.add(f.value);
    byConcept.set(f.concept, set);
  }

  for (const [concept, values] of byConcept.entries()) {
    if (values.size > 2) {
      throw new Error(
        `VALIDATION_FAIL: Concept "${concept}" has ${values.size} distinct values (> 2): ${[...values].join(', ')}`
      );
    }
  }
}

function main(): void {
  const srcDir = path.resolve(process.cwd(), '../docs/knowledge-base/src');
  const outPath = path.resolve(process.cwd(), '../docs/knowledge-base/fact-sheet.json');

  const facts: PolicyFact[] = [];
  const sourceTexts = new Map<string, string>();

  for (const file of FROZEN_FILES) {
    const fullPath = path.join(srcDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing frozen doc: ${fullPath}`);
    }

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(raw);
    const docId = String(data.docId);
    sourceTexts.set(file, content.replace(/\s+/g, ' '));

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
          const val = normalizeExtractedValue(m);
          const unitMatch = val.match(/([a-zA-Z%$]+)\s*$/);
          const unit = val.startsWith('$') ? 'USD' : (unitMatch?.[1] ?? 'value').toLowerCase();
          facts.push({
            concept: inferConcept(sentence, val),
            value: val,
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

  validateFacts(facts, sourceTexts);

  const byConcept = new Map<string, Set<string>>();
  for (const f of facts) {
    const set = byConcept.get(f.concept) ?? new Set<string>();
    set.add(f.value);
    byConcept.set(f.concept, set);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    frozenDocCount: FROZEN_FILES.length,
    factCount: facts.length,
    conceptCount: byConcept.size,
    facts,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Extracted & validated ${facts.length} facts across ${byConcept.size} specific concepts -> ${outPath}\n`);

  console.log('concept | distinct_values | values');
  for (const [concept, values] of [...byConcept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${concept} | ${values.size} | ${[...values].join(' ; ')}`);
  }
}

main();
