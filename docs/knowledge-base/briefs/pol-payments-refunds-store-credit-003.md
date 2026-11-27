# Brief: pol-payments-refunds-store-credit-003

## Metadata
- doc_id: pol-payments-refunds-store-credit-003
- domain: payments
- topic: refunds
- subtopic: store-credit
- owning_specialist: refund
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-refunds-store-credit.md

## Subtopic intent
Store credit issuance, gift-receipt refund routing, expired card-to-credit conversions, and promotional voucher clawbacks. This document answers customer and support questions specific to store credit within payments/refunds. Does not cover rail-by-rail card/ACH/PayPal/Klarna settlement speeds or partial inspection deductions.

## Section outline (each = one chunk, ~700-800 chars)
1. When are refunds issued as store credit instead of cash?
   Reader question: When are refunds issued as store credit instead of cash?
   Key points:
     - Identify gift returns and expired/closed-account fallback cases
     - Confirm standard returns refund to original payment method
2. How are returns from gift purchases refunded?
   Reader question: How are returns from gift purchases refunded?
   Key points:
     - Require gift-return refunds to be issued strictly as store credit
     - Confirm original buyer payment card is never credited
3. Do Northvale store credits ever expire?
   Reader question: Do Northvale store credits ever expire?
   Key points:
     - State store credit non-expiration and account-wallet binding
     - Explain checking store credit balance in account settings
4. Can store credit be transferred to another customer account?
   Reader question: Can store credit be transferred to another customer account?
   Key points:
     - Clarify store credit is non-transferable and bound to recipient email
     - Note gift-return credit issues to the recipient account
5. What happens to promotional vouchers when an order is refunded?
   Reader question: What happens to promotional vouchers when an order is refunded?
   Key points:
     - Explain single-use coupon forfeiture vs percentage promo recalculation
     - Clarify voucher value is not refunded as cash
6. How are loyalty points or rewards adjusted after a refund?
   Reader question: How are loyalty points or rewards adjusted after a refund?
   Key points:
     - Explain deduction of earned points on refunded items
     - Confirm redeemed reward value returns as store credit
7. Can I convert a monetary refund to store credit voluntarily?
   Reader question: Can I convert a monetary refund to store credit voluntarily?
   Key points:
     - Explain standard refund-to-original-method default
     - Clarify when store credit option is offered in portal
8. What happens if my original bank account is permanently closed?
   Reader question: What happens if my original bank account is permanently closed?
   Key points:
     - Explain rejected-refund bounce back to merchant
     - Confirm fallback issuance as store credit after verification
9. Within what window must a gift return be initiated for store credit?
   Reader question: Within what window must a gift return be initiated for store credit?
   Key points:
     - Reference standard return window for eligible gift returns
     - Note condition requirements still apply
10. What if a gift return fails baseline warehouse inspection?
   Reader question: What if a gift return fails baseline warehouse inspection?
   Key points:
     - State adjusted refund rate for failed baseline inspection
     - Confirm adjusted amount issues as store credit
11. How quickly is store credit available after return approval?
   Reader question: How quickly is store credit available after return approval?
   Key points:
     - State standard refund processing window benchmark and instant wallet posting
     - Confirm email notification with credit balance
12. Can store credit be used toward shipping fees and taxes?
   Reader question: Can store credit be used toward shipping fees and taxes?
   Key points:
     - Confirm store credit applies to subtotal, shipping, and tax at checkout
     - Explain remaining balance stays in wallet
13. How do I dispute an incorrect store credit amount?
   Reader question: How do I dispute an incorrect store credit amount?
   Key points:
     - State dispute filing window from refund issue date
     - Direct to support with order and return IDs
14. Can store credit be redeemed for cash or card payout?
   Reader question: Can store credit be redeemed for cash or card payout?
   Key points:
     - Prohibit cash redemption except where required by state law
     - Clarify non-cash policy
15. What happens to store credit if I delete my Northvale account?
   Reader question: What happens to store credit if I delete my Northvale account?
   Key points:
     - Warn that permanent account deletion forfeits unspent store credit
     - Advise using store credit before deletion

## Constraints — facts this doc may cite
- `refund_processing_standard = 5 to 7 business days`
- `return_window_standard = 30 days`
- `refund_rate_failed_inspection = 60%`
- `dispute_filing_window = 60 days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
