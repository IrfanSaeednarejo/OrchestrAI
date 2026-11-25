# Brief: faq-payments-payments-auth-holds-002

## Metadata
- doc_id: faq-payments-payments-auth-holds-002
- domain: payments
- topic: payments
- subtopic: auth-holds
- owning_specialist: payment
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-payments-auth-holds.md

## Subtopic intent
Pre-authorization holds, split-shipment capture timing, declined-card retry schedules, and duplicate-pending-charge explanations. This document answers customer and support questions specific to auth holds within payments/payments. Does not cover sales tax exemptions, multi-currency FX fees, 3D Secure challenges, or post-capture refunds.

## Section outline (each = one chunk, ~700-800 chars)
1. What is a payment pre-authorization hold at checkout?
   Reader question: What is a payment pre-authorization hold at checkout?
   Key points:
     - Explain temporary bank fund reservation vs final settlement
     - Confirm holds are not completed charges
2. Why can an initial authorization exceed my order total?
   Reader question: Why can an initial authorization exceed my order total?
   Key points:
     - State maximum authorization buffer percentage for estimated shipping
     - Confirm final capture reflects exact order total only
3. How long do uncaptured authorization holds remain active?
   Reader question: How long do uncaptured authorization holds remain active?
   Key points:
     - State automatic authorization hold expiry window
     - Explain bank release upon expiration
4. When are funds captured on split-shipment orders?
   Reader question: When are funds captured on split-shipment orders?
   Key points:
     - Explain partial capture per dispatched shipment
     - Clarify remaining balance capture upon final dispatch
5. Why do I see two pending entries on my bank statement?
   Reader question: Why do I see two pending entries on my bank statement?
   Key points:
     - Explain retry or authorization-plus-capture display lag
     - Confirm pending duplicates drop off automatically
6. How long do debit card holds take to release after cancellation?
   Reader question: How long do debit card holds take to release after cancellation?
   Key points:
     - State debit card hold release window in business days
     - Clarify issuer processing vs merchant release
7. How long are orders held when a payment authorization fails?
   Reader question: How long are orders held when a payment authorization fails?
   Key points:
     - State payment-failure order hold window before auto-cancellation
     - Explain email and dashboard retry prompts
8. What is the waiting period after a hard card decline?
   Reader question: What is the waiting period after a hard card decline?
   Key points:
     - Distinguish immediate soft-decline retry from hard-decline cooldown
     - State mandatory hard-decline waiting period
9. When does a payment card get temporarily locked from retries?
   Reader question: When does a payment card get temporarily locked from retries?
   Key points:
     - State card retry lockout duration after consecutive failed authorizations
     - Advise using an alternate payment method
10. When does an account get locked from checkout due to failed payments?
   Reader question: When does an account get locked from checkout due to failed payments?
   Key points:
     - State account checkout lockout duration
     - Clarify security protection against card-testing abuse
11. How does the subscription renewal retry schedule work?
   Reader question: How does the subscription renewal retry schedule work?
   Key points:
     - State maximum subscription retry window before cancellation
     - Explain automated email alerts between retries
12. Why might my bank show a pending hold after an AVS decline?
   Reader question: Why might my bank show a pending hold after an AVS decline?
   Key points:
     - Explain issuer-side hold behavior on gateway-rejected transactions
     - Confirm hold expires without merchant capture
13. How can I verify whether a charge is pending or captured?
   Reader question: How can I verify whether a charge is pending or captured?
   Key points:
     - Direct customers to order payment status vs bank "pending" label
     - Explain how to contact support for transaction trace
14. Do authorization holds earn or consume credit card rewards?
   Reader question: Do authorization holds earn or consume credit card rewards?
   Key points:
     - Explain rewards/cashback post only on settled captures
     - Clarify temporary credit limit reduction during hold
15. What should I do if an expired hold still appears after the release window?
   Reader question: What should I do if an expired hold still appears after the release window?
   Key points:
     - Advise contacting card issuer with authorization code
     - Offer support-provided void confirmation letter

## Constraints — facts this doc may cite
- `payment_auth_hold_expiry_days = 7 days`
- `payment_auth_buffer_max_pct = 20%`
- `debit_hold_release_window = 3 to 5 business days`
- `payment_card_retry_lockout_hours = 24 hours`
- `payment_hard_decline_cooldown_hours = 24 hours`
- `payment_failure_order_hold_hours = 72 hours`
- `checkout_account_lockout_hours = 48 hours`
- `subscription_retry_max_days = 7 days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
