# Brief: faq-orders-exchanges-instant-swap-002

## Metadata
- doc_id: faq-orders-exchanges-instant-swap-002
- domain: orders
- topic: exchanges
- subtopic: instant-swap
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-exchanges-instant-swap.md

## Subtopic intent
Instant advance exchanges with temporary card holds, size/variant swaps, and price-difference settlement rules. This document answers customer and support questions specific to instant swap within orders/exchanges. Does not cover post-30-day manufacturer defect warranty replacements, serial-number verification, or monetary-only refunds.

## Section outline (each = one chunk, ~700-800 chars)
1. How does an instant advance exchange work?
   Reader question: How does an instant advance exchange work?
   Key points:
     - Explain immediate replacement dispatch upon carrier drop-off scan or card hold
     - Contrast instant exchange with standard return-then-ship
2. Which items qualify for a size or variant exchange?
   Reader question: Which items qualify for a size or variant exchange?
   Key points:
     - State standard exchange window from delivery confirmation
     - Require same-product SKU family in stock
3. How long is exchange inventory reserved after I submit a request?
   Reader question: How long is exchange inventory reserved after I submit a request?
   Key points:
     - State exchange inventory reservation hold duration
     - Explain automatic release if return label is not scanned
4. Why is a temporary card authorization placed for instant exchanges?
   Reader question: Why is a temporary card authorization placed for instant exchanges?
   Key points:
     - Explain security hold covering replacement value until original returns
     - Confirm hold drops automatically upon warehouse receipt
5. What happens if the original item is not returned on time?
   Reader question: What happens if the original item is not returned on time?
   Key points:
     - Explain conversion of temporary hold into a captured charge
     - Clarify reminder notifications before charge capture
6. How are price differences handled when swapping variants?
   Reader question: How are price differences handled when swapping variants?
   Key points:
     - Confirm even swap for same-price size/color variants
     - Explain refund or incremental charge for differently priced variants
7. How fast is an exchange replacement order dispatched?
   Reader question: How fast is an exchange replacement order dispatched?
   Key points:
     - State standard replacement dispatch SLA after carrier scan
     - Mention expedited replacement shipping option
8. How much does return or expedited shipping cost for an exchange?
   Reader question: How much does return or expedited shipping cost for an exchange?
   Key points:
     - State change-of-mind return postage fee and expedited replacement fee
     - Note defective/wrong-item free return shipping
9. Is outbound replacement shipping free on instant exchanges?
   Reader question: Is outbound replacement shipping free on instant exchanges?
   Key points:
     - State free outbound shipping threshold for qualifying US orders
     - Note Alaska and Hawaii surcharge still applies
10. Can I exchange an item bought with a promotional discount?
   Reader question: Can I exchange an item bought with a promotional discount?
   Key points:
     - Preserve original promotional discount on same-SKU size swaps
     - Explain discount forfeiture on cross-product swaps
11. Can I switch from an exchange to a refund before shipping the item back?
   Reader question: Can I switch from an exchange to a refund before shipping the item back?
   Key points:
     - Explain cancelling exchange request in portal to release reservation
     - Clarify submitting a standard return instead
12. What if the requested exchange size sells out during transit?
   Reader question: What if the requested exchange size sells out during transit?
   Key points:
     - Explain reservation hold protection during hold window
     - Offer automatic refund if stock unexpectedly fails
13. Can gift recipients request an instant size exchange?
   Reader question: Can gift recipients request an instant size exchange?
   Key points:
     - Allow gift exchange without notifying original buyer
     - Require gift order/receipt verification
14. How do I track both my returning parcel and replacement shipment?
   Reader question: How do I track both my returning parcel and replacement shipment?
   Key points:
     - Show dual tracking links in the exchange portal
     - Explain carrier drop-off scan triggers replacement dispatch
15. Can I exchange multiple items from one order in a single request?
   Reader question: Can I exchange multiple items from one order in a single request?
   Key points:
     - Explain multi-item exchange cart selection in portal
     - Confirm consolidated return label

## Constraints — facts this doc may cite
- `exchange_window_standard = 30 days`
- `exchange_inventory_hold_hours = 48 hours`
- `exchange_expedited_shipping_fee = $12.95`
- `exchange_replacement_dispatch_sla = 2 to 3 business days`
- `shipping_return_first_item = $6.95`
- `shipping_standard_min_order_free = $50`
- `shipping_ak_hi_surcharge = $12.00`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
