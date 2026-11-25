# Brief: faq-account-del-legal-holds-003

## Metadata
- doc_id: faq-account-del-legal-holds-003
- domain: account
- topic: data_deletion
- subtopic: legal-holds
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-data_deletion-legal-holds.md

## Subtopic intent
Statutory tax/audit retention exemptions, open-order or pending-refund deletion blocks, and anonymized ledger records. This document answers customer and support questions specific to legal holds within account/data_deletion. Does not cover self-service deletion UI steps, grace-period reactivation, or OTP verification.

## Section outline (each = one chunk, ~700-800 chars)
1. Why can an account deletion request be blocked or delayed by open orders?
   Reader question: Why can an account deletion request be blocked or delayed by open orders?
   Key points:
     - Explain active shipment, pending return, or open refund blocks
     - Instruct completing or cancelling open transactions first
2. How do pending payment disputes or chargebacks affect deletion?
   Reader question: How do pending payment disputes or chargebacks affect deletion?
   Key points:
     - Explain mandatory hold while chargeback or billing dispute is active
     - Allow re-submission once dispute resolves
3. Which records must Northvale retain even after account deletion?
   Reader question: Which records must Northvale retain even after account deletion?
   Key points:
     - Distinguish profile PII erasure from statutory ledger retention
     - Explain legal obligation exemptions
4. How long are itemized order and tax records retained by law?
   Reader question: How long are itemized order and tax records retained by law?
   Key points:
     - State order and payment ledger retention period in years
     - Cite federal tax and statutory audit compliance
5. How long are security and fraud-prevention logs retained after deletion?
   Reader question: How long are security and fraud-prevention logs retained after deletion?
   Key points:
     - State security records retention period in years
     - Explain network protection and abuse prevention
6. How long are customer support transcripts retained after account erasure?
   Reader question: How long are customer support transcripts retained after account erasure?
   Key points:
     - State support records retention period in years
     - Explain audit and quality-assurance compliance
7. How long does marketing telemetry remain before purge?
   Reader question: How long does marketing telemetry remain before purge?
   Key points:
     - State marketing telemetry retention period in years
     - Confirm immediate opt-out upon deletion
8. How are retained ledger records decoupled from my deleted profile?
   Reader question: How are retained ledger records decoupled from my deleted profile?
   Key points:
     - Explain stripping non-essential profile attributes while keeping statutory invoice fields
     - Restrict access to compliance-only roles
9. What happens during the grace period if a new dispute is filed?
   Reader question: What happens during the grace period if a new dispute is filed?
   Key points:
     - Explain automatic pause of purge if chargeback arrives mid-grace-period
     - Preserve defense evidence
10. How fast are non-exempt operational records purged after the grace period?
   Reader question: How fast are non-exempt operational records purged after the grace period?
   Key points:
     - State grace period in days and operational purge SLA in hours
     - Clarify split between erasable profile data and exempt ledgers
11. When are exempt records cleared from encrypted backup snapshots?
   Reader question: When are exempt records cleared from encrypted backup snapshots?
   Key points:
     - State backup archive purge cycle in days for non-exempt data
     - Confirm statutory data remains only in compliance archive
12. Can a banned or suspended fraud account use deletion to evade a ban?
   Reader question: Can a banned or suspended fraud account use deletion to evade a ban?
   Key points:
     - Clarify security/fraud retention keeps abuse-prevention signals
     - Prohibit ban evasion via delete-and-reregister
13. Do warranty claims still work if I deleted my account?
   Reader question: Do warranty claims still work if I deleted my account?
   Key points:
     - Explain loss of self-service portal access after purge
     - Advise retaining PDF invoice for manufacturer warranty
14. How will I know which data was deleted vs retained under legal hold?
   Reader question: How will I know which data was deleted vs retained under legal hold?
   Key points:
     - Explain deletion confirmation summary distinguishing purged vs statutory records
     - Provide privacy contact for clarification
15. Are retained tax records ever used for marketing or profiling?
   Reader question: Are retained tax records ever used for marketing or profiling?
   Key points:
     - Strictly prohibit marketing, profiling, or non-compliance use of held records
     - Enforce access-control isolation

## Constraints — facts this doc may cite
- `data_retention_order_records = 7 years`
- `data_retention_security_records = 5 years`
- `data_retention_support_records = 3 years`
- `data_retention_marketing_telemetry = 2 years`
- `data_deletion_grace_period = 30 days`
- `data_deletion_purge_sla = 48 hours`
- `data_deletion_backup_purge_days = 30 days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
