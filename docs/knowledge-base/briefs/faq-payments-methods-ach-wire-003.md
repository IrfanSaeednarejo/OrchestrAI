# Brief: faq-payments-methods-ach-wire-003

## Metadata
- doc_id: faq-payments-methods-ach-wire-003
- domain: payments
- topic: methods
- subtopic: ach-wire
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-methods-ach-wire.md

## Subtopic intent
ACH bank transfers, wire transfers, NSF fees, split-tender combinations with cards and wallets, and minimum-order thresholds for alternative payment rails. This document answers customer and support questions specific to ach wire within payments/methods. Does not cover Apple Pay, Google Pay, PayPal, Klarna BNPL, or credit-card 3DS declines.

## Section outline (each = one chunk, ~700-800 chars)
1. When can I pay using an electronic ACH bank transfer?
   Reader question: When can I pay using an electronic ACH bank transfer?
   Key points:
     - State ACH minimum qualifying order threshold
     - Explain US checking/savings bank account requirement
2. How do I verify and link my bank account for ACH checkout?
   Reader question: How do I verify and link my bank account for ACH checkout?
   Key points:
     - Explain instant bank verification vs micro-deposit flow
     - Confirm encrypted bank token handling
3. How long does an ACH transfer take to clear before my order ships?
   Reader question: How long does an ACH transfer take to clear before my order ships?
   Key points:
     - State ACH settlement clearing window in business days
     - Clarify warehouse pick-pack waits for cleared funds
4. What happens if an ACH transfer fails due to insufficient funds?
   Reader question: What happens if an ACH transfer fails due to insufficient funds?
   Key points:
     - State NSF returned transfer fee
     - Explain order hold/cancellation and fee settlement
5. When are direct domestic wire transfers accepted?
   Reader question: When are direct domestic wire transfers accepted?
   Key points:
     - State wire transfer minimum qualifying order threshold
     - Identify commercial/high-value order use case
6. What administrative fee applies to domestic wire transfers?
   Reader question: What administrative fee applies to domestic wire transfers?
   Key points:
     - State domestic wire processing fee
     - Note sending-bank wire fees are separate
7. How do I obtain Northvale’s wire instructions and reference memo?
   Reader question: How do I obtain Northvale’s wire instructions and reference memo?
   Key points:
     - Explain pro-forma invoice generation at checkout
     - Require order ID in wire memo field for reconciliation
8. Can I split payment between a bank transfer and a credit card?
   Reader question: Can I split payment between a bank transfer and a credit card?
   Key points:
     - Clarify split-tender rules for cards/wallets vs single-rail ACH/wire
     - Explain why wire transfers must cover full invoice
9. How long do ACH refunds take when an order is cancelled or returned?
   Reader question: How long do ACH refunds take when an order is cancelled or returned?
   Key points:
     - State ACH refund settlement timeline in business days
     - Confirm direct credit back to originating bank account
10. Can expedited or next-day shipping be used with ACH payments?
   Reader question: Can expedited or next-day shipping be used with ACH payments?
   Key points:
     - Clarify transit speed applies only after ACH clears
     - Warn that clearing delay affects urgent delivery expectations
11. What happens if a wire transfer arrives with an incorrect amount?
   Reader question: What happens if a wire transfer arrives with an incorrect amount?
   Key points:
     - Explain short-pay hold vs over-pay partial refund
     - Advise verifying wire fee inclusion before sending
12. Are international wire transfers supported for overseas commercial buyers?
   Reader question: Are international wire transfers supported for overseas commercial buyers?
   Key points:
     - Distinguish domestic USD wire support from SWIFT restrictions
     - Direct international commercial buyers to billing support
13. How long do I have to send a wire transfer after placing an order?
   Reader question: How long do I have to send a wire transfer after placing an order?
   Key points:
     - Explain invoice expiration window before unallocated inventory releases
     - Advise emailing wire confirmation reference
14. Can I save a verified bank account for repeat ACH orders?
   Reader question: Can I save a verified bank account for repeat ACH orders?
   Key points:
     - Explain saved ACH mandate in account payment settings
     - Clarify revocation of bank mandate anytime
15. How are wire transfer refunds processed?
   Reader question: How are wire transfer refunds processed?
   Key points:
     - Explain verified bank-account return wire or ACH credit
     - Note processing time after intake approval

## Constraints — facts this doc may cite
- `ach_min_order_threshold = $200`
- `ach_settlement_days = 3 business days`
- `ach_nsf_returned_fee = $15`
- `wire_transfer_min_order = $5,000`
- `wire_transfer_fee = $25`
- `refund_processing_ach = 3 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
