# Brief: pol-payments-disputes-chargeback-002

## Metadata
- doc_id: pol-payments-disputes-chargeback-002
- domain: payments
- topic: disputes
- subtopic: chargeback
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-disputes-chargeback.md

## Subtopic intent
Card-issuer chargeback lifecycle, compelling evidence packets, delivery-proof representment, and open-dispute account locks. This document answers customer and support questions specific to chargeback within payments/disputes. Does not cover Klarna/BNPL installment disputes, internal-only refund math, or checkout 3DS declines.

## Section outline (each = one chunk, ~700-800 chars)
1. What is the difference between a Northvale billing dispute and a bank chargeback?
   Reader question: What is the difference between a Northvale billing dispute and a bank chargeback?
   Key points:
     - Distinguish internal support dispute ticket from card-issuer chargeback
     - Recommend internal dispute first for faster resolution
2. Within what timeframe must a payment dispute be filed?
   Reader question: Within what timeframe must a payment dispute be filed?
   Key points:
     - State dispute filing window from original charge date
     - Explain eligibility cutoff
3. How quickly does Northvale acknowledge and review a dispute ticket?
   Reader question: How quickly does Northvale acknowledge and review a dispute ticket?
   Key points:
     - State acknowledgment SLA, internal review start SLA, and decision SLA
     - Explain ticket reference tracking
4. How fast is a refund issued if an internal dispute is approved?
   Reader question: How fast is a refund issued if an internal dispute is approved?
   Key points:
     - State dispute refund execution SLA and manual reissue SLA
     - Confirm refund to original payment method
5. When is a police report mandatory for an unauthorized charge claim?
   Reader question: When is a police report mandatory for an unauthorized charge claim?
   Key points:
     - State police report dollar threshold for fraudulent charge disputes
     - Explain submission of report number to billing team
6. What happens to my account while a bank chargeback is open?
   Reader question: What happens to my account while a bank chargeback is open?
   Key points:
     - Explain temporary account ordering restriction during active chargeback
     - Clarify why concurrent internal refunds pause during bank dispute
7. What is the card issuer response window for chargeback representment?
   Reader question: What is the card issuer response window for chargeback representment?
   Key points:
     - State issuer chargeback response and timeline window
     - Explain merchant evidence compilation
8. What compelling evidence does Northvale submit in chargeback representment?
   Reader question: What compelling evidence does Northvale submit in chargeback representment?
   Key points:
     - List order logs, AVS/3DS match, IP/device telemetry, and carrier delivery proof
     - Note signature-verified delivery records
9. How does signed delivery proof affect "item not received" chargebacks?
   Reader question: How does signed delivery proof affect "item not received" chargebacks?
   Key points:
     - Explain carrier GPS and recipient signature weight in representment
     - Distinguish porch theft vs carrier non-delivery
10. What happens if I win or lose a bank chargeback?
   Reader question: What happens if I win or lose a bank chargeback?
   Key points:
     - Explain provisional credit becoming permanent on win
     - Explain account balance reconciliation if chargeback is reversed
11. How do I withdraw a chargeback after resolving the issue with Northvale?
   Reader question: How do I withdraw a chargeback after resolving the issue with Northvale?
   Key points:
     - Instruct contacting card issuer to cancel dispute and obtain withdrawal letter
     - Explain lifting account lock upon confirmed withdrawal
12. Can a closed internal dispute be reopened later?
   Reader question: Can a closed internal dispute be reopened later?
   Key points:
     - State reopen window after which a fresh dispute filing is required
     - Require new supporting evidence to reopen
13. How are duplicate-charge disputes handled internally vs via chargeback?
   Reader question: How are duplicate-charge disputes handled internally vs via chargeback?
   Key points:
     - Explain fast internal duplicate-charge verification and refund
     - Warn that bank chargebacks take significantly longer
14. What is "friendly fraud" and how does Northvale handle repeated chargebacks?
   Reader question: What is "friendly fraud" and how does Northvale handle repeated chargebacks?
   Key points:
     - Define friendly fraud (disputing valid delivered purchases)
     - Explain permanent account suspension for confirmed abuse
15. Who do I contact for status updates on an open representment case?
   Reader question: Who do I contact for status updates on an open representment case?
   Key points:
     - Direct to specialized billing/disputes support queue
     - Confirm card issuer makes final chargeback ruling

## Constraints — facts this doc may cite
- `dispute_filing_window = 60 days`
- `dispute_acknowledgment_sla = 24 hours`
- `dispute_internal_review_start_sla = 2 business days`
- `dispute_internal_decision_sla = 10 business days`
- `dispute_refund_execution_sla = 5 business days`
- `dispute_manual_reissue_sla = 24 hours`
- `chargeback_issuer_window = 20 to 45 days`
- `dispute_police_report_threshold = $500`
- `dispute_reopen_window = 30 days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
