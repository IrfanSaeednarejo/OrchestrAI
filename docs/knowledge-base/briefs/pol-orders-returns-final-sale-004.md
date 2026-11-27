# Brief: pol-orders-returns-final-sale-004

## Metadata
- doc_id: pol-orders-returns-final-sale-004
- domain: orders
- topic: returns
- subtopic: final-sale
- owning_specialist: returns
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-returns-final-sale.md

## Subtopic intent
Return handling for promotional bundles, clearance items, gift purchases, opened consumables, and partial-kit returns. This document answers customer and support questions specific to final sale within orders/returns. Does not cover standard 30-day domestic returns, international customs paperwork, or instant size exchanges.

## Section outline (each = one chunk, ~700-800 chars)
1. Which product categories are classified as final sale?
   Reader question: Which product categories are classified as final sale?
   Key points:
     - List clearance, custom-made, personalized, and perishable items
     - Explain checkout and order-confirmation final-sale badges
2. Are promotional bundle items eligible for partial returns?
   Reader question: Are promotional bundle items eligible for partial returns?
   Key points:
     - Explain all-or-nothing bundle return rule
     - Clarify how bundled discounts affect standalone item returns
3. What happens if I return only part of a multi-piece kit?
   Reader question: What happens if I return only part of a multi-piece kit?
   Key points:
     - Reference missing-components deduction cap
     - Explain requirement to return all included accessories and manuals
4. Can opened consumables or hygiene-sealed products be returned?
   Reader question: Can opened consumables or hygiene-sealed products be returned?
   Key points:
     - State hygiene and safety seal restrictions once opened
     - Clarify unopened vs opened eligibility
5. What if a final-sale item arrives defective or damaged?
   Reader question: What if a final-sale item arrives defective or damaged?
   Key points:
     - Confirm defective-item override for final-sale exclusions
     - Require photographic evidence at intake review
6. How are gift purchases handled when returned by the recipient?
   Reader question: How are gift purchases handled when returned by the recipient?
   Key points:
     - Explain store credit issuance for gift returns
     - Confirm original purchaser is not notified of gift return
7. What deductions apply to torn or defaced retail packaging?
   Reader question: What deductions apply to torn or defaced retail packaging?
   Key points:
     - State damaged-packaging deduction percentage
     - Distinguish shipping carton wear from manufacturer retail box
8. What happens when returned goods fail baseline intake inspection?
   Reader question: What happens when returned goods fail baseline intake inspection?
   Key points:
     - State adjusted refund rate for failed baseline inspection
     - Explain criteria such as heavy wear or missing parts
9. How are late returns outside the eligibility window treated?
   Reader question: How are late returns outside the eligibility window treated?
   Key points:
     - Explain discretionary acceptance and mandatory late restocking fee
     - Note option to request item return-to-sender if rejected
10. How do free gift-with-purchase promotions affect a return?
   Reader question: How do free gift-with-purchase promotions affect a return?
   Key points:
     - Require promotional gift return alongside qualifying item
     - Explain deduction if promotional item is kept
11. Who covers return shipping on partial-kit or defective final-sale returns?
   Reader question: Who covers return shipping on partial-kit or defective final-sale returns?
   Key points:
     - State first-item and additional-item shipping fees for non-defective returns
     - Confirm free return shipping for verified defective items
12. When is signature verification required on high-value bundle returns?
   Reader question: When is signature verification required on high-value bundle returns?
   Key points:
     - State high-value signature threshold at intake dock
     - Advise keeping carrier drop-off receipt
13. How long does inspection take for final-sale exception claims?
   Reader question: How long does inspection take for final-sale exception claims?
   Key points:
     - State warehouse inspection decision SLA
     - Explain escalation for disputed condition grading
14. How are refunds calculated and settled for adjusted returns?
   Reader question: How are refunds calculated and settled for adjusted returns?
   Key points:
     - Detail itemized deduction calculation and standard refund timeline
     - Clarify refund to original method vs store credit for gifts
15. Can clearance items be exchanged instead of refunded?
   Reader question: Can clearance items be exchanged instead of refunded?
   Key points:
     - Clarify final-sale restriction also applies to change-of-mind exchanges
     - Note defect-only replacement exception

## Constraints — facts this doc may cite
- `restocking_fee_late_return = 50%`
- `return_deduction_missing_components = 25%`
- `return_deduction_damaged_packaging = 15%`
- `refund_rate_failed_inspection = 60%`
- `return_high_value_signature_threshold = $500`
- `return_inspection_decision_sla = 48 hours`
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
