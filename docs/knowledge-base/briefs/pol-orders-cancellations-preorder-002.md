# Brief: pol-orders-cancellations-preorder-002

## Metadata
- doc_id: pol-orders-cancellations-preorder-002
- domain: orders
- topic: cancellations
- subtopic: preorder
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-cancellations-preorder.md

## Subtopic intent
Cancellation rules for pre-orders, backordered inventory, split-shipment items, and automatic unfulfilled-order expiration. This document answers customer and support questions specific to preorder within orders/cancellations. Does not cover post-checkout shipping address edits, partial item removal on in-stock orders, or post-delivery returns.

## Section outline (each = one chunk, ~700-800 chars)
1. When can I cancel an advance pre-order without penalty?
   Reader question: When can I cancel an advance pre-order without penalty?
   Key points:
     - State pre-order cancellation deadline prior to release date
     - Explain self-service cancellation in order history
2. Why are pre-order cancellations blocked close to release?
   Reader question: Why are pre-order cancellations blocked close to release?
   Key points:
     - State pre-release cutoff window where allocation locks
     - Explain warehouse staging and carrier manifest lock
3. How do cancellations work for backordered items?
   Reader question: How do cancellations work for backordered items?
   Key points:
     - Allow backorder cancellation anytime prior to warehouse allocation
     - Explain how to cancel only the backordered line item
4. What happens if a pre-order release date is delayed by the manufacturer?
   Reader question: What happens if a pre-order release date is delayed by the manufacturer?
   Key points:
     - Grant penalty-free cancellation right when release date slips
     - Explain proactive email notice of revised ship dates
5. How are bulk or custom-manufactured orders cancelled?
   Reader question: How are bulk or custom-manufactured orders cancelled?
   Key points:
     - State bulk cancellation advance notice requirement
     - State cancellation fee for custom orders after production starts
6. Can I cancel one item from a split-shipment order?
   Reader question: Can I cancel one item from a split-shipment order?
   Key points:
     - Allow cancellation of unshipped split items within standard cutoff
     - Clarify shipped items must follow standard return window
7. How long does warehouse processing take before an order ships?
   Reader question: How long does warehouse processing take before an order ships?
   Key points:
     - State standard processing-to-shipping window
     - Explain why cancellations fail once carrier pickup scans
8. What happens to orders that remain unfulfilled due to inventory shortage?
   Reader question: What happens to orders that remain unfulfilled due to inventory shortage?
   Key points:
     - Explain automatic unfulfilled-order expiration and customer notification
     - Confirm full refund initiation on auto-cancelled orders
9. When is a pre-order payment captured vs authorized?
   Reader question: When is a pre-order payment captured vs authorized?
   Key points:
     - Distinguish checkout authorization vs capture at dispatch
     - Explain release of authorization holds on cancelled pre-orders
10. How quickly is a refund initiated after a pre-order cancellation?
   Reader question: How quickly is a refund initiated after a pre-order cancellation?
   Key points:
     - State automated refund initiation SLA after confirmed cancellation
     - Clarify email confirmation receipt
11. How long do cancelled pre-order refunds take to appear on cards?
   Reader question: How long do cancelled pre-order refunds take to appear on cards?
   Key points:
     - State standard and debit-card settlement timelines
     - Explain bank posting vs authorization drop-off
12. Can I cancel a standard in-stock order while it is processing?
   Reader question: Can I cancel a standard in-stock order while it is processing?
   Key points:
     - State standard processing cancellation cutoff window
     - Advise using standard return if cutoff has passed
13. Are promotional discounts preserved if I cancel one item in a pre-order?
   Reader question: Are promotional discounts preserved if I cancel one item in a pre-order?
   Key points:
     - Explain bundle/tier threshold recalculation on partial cancellation
     - Confirm clear total preview before confirming cancel
14. What if I miss the pre-order cancellation cutoff?
   Reader question: What if I miss the pre-order cancellation cutoff?
   Key points:
     - Explain post-delivery return option within standard return window
     - Note return shipping rules apply
15. Can I reinstate a pre-order after cancelling it?
   Reader question: Can I reinstate a pre-order after cancelling it?
   Key points:
     - Clarify cancellations are final and release allocated inventory
     - Advise placing a new pre-order subject to availability

## Constraints — facts this doc may cite
- `cancellation_cutoff_preorder = 48 hours`
- `cancellation_cutoff_standard = 24 hours`
- `cancellation_notice_bulk = 24 hours`
- `cancellation_fee_bulk_custom = 15%`
- `warehouse_processing_to_ship_window = 24 to 48 hours`
- `refund_initiation_after_cancel = 2 hours`
- `refund_processing_standard = 5 to 7 business days`
- `refund_processing_debit_card = 10 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
