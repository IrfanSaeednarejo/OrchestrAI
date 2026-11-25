# Brief: faq-payments-methods-wallets-002

## Metadata
- doc_id: faq-payments-methods-wallets-002
- domain: payments
- topic: methods
- subtopic: wallets
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-methods-wallets.md

## Subtopic intent
Apple Pay, Google Pay, PayPal, and Klarna installment eligibility caps, vaulting limits, and Express Checkout behavior. This document answers customer and support questions specific to wallets within payments/methods. Does not cover ACH bank transfers, domestic wire transfers, or card-issuer chargeback representment.

## Section outline (each = one chunk, ~700-800 chars)
1. Which digital wallets are accepted at Northvale checkout?
   Reader question: Which digital wallets are accepted at Northvale checkout?
   Key points:
     - List Apple Pay, Google Pay, and PayPal support
     - Explain browser and device availability
2. How does Express Checkout work with Apple Pay and Google Pay?
   Reader question: How does Express Checkout work with Apple Pay and Google Pay?
   Key points:
     - Explain pre-filled shipping and billing from wallet profile
     - Advise verifying default shipping address before authorizing
3. When do digital wallet payments require extra security verification?
   Reader question: When do digital wallet payments require extra security verification?
   Key points:
     - State digital wallet step-up verification threshold
     - Explain 3D Secure threshold alignment
4. How does Klarna Buy Now Pay Later work at checkout?
   Reader question: How does Klarna Buy Now Pay Later work at checkout?
   Key points:
     - State Klarna qualifying order range (min and max)
     - Explain interest-free installment schedule selection
5. Why might Klarna be unavailable for my cart?
   Reader question: Why might Klarna be unavailable for my cart?
   Key points:
     - Explain cart below minimum or above maximum order cap
     - Note subscription or restricted-item exclusions
6. Can I save or vault a digital wallet for future one-click orders?
   Reader question: Can I save or vault a digital wallet for future one-click orders?
   Key points:
     - Explain tokenized wallet vaulting vs per-session biometric auth
     - Clarify security token binding to account
7. How fast are PayPal refunds processed compared to cards?
   Reader question: How fast are PayPal refunds processed compared to cards?
   Key points:
     - State PayPal refund processing timeline in hours
     - Contrast with standard card timelines
8. How are Klarna refunds handled if I return an order?
   Reader question: How are Klarna refunds handled if I return an order?
   Key points:
     - Confirm unpaid installments cancel and settled installments refund within SLA
     - Note Klarna app balance update
9. Can I combine a digital wallet with Klarna on one order?
   Reader question: Can I combine a digital wallet with Klarna on one order?
   Key points:
     - Prohibit stacking BNPL with another digital wallet
     - Explain single primary payment rail rule for wallets/BNPL
10. Why did my Apple Pay or Google Pay transaction fail?
   Reader question: Why did my Apple Pay or Google Pay transaction fail?
   Key points:
     - Check expired underlying card, billing ZIP mismatch, or step-up timeout
     - Advise updating card inside device wallet
11. Does PayPal Pay in 4 follow the same rules as Klarna?
   Reader question: Does PayPal Pay in 4 follow the same rules as Klarna?
   Key points:
     - Clarify PayPal financing eligibility is governed by PayPal at login
     - Note Northvale receives full settlement at capture
12. Are digital wallet credentials stored on Northvale servers?
   Reader question: Are digital wallet credentials stored on Northvale servers?
   Key points:
     - Confirm tokenized vaulting only; no raw card numbers stored
     - Explain device-bound cryptogram security
13. Can I switch from a digital wallet to a card after checkout?
   Reader question: Can I switch from a digital wallet to a card after checkout?
   Key points:
     - Prohibit post-checkout payment method swaps
     - Advise cancelling within cutoff and reordering
14. Do digital wallets support international currency checkout?
   Reader question: Do digital wallets support international currency checkout?
   Key points:
     - Confirm multi-currency wallet support matching checkout currency
     - Note underlying bank FX rules still apply
15. How do I remove a linked PayPal or wallet token from my account?
   Reader question: How do I remove a linked PayPal or wallet token from my account?
   Key points:
     - Explain managing saved payment methods in account settings
     - Confirm immediate token revocation

## Constraints — facts this doc may cite
- `digital_wallet_stepup_threshold = $500`
- `bnpl_klarna_order_range = $50 to $2,000`
- `refund_processing_klarna = 5 business days`
- `refund_processing_paypal = 48 hours`
- `threeds_challenge_threshold = $250`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
