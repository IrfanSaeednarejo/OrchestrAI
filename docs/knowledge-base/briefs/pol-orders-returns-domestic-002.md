# Brief: pol-orders-returns-domestic-002

## Metadata
- doc_id: pol-orders-returns-domestic-002
- domain: orders
- topic: returns
- subtopic: domestic
- owning_specialist: returns
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-returns-domestic.md

## Subtopic intent
Domestic standard return eligibility, prepaid carrier drop-off rules, inspection grading, and warehouse restocking workflows. This document answers customer and support questions specific to domestic within orders/returns. Does not cover international customs returns, duty drawbacks, final-sale bundles, or gift-card-only promotional clearance rules.

## Section outline (each = one chunk, ~700-800 chars)
1. Who qualifies for a domestic standard return?
   Reader question: Who qualifies for a domestic standard return?
   Key points:
     - State domestic US address eligibility and standard return window
     - Note shortened electronics window and bulk advance notice requirement
2. When does the domestic return eligibility clock start?
   Reader question: When does the domestic return eligibility clock start?
   Key points:
     - Explain carrier delivery confirmation trigger
     - Clarify weekend or holiday delivery counting rules
3. What condition must domestic return items be in?
   Reader question: What condition must domestic return items be in?
   Key points:
     - Detail unworn, unwashed, original-tag requirements
     - Explain packaging integrity expectations
4. How do I generate a prepaid domestic return shipping label?
   Reader question: How do I generate a prepaid domestic return shipping label?
   Key points:
     - Walk through online portal label generation
     - State label availability SLA after request submission
5. How much is deducted for domestic return shipping?
   Reader question: How much is deducted for domestic return shipping?
   Key points:
     - State first-item and additional-item label fees
     - Note defective or wrong-item exemption
6. Where can I drop off a domestic return package?
   Reader question: Where can I drop off a domestic return package?
   Key points:
     - List authorized carrier drop-off locations and receipt retention
     - Advise on tracking activation scan at drop-off
7. How should I pack multiple items into one domestic return?
   Reader question: How should I pack multiple items into one domestic return?
   Key points:
     - Explain consolidated box rules vs separate RMAs
     - Note additional-item shipping fee calculation
8. When is signature-verified intake required for a domestic return?
   Reader question: When is signature-verified intake required for a domestic return?
   Key points:
     - State high-value signature threshold at intake dock
     - Explain chain-of-custody protection for high-value parcels
9. How does warehouse inspection grading work upon arrival?
   Reader question: How does warehouse inspection grading work upon arrival?
   Key points:
     - Describe intake scan and physical grading steps
     - State inspection decision SLA after warehouse receipt
10. What deductions apply if components or packaging are missing?
   Reader question: What deductions apply if components or packaging are missing?
   Key points:
     - Specify missing-component deduction cap and damaged-packaging fee
     - Explain itemized deduction breakdown in confirmation email
11. What happens if a domestic return arrives after the window closes?
   Reader question: What happens if a domestic return arrives after the window closes?
   Key points:
     - Explain discretionary late-return intake
     - State mandatory late-return restocking fee
12. How long does a domestic return refund take to settle?
   Reader question: How long does a domestic return refund take to settle?
   Key points:
     - State standard, debit card, ACH, PayPal, and Klarna timelines
     - Clarify start of settlement clock after inspection approval
13. Can I cancel a domestic return request before shipping it?
   Reader question: Can I cancel a domestic return request before shipping it?
   Key points:
     - Explain portal cancellation before carrier scan
     - Clarify that unused labels incur no shipping deduction
14. What should I do if my domestic return tracking stalls in transit?
   Reader question: What should I do if my domestic return tracking stalls in transit?
   Key points:
     - Explain drop-off receipt proof for carrier investigation
     - Detail support escalation path for stalled return parcels
15. How are restocked domestic items processed for quality assurance?
   Reader question: How are restocked domestic items processed for quality assurance?
   Key points:
     - Describe warehouse restocking vs liquidation triage
     - Confirm customer refund is independent of resale disposition

## Constraints — facts this doc may cite
- `return_window_standard = 30 days`
- `return_window_electronics = 15 days`
- `return_notice_bulk = 14 days`
- `restocking_fee_late_return = 50%`
- `return_deduction_missing_components = 25%`
- `return_deduction_damaged_packaging = 15%`
- `return_high_value_signature_threshold = $500`
- `return_inspection_decision_sla = 48 hours`
- `return_label_availability_sla = 24 hours`
- `shipping_return_first_item = $6.95`
- `shipping_return_additional_item = $2.50`
- `refund_processing_standard = 5 to 7 business days`
- `refund_processing_debit_card = 10 business days`
- `refund_processing_ach = 3 business days`
- `refund_processing_paypal = 48 hours`
- `refund_processing_klarna = 5 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
