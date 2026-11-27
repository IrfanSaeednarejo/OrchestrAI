# Brief: faq-orders-shipping-international-002

## Metadata
- doc_id: faq-orders-shipping-international-002
- domain: orders
- topic: shipping
- subtopic: international
- owning_specialist: order_tracking
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-shipping-international.md

## Subtopic intent
International carrier tiers, DDP vs DDU customs clearance, import taxes, and cross-border delivery exceptions. This document answers customer and support questions specific to international within orders/shipping. Does not cover domestic US shipping rates, lost-parcel theft affidavits, or PO Box / freight delivery rules.

## Section outline (each = one chunk, ~700-800 chars)
1. Which countries does Northvale ship to internationally?
   Reader question: Which countries does Northvale ship to internationally?
   Key points:
     - Outline supported international regions and carrier network
     - Note restricted destination exclusions
2. How much does international shipping cost at checkout?
   Reader question: How much does international shipping cost at checkout?
   Key points:
     - State international base shipping fee and weight-based scaling
     - Note Alaska/Hawaii domestic surcharge is separate from international
3. How long does international delivery typically take?
   Reader question: How long does international delivery typically take?
   Key points:
     - State international transit window in business days
     - Note warehouse pick-and-pack preparation SLA
4. What is the difference between DDP and DDU customs clearance?
   Reader question: What is the difference between DDP and DDU customs clearance?
   Key points:
     - Define Delivered Duty Paid vs Delivered Duty Unpaid at checkout
     - Clarify who pays import taxes upon arrival
5. Are import duties and VAT included in my order total?
   Reader question: Are import duties and VAT included in my order total?
   Key points:
     - Explain pre-collected duties at checkout vs carrier-collected fees
     - Clarify local customs authority assessment rules
6. When will my international tracking number become active?
   Reader question: When will my international tracking number become active?
   Key points:
     - State tracking activation SLA after warehouse dispatch
     - State dispatch notification email timing
7. Why does international tracking pause during customs clearance?
   Reader question: Why does international tracking pause during customs clearance?
   Key points:
     - Explain customs handoff scan gaps between origin and destination carriers
     - Clarify transit exception alert timing
8. When is a physical signature required for international delivery?
   Reader question: When is a physical signature required for international delivery?
   Key points:
     - State international signature value threshold
     - Explain carrier redelivery vs pickup depot hold
9. What happens if I refuse to pay customs duties on delivery?
   Reader question: What happens if I refuse to pay customs duties on delivery?
   Key points:
     - Explain carrier return-to-sender or abandonment handling
     - Note deduction of return transit and customs fees
10. Can I change the destination country after placing an international order?
   Reader question: Can I change the destination country after placing an international order?
   Key points:
     - Prohibit cross-country address rerouting post-checkout
     - Advise cancelling before dispatch if eligible
11. How are split shipments handled on international orders?
   Reader question: How are split shipments handled on international orders?
   Key points:
     - Explain consolidated customs dispatch vs multi-parcel tracking
     - Confirm single international base shipping charge per order
12. What happens if local customs requests additional recipient ID?
   Reader question: What happens if local customs requests additional recipient ID?
   Key points:
     - Explain tax ID or national ID verification requests from couriers
     - Warn of clearance delays if unanswered
13. Are restricted or hazardous items blocked from international air freight?
   Reader question: Are restricted or hazardous items blocked from international air freight?
   Key points:
     - List battery, aerosol, or regulated-item export limits
     - Explain checkout address validation blocks
14. How do local public holidays affect international delivery estimates?
   Reader question: How do local public holidays affect international delivery estimates?
   Key points:
     - Clarify business-day counting excludes origin and destination holidays
     - Note peak-season customs backlog buffers
15. What if an international shipment is returned as undeliverable?
   Reader question: What if an international shipment is returned as undeliverable?
   Key points:
     - Explain warehouse intake of undeliverable international parcels
     - Clarify reshipment vs refund minus outbound shipping

## Constraints — facts this doc may cite
- `shipping_international_transit = 10 to 21 business days`
- `shipping_international_base_fee = $24.95`
- `shipping_international_signature_threshold = $200`
- `shipping_ak_hi_surcharge = $12.00`
- `warehouse_pick_pack_sla = 24 hours`
- `shipping_tracking_activation_sla = 4 hours`
- `notification_dispatch_delay = 4 hours`
- `notification_transit_exception_delay = 2 hours`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
