# Brief: faq-orders-shipping-po-box-freight-004

## Metadata
- doc_id: faq-orders-shipping-po-box-freight-004
- domain: orders
- topic: shipping
- subtopic: po-box-freight
- owning_specialist: order_tracking
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-shipping-po-box-freight.md

## Subtopic intent
PO Box, APO/FPO military address, rural surcharge, signature-required delivery, and oversized freight scheduling rules. This document answers customer and support questions specific to po box freight within orders/shipping. Does not cover international customs duties, stolen-package police reports, or transit-damage insurance claims.

## Section outline (each = one chunk, ~700-800 chars)
1. Which shipping tiers can deliver to a US PO Box?
   Reader question: Which shipping tiers can deliver to a US PO Box?
   Key points:
     - Explain USPS compatibility for PO Boxes vs private courier limits
     - List standard, expedited, and next-day transit benchmarks
2. What are the fees and free-shipping thresholds for domestic tiers?
   Reader question: What are the fees and free-shipping thresholds for domestic tiers?
   Key points:
     - State free standard shipping threshold, expedited fee, and next-day fee
     - Clarify threshold calculation before taxes and discounts
3. How are APO, FPO, and DPO military addresses shipped?
   Reader question: How are APO, FPO, and DPO military addresses shipped?
   Key points:
     - Confirm military postal routing via USPS
     - Note standard warehouse pick-pack SLA and military transit variance
4. Why do Alaska and Hawaii orders incur an additional shipping fee?
   Reader question: Why do Alaska and Hawaii orders incur an additional shipping fee?
   Key points:
     - State mandatory Alaska and Hawaii surcharge across all tiers
     - Explain air/barge carrier surcharges for non-contiguous states
5. Can expedited or next-day shipping deliver to PO Boxes or military bases?
   Reader question: Can expedited or next-day shipping deliver to PO Boxes or military bases?
   Key points:
     - Explain air-courier street-address requirement for next-day tier
     - Clarify automatic tier restriction at checkout
6. How are oversized or heavy freight items scheduled for delivery?
   Reader question: How are oversized or heavy freight items scheduled for delivery?
   Key points:
     - Describe freight carrier appointment scheduling by phone or SMS
     - Note curbside vs threshold delivery options
7. Can oversized freight items be delivered to a PO Box?
   Reader question: Can oversized freight items be delivered to a PO Box?
   Key points:
     - Prohibit PO Box delivery for oversized freight due to locker limits
     - Require physical street address and reachable phone number
8. When is an adult signature required at residential delivery?
   Reader question: When is an adult signature required at residential delivery?
   Key points:
     - Explain high-value and freight signature requirements
     - Describe carrier redelivery attempt policy
9. What happens after repeated failed delivery attempts at a street address?
   Reader question: What happens after repeated failed delivery attempts at a street address?
   Key points:
     - State carrier hold window before return-to-sender
     - Explain depot pickup option with government ID
10. How are rural or remote-area delivery surcharges handled?
   Reader question: How are rural or remote-area delivery surcharges handled?
   Key points:
     - Clarify extended-area carrier routing and transit buffer
     - Confirm transparent surcharge display at checkout
11. Can I request delivery to a parcel locker or carrier access point?
   Reader question: Can I request delivery to a parcel locker or carrier access point?
   Key points:
     - Explain carrier hold-at-location redirection options
     - Note locker dimension limits for bulky items
12. How does warehouse processing affect next-day delivery cutoffs?
   Reader question: How does warehouse processing affect next-day delivery cutoffs?
   Key points:
     - Explain warehouse pick-pack SLA and cutoff alignment
     - Clarify weekend orders dispatch on next business day
13. Are commercial loading-dock deliveries supported for bulk orders?
   Reader question: Are commercial loading-dock deliveries supported for bulk orders?
   Key points:
     - Explain business-address delivery hours and dock access notes
     - Recommend adding receiving hours in delivery instructions
14. What should I check before signing for a freight delivery?
   Reader question: What should I check before signing for a freight delivery?
   Key points:
     - Advise inspecting pallet/carton exterior for damage before signing
     - Instruct noting visible damage on carrier Bill of Lading
15. How are undeliverable PO Box packages handled upon return?
   Reader question: How are undeliverable PO Box packages handled upon return?
   Key points:
     - Explain warehouse intake after carrier hold expiration
     - Clarify reshipment to street address vs refund processing

## Constraints — facts this doc may cite
- `shipping_standard_transit = 5 to 7 business days`
- `shipping_standard_min_order_free = $50`
- `shipping_expedited_transit = 2 to 3 business days`
- `shipping_expedited_fee = $9.95`
- `shipping_nextday_transit = 1 business day`
- `shipping_nextday_fee = $19.95`
- `shipping_ak_hi_surcharge = $12.00`
- `warehouse_pick_pack_sla = 24 hours`
- `carrier_hold_before_rto_days = 7 days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
