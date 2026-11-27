# Brief: faq-orders-shipping-lost-damaged-003

## Metadata
- doc_id: faq-orders-shipping-lost-damaged-003
- domain: orders
- topic: shipping
- subtopic: lost-damaged
- owning_specialist: order_tracking
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-shipping-lost-damaged.md

## Subtopic intent
Lost-in-transit carrier investigations, damaged parcel claims, porch-piracy affidavits, and reshipment eligibility rules. This document answers customer and support questions specific to lost damaged within orders/shipping. Does not cover international customs duties, standard domestic transit speeds, or PO Box / oversized freight rules.

## Section outline (each = one chunk, ~700-800 chars)
1. How soon must I report a package that arrived damaged?
   Reader question: How soon must I report a package that arrived damaged?
   Key points:
     - State damage claim filing window after carrier delivery
     - Explain importance of prompt reporting before discarding packaging
2. What photos and evidence are needed for a damaged-parcel claim?
   Reader question: What photos and evidence are needed for a damaged-parcel claim?
   Key points:
     - List outer box, shipping label, cushioning, and item damage photos
     - Note serial-number photo requirement for electronics
3. What should I do if tracking shows delivered but no package arrived?
   Reader question: What should I do if tracking shows delivered but no package arrived?
   Key points:
     - Advise checking porches, neighbors, and building reception first
     - Explain GPS-verified carrier delivery trace request
4. When is a police report required for a stolen package claim?
   Reader question: When is a police report required for a stolen package claim?
   Key points:
     - State stolen-package police report threshold
     - Explain how to upload the incident number to support
5. What does optional package protection insurance cover?
   Reader question: What does optional package protection insurance cover?
   Key points:
     - State insurance premium percentage at checkout
     - Confirm full coverage of verified transit loss
6. What is the maximum coverage if I declined shipping insurance?
   Reader question: What is the maximum coverage if I declined shipping insurance?
   Key points:
     - State uninsured maximum coverage cap
     - Clarify carrier liability limits vs insured protection
7. When is a parcel officially considered lost in transit?
   Reader question: When is a parcel officially considered lost in transit?
   Key points:
     - Explain stalled tracking duration and carrier trace initiation
     - Note transit exception alert timing
8. How does Northvale investigate a lost-in-transit carrier claim?
   Reader question: How does Northvale investigate a lost-in-transit carrier claim?
   Key points:
     - Outline carrier tracer inquiry and warehouse dispatch verification
     - Clarify customer cooperation during carrier follow-up
9. How quickly is a replacement order shipped once a claim is approved?
   Reader question: How quickly is a replacement order shipped once a claim is approved?
   Key points:
     - State replacement dispatch SLA after claim approval
     - Confirm zero shipping cost on approved replacements
10. Can I choose a refund instead of a replacement for a lost order?
   Reader question: Can I choose a refund instead of a replacement for a lost order?
   Key points:
     - Explain refund vs reshipment option when inventory is low
     - Note original payment method settlement
11. What happens if a carrier holds a parcel after failed delivery attempts?
   Reader question: What happens if a carrier holds a parcel after failed delivery attempts?
   Key points:
     - State carrier hold duration before return-to-sender
     - Advise contacting local depot before hold expires
12. What if only one item in a multi-item box is missing or damaged?
   Reader question: What if only one item in a multi-item box is missing or damaged?
   Key points:
     - Explain partial-shipment verification against pack weight logs
     - Detail single-item replacement without returning intact items
13. Should I return a damaged item before my claim is reviewed?
   Reader question: Should I return a damaged item before my claim is reviewed?
   Key points:
     - Instruct customer to hold damaged item and box until review completes
     - Explain prepaid return label issuance only if inspection required
14. What if a lost package eventually arrives after a replacement shipped?
   Reader question: What if a lost package eventually arrives after a replacement shipped?
   Key points:
     - Provide prepaid return label to return duplicate parcel
     - Explain support coordination to close carrier claim
15. Are porch-piracy claims covered if the carrier followed delivery instructions?
   Reader question: Are porch-piracy claims covered if the carrier followed delivery instructions?
   Key points:
     - Distinguish insured vs uninsured theft handling
     - Reiterate police report requirement above threshold

## Constraints — facts this doc may cite
- `shipping_damage_claim_window = 48 hours`
- `shipping_stolen_police_report_threshold = $100`
- `shipping_insurance_rate_pct = 1.5%`
- `shipping_insured_coverage_pct = 100%`
- `shipping_uninsured_max_coverage = $100`
- `shipping_claim_replacement_dispatch_sla = 3 business days`
- `carrier_hold_before_rto_days = 7 days`
- `notification_transit_exception_delay = 2 hours`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
