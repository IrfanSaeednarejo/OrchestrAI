# Brief: pol-payments-disputes-bnpl-003

## Metadata
- doc_id: pol-payments-disputes-bnpl-003
- domain: payments
- topic: disputes
- subtopic: bnpl
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-disputes-bnpl.md

## Subtopic intent
Klarna/BNPL installment disputes, unrecognized transaction claims, friendly-fraud resolution, and dispute withdrawal steps. This document answers customer and support questions specific to bnpl within payments/disputes. Does not cover traditional credit-card issuer chargeback representment packets or ACH/wire payment methods.

## Section outline (each = one chunk, ~700-800 chars)
1. How do Klarna Buy Now Pay Later disputes differ from card chargebacks?
   Reader question: How do Klarna Buy Now Pay Later disputes differ from card chargebacks?
   Key points:
     - Explain BNPL financing agreement between customer and Klarna
     - Clarify merchant-vs-lender dispute responsibilities
2. Which order amounts are eligible for Klarna installment financing?
   Reader question: Which order amounts are eligible for Klarna installment financing?
   Key points:
     - State Klarna qualifying order range (min and max)
     - Note split-payment exclusions
3. How do I report an unrecognized Klarna installment plan?
   Reader question: How do I report an unrecognized Klarna installment plan?
   Key points:
     - Advise freezing account and filing both Klarna and Northvale dispute tickets
     - State dispute acknowledgment SLA
4. Are my Klarna installments paused while a dispute is investigated?
   Reader question: Are my Klarna installments paused while a dispute is investigated?
   Key points:
     - Explain reporting dispute in Klarna app to pause scheduled auto-debits
     - Clarify preventing late fees during review
5. Within what window must a BNPL billing dispute be submitted?
   Reader question: Within what window must a BNPL billing dispute be submitted?
   Key points:
     - State dispute filing window from original transaction date
     - Align with internal billing review eligibility
6. How does Northvale respond to a Klarna merchant dispute?
   Reader question: How does Northvale respond to a Klarna merchant dispute?
   Key points:
     - State internal dispute decision SLA and evidence submission
     - List delivery proof and return intake records shared with Klarna
7. What happens to settled vs remaining installments when a BNPL refund is approved?
   Reader question: What happens to settled vs remaining installments when a BNPL refund is approved?
   Key points:
     - Confirm remaining unpaid installments are cancelled
     - State refund timeline for previously settled installments
8. How are partial refunds applied to an active Klarna schedule?
   Reader question: How are partial refunds applied to an active Klarna schedule?
   Key points:
     - Explain reduction of final installments first before cash refund
     - Clarify proportional recalculation
9. How fast does an approved internal dispute refund execute?
   Reader question: How fast does an approved internal dispute refund execute?
   Key points:
     - State dispute refund execution SLA and Klarna settlement timeline
     - Confirm status notification
10. What if I returned an item but Klarna still bills the next installment?
   Reader question: What if I returned an item but Klarna still bills the next installment?
   Key points:
     - Explain lag between carrier drop-off and warehouse intake confirmation
     - Advise using Klarna "Report a Return" to pause billing
11. How are defective-item claims handled on BNPL orders?
   Reader question: How are defective-item claims handled on BNPL orders?
   Key points:
     - Confirm identical defective-item return and replacement rights
     - Explain refund/cancellation sync with Klarna
12. What happens if a BNPL dispute is decided in Northvale’s favor?
   Reader question: What happens if a BNPL dispute is decided in Northvale’s favor?
   Key points:
     - Explain resumption of installment schedule
     - Warn against missed-payment lender fees
13. Can I withdraw a Klarna dispute once my refund posts?
   Reader question: Can I withdraw a Klarna dispute once my refund posts?
   Key points:
     - Explain closing the dispute inside the Klarna portal
     - Confirm account standing restoration
14. What documentation should I keep for a BNPL dispute?
   Reader question: What documentation should I keep for a BNPL dispute?
   Key points:
     - List order confirmation, return tracking receipt, and support ticket ID
     - Recommend screenshots of installment schedule
15. Where can I get help if Klarna and Northvale totals do not match?
   Reader question: Where can I get help if Klarna and Northvale totals do not match?
   Key points:
     - Direct to Northvale billing support with Klarna reference ID
     - Explain manual ledger reconciliation

## Constraints — facts this doc may cite
- `bnpl_klarna_order_range = $50 to $2,000`
- `refund_processing_klarna = 5 business days`
- `dispute_filing_window = 60 days`
- `dispute_acknowledgment_sla = 24 hours`
- `dispute_internal_decision_sla = 10 business days`
- `dispute_refund_execution_sla = 5 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
