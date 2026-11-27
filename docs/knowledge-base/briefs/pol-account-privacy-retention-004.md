# Brief: pol-account-privacy-retention-004

## Metadata
- doc_id: pol-account-privacy-retention-004
- domain: account
- topic: privacy
- subtopic: retention
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-privacy-retention.md

## Subtopic intent
Data retention schedules for orders, payment tokens, and support transcripts, plus sub-processor data-sharing boundaries. This document answers customer and support questions specific to retention within account/privacy. Does not cover DSAR export requests, cookie consent banners, or self-service account deletion grace periods.

## Section outline (each = one chunk, ~700-800 chars)
1. What is Northvale’s data retention philosophy?
   Reader question: What is Northvale’s data retention philosophy?
   Key points:
     - Explain data minimization and purpose-limited retention schedules
     - Confirm deletion or anonymization once statutory windows expire
2. How long are transactional order and billing records retained?
   Reader question: How long are transactional order and billing records retained?
   Key points:
     - State order records retention period in years
     - Cite federal tax and statutory accounting compliance
3. How long are security logs and fraud-prevention records kept?
   Reader question: How long are security logs and fraud-prevention records kept?
   Key points:
     - State security records retention period in years
     - Explain chargeback defense and repeat-abuse prevention
4. How long are customer support chat transcripts and tickets retained?
   Reader question: How long are customer support chat transcripts and tickets retained?
   Key points:
     - State support records retention period in years
     - Explain quality assurance and recurring inquiry resolution
5. How long is digital marketing and advertising telemetry stored?
   Reader question: How long is digital marketing and advertising telemetry stored?
   Key points:
     - State marketing telemetry retention period in years
     - Distinguish marketing logs from transactional ledgers
6. How long do deleted records persist in encrypted system backups?
   Reader question: How long do deleted records persist in encrypted system backups?
   Key points:
     - State backup archive purge cycle in days
     - Explain immutable backup rotation rather than selective edits
7. How are payment card details tokenized and retained?
   Reader question: How are payment card details tokenized and retained?
   Key points:
     - Explain PCI-compliant payment tokens stored with processor
     - Confirm Northvale retains only last-4 digits and expiry for display
8. Which categories of third-party sub-processors receive customer data?
   Reader question: Which categories of third-party sub-processors receive customer data?
   Key points:
     - List payment processors, shipping carriers, cloud hosting, and email delivery
     - Confirm strict contractual Data Processing Agreements
9. Does Northvale share customer addresses with shipping carriers?
   Reader question: Does Northvale share customer addresses with shipping carriers?
   Key points:
     - Explain fulfillment necessity for name, street address, and phone/email alerts
     - Prohibit carrier secondary marketing use
10. How is data protected during cross-border transfers to sub-processors?
   Reader question: How is data protected during cross-border transfers to sub-processors?
   Key points:
     - Explain Standard Contractual Clauses and encryption in transit/at rest
     - Note regional hosting safeguards
11. What happens to retention schedules when a legal hold or dispute is active?
   Reader question: What happens to retention schedules when a legal hold or dispute is active?
   Key points:
     - Explain suspension of routine purge until litigation or chargeback concludes
     - Preserve evidence integrity
12. How are analytics datasets anonymized after retention windows expire?
   Reader question: How are analytics datasets anonymized after retention windows expire?
   Key points:
     - Explain stripping direct identifiers while keeping aggregate sales metrics
     - Ensure non-reidentifiability
13. Are multi-agent AI support traces included in support record retention?
   Reader question: Are multi-agent AI support traces included in support record retention?
   Key points:
     - Confirm support transcripts follow support retention schedule
     - Note PII redaction in operational logs
14. How often does Northvale audit sub-processor compliance?
   Reader question: How often does Northvale audit sub-processor compliance?
   Key points:
     - Explain annual security and SOC2/privacy vendor reviews
     - Confirm right to terminate non-compliant vendors
15. Where can customers request a summary of active sub-processors?
   Reader question: Where can customers request a summary of active sub-processors?
   Key points:
     - Direct to Privacy Policy sub-processor schedule and privacy contact
     - Commit to advance notice of material changes

## Constraints — facts this doc may cite
- `data_retention_order_records = 7 years`
- `data_retention_security_records = 5 years`
- `data_retention_support_records = 3 years`
- `data_retention_marketing_telemetry = 2 years`
- `data_deletion_backup_purge_days = 30 days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
