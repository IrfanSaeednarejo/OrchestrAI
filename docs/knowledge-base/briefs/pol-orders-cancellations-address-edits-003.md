# Brief: pol-orders-cancellations-address-edits-003

## Metadata
- doc_id: pol-orders-cancellations-address-edits-003
- domain: orders
- topic: cancellations
- subtopic: address-edits
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-cancellations-address-edits.md

## Subtopic intent
Post-checkout order modifications, shipping address interception windows, warehouse pick-pack cutoff locks, and partial item removal. This document answers customer and support questions specific to address edits within orders/cancellations. Does not cover pre-order release deadlines, backorder expirations, or bulk custom-order cancellation fees.

## Section outline (each = one chunk, ~700-800 chars)
1. Can I edit my shipping address after placing an order?
   Reader question: Can I edit my shipping address after placing an order?
   Key points:
     - Explain brief post-checkout edit window before warehouse pick-pack
     - Detail self-service address edit button in order details
2. When does the warehouse pick-pack cutoff lock order edits?
   Reader question: When does the warehouse pick-pack cutoff lock order edits?
   Key points:
     - State standard warehouse pick-pack and processing-to-ship windows
     - Explain why printed labels cannot be edited locally
3. Can I cancel an order if the address edit window has closed?
   Reader question: Can I cancel an order if the address edit window has closed?
   Key points:
     - State standard processing cancellation cutoff
     - Explain fast-cancel and reorder workflow
4. How do I fix a typo in my street number or apartment unit?
   Reader question: How do I fix a typo in my street number or apartment unit?
   Key points:
     - Distinguish minor unit fixes vs city/state/ZIP changes
     - Explain support request before carrier handoff
5. Can I change the shipping tier after checkout?
   Reader question: Can I change the shipping tier after checkout?
   Key points:
     - Explain inability to upgrade/downgrade shipping speed post-authorization
     - Advise cancelling within cutoff and reordering with desired tier
6. Can I remove a single item from a recently placed order?
   Reader question: Can I remove a single item from a recently placed order?
   Key points:
     - Explain partial item cancellation before pick-pack lock
     - Confirm proportional refund initiation SLA
7. Can I add extra items to an existing order after checkout?
   Reader question: Can I add extra items to an existing order after checkout?
   Key points:
     - Prohibit adding items to existing payment authorization
     - Advise placing a separate order for additional items
8. What happens if my parcel already shipped to an old address?
   Reader question: What happens if my parcel already shipped to an old address?
   Key points:
     - Explain carrier package-intercept limitations once in transit
     - Clarify tracking activation SLA and carrier redirect options
9. Are carrier address-intercept requests guaranteed to succeed?
   Reader question: Are carrier address-intercept requests guaranteed to succeed?
   Key points:
     - Note intercept depends on carrier hub scan and route eligibility
     - Explain fallback to return-to-sender if intercept fails
10. Can I change a residential address to a PO Box after ordering?
   Reader question: Can I change a residential address to a PO Box after ordering?
   Key points:
     - Prohibit switching street address to PO Box if private courier assigned
     - Advise cancel-and-reorder before dispatch
11. How do gift message or recipient name edits work after checkout?
   Reader question: How do gift message or recipient name edits work after checkout?
   Key points:
     - Explain packing-slip freeze once warehouse pick begins
     - Clarify support-assisted updates prior to pick-pack
12. What if I cancel an order within cutoff to fix my address?
   Reader question: What if I cancel an order within cutoff to fix my address?
   Key points:
     - State automated refund initiation SLA after cancellation
     - Clarify immediate ability to place corrected order
13. What happens if an undeliverable wrong-address parcel comes back?
   Reader question: What happens if an undeliverable wrong-address parcel comes back?
   Key points:
     - Explain warehouse intake and notification on returned parcel
     - Outline refund vs reshipment options
14. How does standard return eligibility apply if interception fails?
   Reader question: How does standard return eligibility apply if interception fails?
   Key points:
     - Note standard return window applies once delivered
     - Explain refusal-at-door vs portal return
15. Why are cross-state or international address changes blocked?
   Reader question: Why are cross-state or international address changes blocked?
   Key points:
     - Explain sales tax recalculation and fraud-prevention locks
     - Require full cancellation and new checkout

## Constraints — facts this doc may cite
- `cancellation_cutoff_standard = 24 hours`
- `warehouse_pick_pack_sla = 24 hours`
- `warehouse_processing_to_ship_window = 24 to 48 hours`
- `return_window_standard = 30 days`
- `refund_initiation_after_cancel = 2 hours`
- `shipping_tracking_activation_sla = 4 hours`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
