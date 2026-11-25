# Brief: pol-payments-refunds-rail-settlement-002

## Metadata
- doc_id: pol-payments-refunds-rail-settlement-002
- domain: payments
- topic: refunds
- subtopic: rail-settlement
- owning_specialist: refund
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-refunds-rail-settlement.md

## Subtopic intent
Refund settlement timelines by payment rail (card, ACH, digital wallet, BNPL), closed-card fallback, and ARN tracking numbers. This document answers customer and support questions specific to rail settlement within payments/refunds. Does not cover store credit conversions, gift-receipt returns, or partial inspection deductions.

## Section outline (each = one chunk, ~700-800 chars)
1. How long does a standard credit card refund take to settle?
   Reader question: How long does a standard credit card refund take to settle?
   Key points:
     - State standard refund processing window in business days
     - Clarify clock starts after return approval or cancellation
2. Why do debit card refunds take longer than credit card refunds?
   Reader question: Why do debit card refunds take longer than credit card refunds?
   Key points:
     - State debit card refund settlement timeline in business days
     - Explain bank clearing network batching
3. How quickly are ACH bank transfer refunds settled?
   Reader question: How quickly are ACH bank transfer refunds settled?
   Key points:
     - State ACH refund settlement timeline in business days
     - Note bank holiday exclusions
4. How fast are PayPal refunds credited back to my account?
   Reader question: How fast are PayPal refunds credited back to my account?
   Key points:
     - State PayPal refund processing window in hours
     - Explain PayPal balance vs underlying card transfer
5. How are Klarna Buy Now Pay Later refunds processed?
   Reader question: How are Klarna Buy Now Pay Later refunds processed?
   Key points:
     - Explain cancellation of remaining installments
     - State refund timeline for previously settled Klarna installments
6. How soon is a refund initiated after an order is cancelled?
   Reader question: How soon is a refund initiated after an order is cancelled?
   Key points:
     - State automated refund initiation SLA after confirmed cancellation
     - Distinguish initiation from bank posting
7. What is the difference between an authorization release and a refund?
   Reader question: What is the difference between an authorization release and a refund?
   Key points:
     - State debit card hold release window vs settled refund
     - Explain why uncaptured orders show no refund credit line
8. What is an Acquirer Reference Number (ARN) and how do I use it?
   Reader question: What is an Acquirer Reference Number (ARN) and how do I use it?
   Key points:
     - Define ARN as the card-network trace ID for settled refunds
     - Explain how customers give the ARN to their bank to locate funds
9. How are refunds handled if my original credit card was closed or expired?
   Reader question: How are refunds handled if my original credit card was closed or expired?
   Key points:
     - Explain automatic bank routing to replacement card or account
     - Clarify fallback when bank account itself is closed
10. How are digital wallet refunds (Apple Pay / Google Pay) routed?
   Reader question: How are digital wallet refunds (Apple Pay / Google Pay) routed?
   Key points:
     - Explain tokenized device-card routing back to underlying bank card
     - Confirm standard card settlement timeline applies
11. Can a refund be sent to a different card or bank account?
   Reader question: Can a refund be sent to a different card or bank account?
   Key points:
     - Prohibit cross-card refund redirection for anti-money-laundering compliance
     - Require refund to original funding rail
12. How are refunds settled when an order used split payment?
   Reader question: How are refunds settled when an order used split payment?
   Key points:
     - Explain proportional refund back to each funding source used
     - Note different rails settle at their respective speeds
13. Why does my refund status say "Issued" when my bank balance has not updated?
   Reader question: Why does my refund status say "Issued" when my bank balance has not updated?
   Key points:
     - Explain merchant batch settlement vs issuing bank posting lag
     - Advise waiting full rail window before tracing
14. How do weekends and bank holidays affect refund timelines?
   Reader question: How do weekends and bank holidays affect refund timelines?
   Key points:
     - Clarify business-day counting excludes weekends and federal bank holidays
     - Provide example settlement calculation
15. What should I do if a refund has not arrived after the full settlement window?
   Reader question: What should I do if a refund has not arrived after the full settlement window?
   Key points:
     - Instruct contacting support for ARN or ACH trace number
     - Provide bank trace escalation steps

## Constraints — facts this doc may cite
- `refund_processing_standard = 5 to 7 business days`
- `refund_processing_debit_card = 10 business days`
- `refund_processing_ach = 3 business days`
- `refund_processing_paypal = 48 hours`
- `refund_processing_klarna = 5 business days`
- `refund_initiation_after_cancel = 2 hours`
- `debit_hold_release_window = 3 to 5 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
