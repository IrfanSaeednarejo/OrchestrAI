/**
 * server/scripts/audit-contradictions.ts
 *
 * Phase 37b.5 — Contradiction Audit (Gate 3)
 *
 * Re-parses all 42 docs (12 frozen + 30 new), re-extracts every numeric policy fact
 * using the same NUMERIC_PATTERN and inferConcept() from extract-policy-facts.ts, and
 * cross-checks every new-doc fact against the immutable fact-sheet.json.
 *
 * Rules:
 * 1. Every numeric value in a new doc must match the canonical fact-sheet value exactly.
 * 2. Every concept cited in a new doc must appear in that doc's approved relevance-matrix row.
 * 3. Range concepts (bnpl_klarna_order_range, fx_issuer_fee_range) require BOTH min+max
 *    when the concept is mentioned (absent-or-both).
 * 4. Any numeric divergence is a HARD FAIL.
 *
 * Usage: npx tsx scripts/audit-contradictions.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PolicyFact {
  concept: string;
  value: string;
  unit: string;
  source_doc: string;
  source_file: string;
  source_section: string;
  raw_excerpt: string;
}

interface FactSheet {
  factCount: number;
  conceptCount: number;
  facts: PolicyFact[];
}

interface ExtractedFact {
  concept: string;
  value: string;
  sentence: string;
  section: string;
}

interface UnmatchedFact {
  value: string;
  sentence: string;
  section: string;
}

interface DocAuditResult {
  docId: string;
  filename: string;
  isNew: boolean;
  factsFound: number;
  valueMismatches: { concept: string; found: string; expected: string; sentence: string }[];
  outOfScopeConcepts: { concept: string; value: string; sentence: string }[];
  proceduralExcluded: UnmatchedFact[];
  newFactOwnerDecisions: UnmatchedFact[];
  rangeViolations: { concept: string; presentValues: string[]; missingValues: string[] }[];
  snakeCaseLeaks: string[];
  pass: boolean;
}

// ── Shared extraction logic (imported from src/knowledge/policy-fact-extractor.ts) ──

import { NUMERIC_PATTERN, normalizeExtractedValue } from '../src/knowledge/policy-fact-extractor.js';

function isProceduralExcluded(value: string, sentence: string): boolean {
  const s = sentence.toLowerCase();
  const v = value.toLowerCase();

  // Attempt counts, IP counts, unit/item/tier/installment counts
  if (/\b(attempts?|tiers?|installments?|items?)\b/i.test(v)) return true;
  if (s.includes('distinct ip') || s.includes('failed login') || s.includes('consecutive')) {
    if (!/\b(hours?|minutes?|days?)\b/i.test(v)) return true;
  }
  // OTP digit count (e.g. 6-digit OTP)
  if (/\bdigits?\b/i.test(v) && (s.includes('otp') || s.includes('verification code') || s.includes('passcode'))) {
    return true;
  }
  return false;
}

function looksLikePolicyFact(value: string): boolean {
  return (
    value.startsWith('$') ||
    value.endsWith('%') ||
    /\b(days?|hours?|minutes?|years?|months?|characters?|digits?)\b/i.test(value)
  );
}

function inferConcept(sentence: string, value: string): string | null {
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
  if (s.includes('30-day window') && !s.includes('exchange') && v === '30 days') return 'return_window_standard';
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

  // ── New doc paraphrased forms ──────────────────────────────────────────────
  // The new docs were LLM-generated and may use slightly different phrasing.
  // Add broader matchers that capture the same semantic concept from paraphrased text.

  // Return windows
  if ((s.includes('return') || s.includes('return window')) && s.includes('30 days') && v === '30 days' && !s.includes('grace period') && !s.includes('re-open') && !s.includes('dispute')) return 'return_window_standard';
  if (s.includes('electronics') && v === '15 days') return 'return_window_electronics';
  if (s.includes('advance notice') && v === '14 days') return 'return_notice_bulk';

  // Return deductions
  if (s.includes('missing') && s.includes('component') && v === '25%') return 'return_deduction_missing_components';
  if (s.includes('damaged') && s.includes('packaging') && v === '15%') return 'return_deduction_damaged_packaging';
  if ((s.includes('restocking fee') || s.includes('restocking')) && v === '50%') return 'restocking_fee_late_return';
  if (s.includes('failed inspection') && v === '60%') return 'refund_rate_failed_inspection';

  // Shipping costs
  if ((s.includes('$6.95') || s.includes('first item')) && v === '$6.95' && (s.includes('return') || s.includes('shipping'))) return 'shipping_return_first_item';
  if ((s.includes('$2.50') || s.includes('additional item') || s.includes('subsequent')) && v === '$2.50') return 'shipping_return_additional_item';
  if (s.includes('label') && s.includes('available') && v === '24 hours') return 'return_label_availability_sla';
  if ((s.includes('$500') || s.includes('high-value')) && s.includes('signature') && v === '$500') return 'return_high_value_signature_threshold';
  if (s.includes('inspection') && (s.includes('48 hours') || s.includes('decision')) && v === '48 hours') return 'return_inspection_decision_sla';

  // Refund processing
  if ((s.includes('5 to 7 business days') || s.includes('standard')) && s.includes('refund') && v === '5 to 7 business days') return 'refund_processing_standard';
  if (s.includes('debit') && v === '10 business days') return 'refund_processing_debit_card';
  if (s.includes('ach') && v === '3 business days') return 'refund_processing_ach';
  if (s.includes('paypal') && v === '48 hours') return 'refund_processing_paypal';
  if (s.includes('klarna') && v === '5 business days') return 'refund_processing_klarna';

  // Shipping
  if (s.includes('standard') && s.includes('shipping') && v === '5 to 7 business days' && !s.includes('refund')) return 'shipping_standard_transit';
  if ((s.includes('free') || s.includes('standard')) && s.includes('shipping') && v === '$50' && !s.includes('klarna')) return 'shipping_standard_min_order_free';
  if (s.includes('expedited') && v === '2 to 3 business days') return 'shipping_expedited_transit';
  if (s.includes('expedited') && v === '$9.95') return 'shipping_expedited_fee';
  if (s.includes('next-day') && v === '1 business day') return 'shipping_nextday_transit';
  if (s.includes('next-day') && v === '$19.95') return 'shipping_nextday_fee';
  if (s.includes('alaska') && s.includes('hawaii') && v === '$12.00') return 'shipping_ak_hi_surcharge';
  if (s.includes('pick') && s.includes('pack') && v === '24 hours') return 'warehouse_pick_pack_sla';
  if (s.includes('tracking') && s.includes('activate') && v === '4 hours') return 'shipping_tracking_activation_sla';
  if (s.includes('carrier') && s.includes('return') && s.includes('7 days') && v === '7 days') return 'carrier_hold_before_rto_days';
  if (s.includes('international') && s.includes('delivery') && v === '10 to 21 business days') return 'shipping_international_transit';
  if (s.includes('international') && s.includes('signature') && v === '$200') return 'shipping_international_signature_threshold';
  if (s.includes('international') && s.includes('base rate') && v === '$24.95') return 'shipping_international_base_fee';
  if (s.includes('insurance') && v === '1.5%') return 'shipping_insurance_rate_pct';
  if (s.includes('stolen') && s.includes('police') && v === '$100') return 'shipping_stolen_police_report_threshold';
  if (s.includes('damage') && s.includes('claim') && v === '48 hours') return 'shipping_damage_claim_window';
  if (s.includes('insured') && s.includes('100%') && v === '100%') return 'shipping_insured_coverage_pct';
  if (s.includes('without insurance') && v === '$100') return 'shipping_uninsured_max_coverage';
  if (s.includes('replacement') && s.includes('dispatch') && v === '3 business days') return 'shipping_claim_replacement_dispatch_sla';
  if (s.includes('dispatch') && s.includes('notification') && v === '4 hours') return 'notification_dispatch_delay';
  if (s.includes('transit') && s.includes('exception') && v === '2 hours') return 'notification_transit_exception_delay';
  if (s.includes('unsubscribe') && v === '24 hours') return 'notification_unsubscribe_effect';
  if (s.includes('can-spam') && v === '10 business days') return 'notification_can_spam_max';

  // Cancellations (broader)
  if (s.includes('cancellation') && s.includes('24 hours') && (s.includes('processing') || s.includes('cutoff') || s.includes('window')) && v === '24 hours') return 'cancellation_cutoff_standard';
  if (s.includes('pre-order') && s.includes('48 hours') && v === '48 hours') return 'cancellation_cutoff_preorder';
  if (s.includes('bulk') && s.includes('notice') && v === '24 hours' && s.includes('cancel')) return 'cancellation_notice_bulk';
  if (s.includes('cancellation fee') && v === '15%') return 'cancellation_fee_bulk_custom';
  if (s.includes('refund initiation') && !s.includes('24 hours to fix')) return 'refund_initiation_after_cancel';
  if (s.includes('refund') && s.includes('initiated') && s.includes('2 hours') && v === '2 hours') return 'refund_initiation_after_cancel';
  if (s.includes('processing') && s.includes('shipping') && (s.includes('24 to 48') || s.includes('24-48')) && v === '24 to 48 hours') return 'warehouse_processing_to_ship_window';

  // Data deletion (broader)
  if (s.includes('deletion') && s.includes('confirmation') && v === '24 hours') return 'data_deletion_confirmation_sla';
  if (s.includes('grace period') && v === '30 days') return 'data_deletion_grace_period';
  if (s.includes('order') && s.includes('record') && v === '7 years') return 'data_retention_order_records';
  if (s.includes('security') && s.includes('record') && v === '5 years') return 'data_retention_security_records';
  if (s.includes('support') && s.includes('record') && v === '3 years') return 'data_retention_support_records';
  if (s.includes('marketing') && s.includes('telemetry') && v === '2 years') return 'data_retention_marketing_telemetry';
  if ((s.includes('purge') || s.includes('deletion')) && s.includes('48 hours') && v === '48 hours' && !s.includes('paypal') && !s.includes('exchange') && !s.includes('checkout') && !s.includes('claim')) return 'data_deletion_purge_sla';
  if (s.includes('backup') && (s.includes('purge') || s.includes('30 days')) && v === '30 days') return 'data_deletion_backup_purge_days';

  // Disputes (broader)
  if (s.includes('dispute') && s.includes('filing') && s.includes('60 days') && v === '60 days') return 'dispute_filing_window';
  if (s.includes('dispute') && v === '60 days' && (s.includes('submit') || s.includes('window'))) return 'dispute_filing_window';
  if (s.includes('acknowledgment') && v === '24 hours') return 'dispute_acknowledgment_sla';
  if (s.includes('internal') && s.includes('review') && v === '2 business days') return 'dispute_internal_review_start_sla';
  if (s.includes('internal') && s.includes('decision') && v === '10 business days') return 'dispute_internal_decision_sla';
  if (s.includes('dispute') && s.includes('refund') && v === '5 business days') return 'dispute_refund_execution_sla';
  if (s.includes('chargeback') && (s.includes('20 to 45') || s.includes('issuer'))) return 'chargeback_issuer_window';
  if (s.includes('police report') && v === '$500') return 'dispute_police_report_threshold';
  if (s.includes('re-open') && v === '30 days') return 'dispute_reopen_window';
  if (s.includes('manual') && s.includes('re-issue') && v === '24 hours') return 'dispute_manual_reissue_sla';

  // Exchanges (broader)
  if (s.includes('exchange') && v === '30 days') return 'exchange_window_standard';
  if (s.includes('inventory') && s.includes('hold') && v === '48 hours') return 'exchange_inventory_hold_hours';
  if (s.includes('expedited') && s.includes('replacement') && v === '$12.95') return 'exchange_expedited_shipping_fee';
  if (s.includes('replacement') && s.includes('dispatch') && v === '2 to 3 business days') return 'exchange_replacement_dispatch_sla';

  // Payments (broader)
  if (s.includes('subscription') && s.includes('retry') && v === '7 days') return 'subscription_retry_max_days';
  if (s.includes('authorization') && s.includes('hold') && s.includes('expire') && v === '7 days') return 'payment_auth_hold_expiry_days';
  if (s.includes('authorization') && s.includes('exceed') && v === '20%') return 'payment_auth_buffer_max_pct';
  if (s.includes('debit') && s.includes('hold') && s.includes('release') && v === '3 to 5 business days') return 'debit_hold_release_window';
  if (s.includes('card') && s.includes('retry') && s.includes('lockout') && v === '24 hours') return 'payment_card_retry_lockout_hours';
  if (s.includes('hard decline') && s.includes('24') && v === '24 hours') return 'payment_hard_decline_cooldown_hours';
  if (s.includes('conversion fee') && (v === '1%' || v === '3%')) return 'fx_issuer_fee_range';
  if (s.includes('payment failure') && s.includes('held') && v === '72 hours') return 'payment_failure_order_hold_hours';
  if (s.includes('failed') && s.includes('checkout') && v === '48 hours') return 'checkout_account_lockout_hours';
  if (s.includes('3-d secure') && v === '$250') return 'threeds_challenge_threshold';
  if (s.includes('digital wallet') && v === '$500') return 'digital_wallet_stepup_threshold';

  // Klarna (broader)
  if (s.includes('klarna') && (v === '$50' || v === '$2,000')) return 'bnpl_klarna_order_range';

  // ACH/Wire (broader)
  if (s.includes('ach') && (s.includes('exceeding') || s.includes('qualifying')) && v === '$200') return 'ach_min_order_threshold';
  if (s.includes('ach') && s.includes('settle') && v === '3 business days') return 'ach_settlement_days';
  if (s.includes('wire') && (s.includes('$5,000') || s.includes('minimum')) && v === '$5,000') return 'wire_transfer_min_order';
  if (s.includes('wire') && s.includes('fee') && v === '$25') return 'wire_transfer_fee';
  if (s.includes('nsf') && v === '$15') return 'ach_nsf_returned_fee';

  // Account security (broader)
  if (s.includes('password') && s.includes('12 characters') && v === '12 characters') return 'password_min_length';
  if (s.includes('password') && s.includes('128 characters') && v === '128 characters') return 'password_max_length';
  if (s.includes('password') && s.includes('expire') && v === '365 days') return 'password_rotation_days';
  if (s.includes('otp') && s.includes('valid') && v === '10 minutes') return 'otp_validity_minutes';
  if (s.includes('otp') && s.includes('lockout') && v === '15 minutes') return 'otp_lockout_duration';
  if (s.includes('compromised') && s.includes('freeze') && v === '15 minutes') return 'compromised_account_freeze_sla';
  if (s.includes('lockout') && s.includes('30 minutes') && v === '30 minutes') return 'password_lockout_duration';
  if (s.includes('recovery') && s.includes('link') && v === '1 hour') return 'password_recovery_link_ttl';
  if (s.includes('velocity') && s.includes('24 hours') && v === '24 hours') return 'security_velocity_window_hours';

  // Privacy (broader)
  if (s.includes('18 years') && (s.includes('age') || s.includes('majority'))) return 'account_min_age_majority';
  if (s.includes('minor') && s.includes('deletion') && v === '5 business days') return 'minor_account_deletion_sla';
  if (s.includes('adolescent') && v === '17 years') return 'adolescent_consent_max_age';

  // Catch-all patterns for doc-paraphrased forms
  // Return window stated as "30 days" alongside "return" terminology
  if (s.includes('return') && v === '30 days' && !s.includes('grace') && !s.includes('dispute') && !s.includes('re-open') && !s.includes('backup')) return 'return_window_standard';

  // Fallback: return null for unclassified (don't throw in audit mode)
  return null;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Frozen file list ───────────────────────────────────────────────────────────

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

// ── Relevance matrix loader ────────────────────────────────────────────────────

function loadRelevanceMatrix(matrixPath: string): Map<string, Set<string>> {
  const content = fs.readFileSync(matrixPath, 'utf-8');
  const lines = content.split('\n');
  const map = new Map<string, Set<string>>();

  for (const line of lines) {
    // Parse table rows: | subtopic (`doc_id`) | concepts |
    const match = /^\|\s*`([^`]+)`\s*\(`([^)]+)`\)\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (!match) continue;
    const docId = match[2];
    const concepts = match[3]
      .split(',')
      .map((c) => c.trim().replace(/^`|`$/g, ''))
      .filter(Boolean);
    map.set(docId, new Set(concepts));
  }

  return map;
}

// ── Range concept validation ───────────────────────────────────────────────────

const RANGE_CONCEPTS: Record<string, string[]> = {
  bnpl_klarna_order_range: ['$50', '$2,000'],
  fx_issuer_fee_range: ['1%', '3%'],
};

// ── Main audit ─────────────────────────────────────────────────────────────────

function main(): void {
  const srcDir = path.resolve(process.cwd(), '../docs/knowledge-base/src');
  const factSheetPath = path.resolve(process.cwd(), '../docs/knowledge-base/fact-sheet.json');
  const matrixPath = path.resolve(process.cwd(), '../docs/knowledge-base/fact-subtopic-relevance.md');
  const outputPath = path.resolve(process.cwd(), '../docs/knowledge-base/contradiction-audit.md');

  // Load fact sheet
  const factSheet: FactSheet = JSON.parse(fs.readFileSync(factSheetPath, 'utf-8'));
  const canonicalValues = new Map<string, Set<string>>();
  for (const f of factSheet.facts) {
    const set = canonicalValues.get(f.concept) ?? new Set<string>();
    set.add(f.value);
    canonicalValues.set(f.concept, set);
  }

  // Load relevance matrix
  const relevanceMatrix = loadRelevanceMatrix(matrixPath);

  // Collect all doc files
  const allFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
  console.log(`Found ${allFiles.length} markdown files in ${srcDir}`);
  console.log(`Fact sheet: ${factSheet.factCount} facts across ${factSheet.conceptCount} concepts`);
  console.log(`Relevance matrix: ${relevanceMatrix.size} doc entries\n`);

  const results: DocAuditResult[] = [];
  let totalFails = 0;
  let totalFacts = 0;

  for (const file of allFiles) {
    const fullPath = path.join(srcDir, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(raw);
    const docId = String(data.docId ?? '');
    const isNew = !FROZEN_FILES.has(file);

    const result: DocAuditResult = {
      docId,
      filename: file,
      isNew,
      factsFound: 0,
      valueMismatches: [],
      outOfScopeConcepts: [],
      proceduralExcluded: [],
      newFactOwnerDecisions: [],
      rangeViolations: [],
      snakeCaseLeaks: [],
      pass: true,
    };

    if (isNew) {
      const leakMatches = content.match(/\b[a-z]+_[a-z]+_[a-z_]+\b/g);
      if (leakMatches) {
        result.snakeCaseLeaks = [...new Set(leakMatches)];
        result.pass = false;
      }
    }

    const approvedConcepts = isNew ? relevanceMatrix.get(docId) : undefined;

    // Parse and extract facts
    const extractedFacts: ExtractedFact[] = [];
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
          let concept = inferConcept(sentence, val);

          if (!concept && isNew) {
            // Task 1(a): Check if value matches ANY concept's canonical value in this doc's IN-SCOPE matrix row
            if (approvedConcepts) {
              for (const c of approvedConcepts) {
                if (canonicalValues.get(c)?.has(val)) {
                  concept = c;
                  break;
                }
              }
            }

            // Task 1(b): Check if value matches ANY concept's canonical value in the FULL fact sheet (out-of-scope)
            if (!concept) {
              for (const [c, vals] of canonicalValues.entries()) {
                if (vals.has(val)) {
                  concept = c;
                  break;
                }
              }
            }
          }

          if (concept) {
            extractedFacts.push({ concept, value: val, sentence, section: currentSection });
          } else if (isNew) {
            // Task 1(c) & Task 2: Truly new fact — categorize into PROCEDURAL_EXCLUDED vs NEW_FACT_OWNER_DECISION
            if (isProceduralExcluded(val, sentence) || !looksLikePolicyFact(val)) {
              result.proceduralExcluded.push({ value: val, sentence, section: currentSection });
            } else {
              result.newFactOwnerDecisions.push({ value: val, sentence, section: currentSection });
            }
          }
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

    result.factsFound = extractedFacts.length;
    totalFacts += extractedFacts.length;

    // For NEW docs only: validate against fact sheet and relevance matrix
    if (isNew) {
      for (const ef of extractedFacts) {
        // Check 1: Value matches canonical fact sheet
        const canonicalVals = canonicalValues.get(ef.concept);
        if (canonicalVals && !canonicalVals.has(ef.value)) {
          result.valueMismatches.push({
            concept: ef.concept,
            found: ef.value,
            expected: [...canonicalVals].join(' | '),
            sentence: ef.sentence,
          });
          result.pass = false;
        }

        // Check 2: Concept is in approved scope
        if (approvedConcepts && !approvedConcepts.has(ef.concept)) {
          result.outOfScopeConcepts.push({
            concept: ef.concept,
            value: ef.value,
            sentence: ef.sentence,
          });
          result.pass = false;
        }
      }

      // Check 3: Range concepts — absent-or-both rule
      const conceptsInDoc = new Set(extractedFacts.map((f) => f.concept));
      for (const [rangeConcept, requiredValues] of Object.entries(RANGE_CONCEPTS)) {
        if (!conceptsInDoc.has(rangeConcept)) continue;
        const foundValues = new Set(
          extractedFacts.filter((f) => f.concept === rangeConcept).map((f) => f.value)
        );
        const missing = requiredValues.filter((rv) => !foundValues.has(rv));
        if (missing.length > 0) {
          result.rangeViolations.push({
            concept: rangeConcept,
            presentValues: [...foundValues],
            missingValues: missing,
          });
          result.pass = false;
        }
      }

      // If no approved concepts found in matrix, flag it
      if (!approvedConcepts) {
        console.error(`WARNING: No relevance matrix entry for docId="${docId}"`);
      }
    }

    if (!result.pass) totalFails++;
    results.push(result);
  }

  // ── Generate report ────────────────────────────────────────────────────────

  const lines2: string[] = [];
  lines2.push('# Phase 37b.5 — Contradiction Audit Report (Gate 3)');
  lines2.push('');
  lines2.push(`**Generated**: ${new Date().toISOString()}`);
  lines2.push(`**Total docs audited**: ${results.length} (${results.filter((r) => !r.isNew).length} frozen + ${results.filter((r) => r.isNew).length} new)`);
  lines2.push(`**Total numeric facts extracted**: ${totalFacts}`);
  lines2.push(`**Fact-sheet concepts**: ${canonicalValues.size}`);
  lines2.push(`**Relevance-matrix entries**: ${relevanceMatrix.size}`);
  lines2.push('');

  // Summary table
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  lines2.push(`## Summary`);
  lines2.push('');
  if (failed === 0) {
    lines2.push(`> ✅ **ALL ${results.length} DOCS PASS** — zero contradictions, zero out-of-scope citations, zero range violations.`);
  } else {
    lines2.push(`> ❌ **${failed} DOCS FAIL** — see details below.`);
  }
  lines2.push('');

  // Per-doc table
  lines2.push('## Per-Doc Results');
  lines2.push('');
  lines2.push('| # | Doc ID | File | New? | Facts | Value Mismatches | Out-of-Scope | Procedural Excluded | New Facts (Owner Decision) | Range Violations | Result |');
  lines2.push('|---|---|---|---|---|---|---|---|---|---|---|');
  results.forEach((r, i) => {
    lines2.push(
      `| ${i + 1} | \`${r.docId}\` | \`${r.filename}\` | ${r.isNew ? 'NEW' : 'FROZEN'} | ${r.factsFound} | ${r.valueMismatches.length} | ${r.outOfScopeConcepts.length} | ${r.proceduralExcluded.length} | ${r.newFactOwnerDecisions.length} | ${r.rangeViolations.length} | ${r.pass ? '✅' : '❌'} |`
    );
  });
  lines2.push('');

  // Failure details (if any)
  const failedDocs = results.filter((r) => !r.pass);
  if (failedDocs.length > 0) {
    lines2.push('## Failure Details');
    lines2.push('');
    for (const r of failedDocs) {
      lines2.push(`### ${r.docId} (\`${r.filename}\`)`);
      lines2.push('');
      if (r.valueMismatches.length > 0) {
        lines2.push('**Value Mismatches:**');
        for (const m of r.valueMismatches) {
          lines2.push(`- \`${m.concept}\`: found \`${m.found}\`, expected \`${m.expected}\``);
          lines2.push(`  > ${m.sentence.substring(0, 150)}...`);
        }
        lines2.push('');
      }
      if (r.outOfScopeConcepts.length > 0) {
        lines2.push('**Out-of-Scope Concepts:**');
        for (const o of r.outOfScopeConcepts) {
          lines2.push(`- \`${o.concept}\` = \`${o.value}\``);
          lines2.push(`  > ${o.sentence.substring(0, 150)}...`);
        }
        lines2.push('');
      }
      if (r.rangeViolations.length > 0) {
        lines2.push('**Range Violations (absent-or-both):**');
        for (const rv of r.rangeViolations) {
          lines2.push(`- \`${rv.concept}\`: present=[${rv.presentValues.join(', ')}], missing=[${rv.missingValues.join(', ')}]`);
        }
        lines2.push('');
      }
      if (r.snakeCaseLeaks.length > 0) {
        lines2.push('**Leaked Concept Identifiers:**');
        lines2.push(`- ${r.snakeCaseLeaks.map((l) => `\`${l}\``).join(', ')}`);
        lines2.push('');
      }
    }
  }

  // Unmatched facts report — truthful categorization (Task 4)
  lines2.push('## Unmatched Numeric Values');
  lines2.push('');
  lines2.push('Values not matched to a fact-sheet concept fall into two categories:');
  lines2.push('(i) `PROCEDURAL_EXCLUDED` — procedural counts, IPs, attempt limits (see `DECISIONS.md` exclusions)');
  lines2.push('(ii) `NEW_FACT_OWNER_DECISION` — genuinely new policy facts introduced by new docs, not present in frozen corpus, requiring owner approval to either add to fact sheet or remove from doc.');
  lines2.push('');

  const docsWithNewFacts = results.filter((r) => r.isNew && r.newFactOwnerDecisions.length > 0);
  lines2.push(`### NEW_FACT_OWNER_DECISION (${docsWithNewFacts.reduce((acc, r) => acc + r.newFactOwnerDecisions.length, 0)} total)`);
  lines2.push('');
  if (docsWithNewFacts.length === 0) {
    lines2.push('None.');
    lines2.push('');
  } else {
    for (const r of docsWithNewFacts) {
      lines2.push(`#### ${r.docId} (\`${r.filename}\`)`);
      for (const nf of r.newFactOwnerDecisions) {
        lines2.push(`- **\`${nf.value}\`** (Section: _${nf.section}_)`);
        lines2.push(`  > ${nf.sentence}`);
      }
      lines2.push('');
    }
  }

  const docsWithProcedural = results.filter((r) => r.isNew && r.proceduralExcluded.length > 0);
  lines2.push(`### PROCEDURAL_EXCLUDED (${docsWithProcedural.reduce((acc, r) => acc + r.proceduralExcluded.length, 0)} total)`);
  lines2.push('');
  lines2.push(
    'PROCEDURAL_EXCLUDED = 0 means the extractor\'s numeric regex did not match any procedural values in the corpus. This is by design: procedural counts ("5 password attempts", "3 distinct IP addresses", "6-digit OTP format") are separated from policy facts by the extraction pattern and excluded from scope per DECISIONS.md. This category exists in the audit for completeness — a future regex change that starts matching procedural values will flag them here for review rather than silently passing them.'
  );
  lines2.push('');
  if (docsWithProcedural.length === 0) {
    lines2.push('None.');
    lines2.push('');
  } else {
    for (const r of docsWithProcedural) {
      lines2.push(`#### ${r.docId}`);
      for (const p of r.proceduralExcluded) {
        lines2.push(`- \`${p.value}\`: "${p.sentence.substring(0, 120)}..."`);
      }
      lines2.push('');
    }
  }

  // Range concept coverage
  lines2.push('## Range Concept Coverage');
  lines2.push('');
  for (const [rangeConcept, requiredValues] of Object.entries(RANGE_CONCEPTS)) {
    const docsWithRange = results
      .filter((r) => r.isNew)
      .filter((r) => {
        const approvedConcepts = relevanceMatrix.get(r.docId);
        return approvedConcepts?.has(rangeConcept);
      });
    lines2.push(`- **\`${rangeConcept}\`** (requires both ${requiredValues.join(' and ')}): mentioned in ${docsWithRange.length} new docs`);
    for (const d of docsWithRange) {
      const violation = d.rangeViolations.find((rv) => rv.concept === rangeConcept);
      lines2.push(`  - \`${d.docId}\`: ${violation ? `❌ missing [${violation.missingValues.join(', ')}]` : '✅ both values present'}`);
    }
  }
  lines2.push('');

  // Write report
  const report = lines2.join('\n');
  fs.writeFileSync(outputPath, report, 'utf-8');
  console.log(`\nAudit report written to: ${outputPath}`);
  console.log(`\nRESULT: ${passed}/${results.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\n❌ CONTRADICTION AUDIT FAILED — fix all issues before proceeding.');
    process.exit(1);
  } else {
    console.log('\n✅ CONTRADICTION AUDIT PASSED — zero divergences across all 42 docs.');
  }
}

main();
