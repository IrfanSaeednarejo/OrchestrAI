# Brief: pol-payments-refunds-partial-004

## Metadata
- doc_id: pol-payments-refunds-partial-004
- domain: payments
- topic: refunds
- subtopic: partial
- owning_specialist: refund
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-refunds-partial.md

## Subtopic intent
Partial refunds, post-purchase price-match adjustments, restocking deductions, and shipping-fee refundability criteria. This document answers customer and support questions specific to partial within payments/refunds. Does not cover full-order rail settlement timelines, store credit conversions, or chargeback representment.

## Section outline (each = one chunk, ~700-800 chars)
1. When does Northvale issue a partial refund instead of a full refund?
   Reader question: When does Northvale issue a partial refund instead of a full refund?
   Key points:
     - List single-item returns from multi-item orders, deductions, and price adjustments
     - Clarify itemized breakdown in refund email
2. How are partial refunds calculated when returning one item from a bundle?
   Reader question: How are partial refunds calculated when returning one item from a bundle?
   Key points:
     - Explain proportional bundle discount allocation
     - Prevent gaming bundle thresholds on partial returns
3. What deduction applies for missing components or accessories?
   Reader question: What deduction applies for missing components or accessories?
   Key points:
     - State missing-components deduction cap
     - Give examples of manuals, cables, or attachments
4. What deduction applies for damaged or defaced retail packaging?
   Reader question: What deduction applies for damaged or defaced retail packaging?
   Key points:
     - State damaged-packaging deduction percentage
     - Distinguish inner manufacturer box from outer shipping carton
5. What restocking fee applies to discretionary late returns?
   Reader question: What restocking fee applies to discretionary late returns?
   Key points:
     - State mandatory late-return restocking fee
     - Clarify warehouse discretion for late arrivals
6. What refund rate applies if an item fails baseline inspection?
   Reader question: What refund rate applies if an item fails baseline inspection?
   Key points:
     - State adjusted refund rate for failed inspection
     - Explain heavily worn or incomplete-condition criteria
7. How are return shipping fees deducted from a partial refund?
   Reader question: How are return shipping fees deducted from a partial refund?
   Key points:
     - State first-item and additional-item return shipping fees
     - Confirm defective/wrong-item exemption
8. Are original outbound shipping fees refunded on partial returns?
   Reader question: Are original outbound shipping fees refunded on partial returns?
   Key points:
     - Confirm outbound shipping is non-refundable unless entire order was defective/wrong
     - Clarify single-item non-defective return rule
9. How do post-purchase price-match adjustments work?
   Reader question: How do post-purchase price-match adjustments work?
   Key points:
     - Explain partial refund of price difference on qualifying price drops
     - Note clearance/flash-sale exclusions
10. How are proportional sales taxes recalculated on partial refunds?
   Reader question: How are proportional sales taxes recalculated on partial refunds?
   Key points:
     - Confirm automatic tax refund proportional to refunded item amount
     - Clarify tax on non-refundable shipping fees
11. What happens if a partial return drops my order below a promo minimum?
   Reader question: What happens if a partial return drops my order below a promo minimum?
   Key points:
     - Explain promo threshold clawback on remaining kept items
     - Show net refund calculation transparently
12. How long does a partial refund take to process after inspection?
   Reader question: How long does a partial refund take to process after inspection?
   Key points:
     - State standard refund processing window
     - Clarify settlement to original funding source
13. Can I receive two separate partial refunds for one order?
   Reader question: Can I receive two separate partial refunds for one order?
   Key points:
     - Allow staggered partial refunds as separate returned items arrive
     - Track each refund line item in order history
14. How are partial refunds shown on Klarna or split-tender orders?
   Reader question: How are partial refunds shown on Klarna or split-tender orders?
   Key points:
     - Explain installment reduction first, then settled-amount refund
     - Clarify proportional split across payment methods
15. What if I disagree with a condition deduction on my partial refund?
   Reader question: What if I disagree with a condition deduction on my partial refund?
   Key points:
     - Explain requesting intake inspection photos from support
     - Note escalation path for grading review

## Constraints — facts this doc may cite
- `return_deduction_missing_components = 25%`
- `return_deduction_damaged_packaging = 15%`
- `restocking_fee_late_return = 50%`
- `refund_rate_failed_inspection = 60%`
- `shipping_return_first_item = $6.95`
- `shipping_return_additional_item = $2.50`
- `refund_processing_standard = 5 to 7 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
