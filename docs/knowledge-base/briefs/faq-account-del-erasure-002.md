# Brief: faq-account-del-erasure-002

## Metadata
- doc_id: faq-account-del-erasure-002
- domain: account
- topic: data_deletion
- subtopic: erasure
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-data_deletion-erasure.md

## Subtopic intent
Self-service account deletion workflow, 30-day grace-period cancellation, irreversible purge steps, and confirmation receipts. This document answers customer and support questions specific to erasure within account/data_deletion. Does not cover statutory tax/audit legal holds, open-order blocks, or multi-year ledger retention exemptions.

## Section outline (each = one chunk, ~700-800 chars)
1. How do I submit a self-service account deletion request?
   Reader question: How do I submit a self-service account deletion request?
   Key points:
     - Walk through Account Settings > Delete Account workflow
     - Note support-assisted deletion option
2. What identity verification is required before deleting my account?
   Reader question: What identity verification is required before deleting my account?
   Key points:
     - Require password and OTP verification
     - State OTP validity window in minutes
3. How quickly will I receive confirmation of my deletion request?
   Reader question: How quickly will I receive confirmation of my deletion request?
   Key points:
     - State formal deletion confirmation email SLA in hours
     - Explain checking registered email inbox
4. What is the grace period before permanent deletion executes?
   Reader question: What is the grace period before permanent deletion executes?
   Key points:
     - State mandatory deletion grace period in days
     - Explain account enters inactive state during grace period
5. How can I cancel a deletion request and reactivate my account?
   Reader question: How can I cancel a deletion request and reactivate my account?
   Key points:
     - Explain signing back in with email and password during grace period
     - Confirm full restoration of settings and history
6. How fast does permanent database deletion run once the grace period ends?
   Reader question: How fast does permanent database deletion run once the grace period ends?
   Key points:
     - State permanent database purge SLA in hours after grace period concludes
     - Explain irreversible removal across operational systems
7. How long does it take for encrypted backups to purge my deleted data?
   Reader question: How long does it take for encrypted backups to purge my deleted data?
   Key points:
     - State backup archive purge cycle in days
     - Explain automated snapshot rotation
8. What happens to my saved payment methods and addresses after deletion?
   Reader question: What happens to my saved payment methods and addresses after deletion?
   Key points:
     - Confirm permanent removal of saved payment tokens and shipping addresses
     - Clarify they cannot be recovered
9. What happens to unused store credit or loyalty points upon deletion?
   Reader question: What happens to unused store credit or loyalty points upon deletion?
   Key points:
     - Warn that unspent credits and loyalty balances are permanently forfeited
     - Advise redeeming balances before submitting deletion
10. Can I create a new account with the same email after permanent deletion?
   Reader question: Can I create a new account with the same email after permanent deletion?
   Key points:
     - Confirm re-registration is allowed after permanent purge completes
     - Clarify no historical orders or credits carry over
11. Will I receive a final email confirming permanent erasure?
   Reader question: Will I receive a final email confirming permanent erasure?
   Key points:
     - Explain final automated erasure confirmation notice
     - Note email address is purged immediately after dispatch
12. What happens to active marketing subscriptions when I delete my account?
   Reader question: What happens to active marketing subscriptions when I delete my account?
   Key points:
     - Confirm automatic removal from all marketing email and SMS lists
     - Ensure zero post-deletion promo messages
13. Can I download my order history before my account is purged?
   Reader question: Can I download my order history before my account is purged?
   Key points:
     - Recommend downloading PDF invoices or DSAR export before grace period ends
     - Clarify self-service portal lock during inactive grace state
14. What if I cannot remember my password to cancel during the grace period?
   Reader question: What if I cannot remember my password to cancel during the grace period?
   Key points:
     - Explain using Forgot Password recovery flow within the grace window
     - Note inability to recover once grace period expires
15. Are product reviews or public Q&A posts deleted with my account?
   Reader question: Are product reviews or public Q&A posts deleted with my account?
   Key points:
     - Explain anonymization or removal of user-attributed reviews per request
     - Confirm removal of display name and profile link

## Constraints — facts this doc may cite
- `data_deletion_confirmation_sla = 24 hours`
- `data_deletion_grace_period = 30 days`
- `data_deletion_purge_sla = 48 hours`
- `data_deletion_backup_purge_days = 30 days`
- `otp_validity_minutes = 10 minutes`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
