# Brief: pol-orders-returns-international-003

## Metadata
- doc_id: pol-orders-returns-international-003
- domain: orders
- topic: returns
- subtopic: international
- owning_specialist: returns
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/orders-returns-international.md

## Subtopic intent
International return shipping authorizations, commercial invoice customs declarations, duty drawback rules, and cross-border transit timelines. This document answers customer and support questions specific to international within orders/returns. Does not cover domestic US prepaid return labels, final-sale bundle exclusions, or domestic exchange swaps.

## Section outline (each = one chunk, ~700-800 chars)
1. Which countries are eligible for international returns?
   Reader question: Which countries are eligible for international returns?
   Key points:
     - Confirm return eligibility across supported international destinations
     - State standard and electronics return windows
2. How do I obtain an international Return Merchandise Authorization?
   Reader question: How do I obtain an international Return Merchandise Authorization?
   Key points:
     - Explain RMA request workflow through support or portal
     - Note commercial invoice attachment requirement
3. Why are prepaid domestic labels unavailable for international returns?
   Reader question: Why are prepaid domestic labels unavailable for international returns?
   Key points:
     - Explain cross-border carrier restrictions on domestic labels
     - Clarify customer-arranged tracked courier requirement
4. What customs forms must accompany an international return parcel?
   Reader question: What customs forms must accompany an international return parcel?
   Key points:
     - List commercial invoice, RMA reference, and HS code fields
     - Warn that missing customs forms cause border delays or refusal
5. How should returned goods be declared to avoid double import duty?
   Reader question: How should returned goods be declared to avoid double import duty?
   Key points:
     - Explain "Returned Goods — Original Country" declaration
     - Note consequences of misdeclaring as new merchandise
6. Are original international shipping fees and duties refunded?
   Reader question: Are original international shipping fees and duties refunded?
   Key points:
     - Clarify non-refundability of outbound international shipping base fee
     - Explain duty drawback vs local customs authority claims
7. Which international carriers are accepted for return transit?
   Reader question: Which international carriers are accepted for return transit?
   Key points:
     - List tracked international couriers with door-to-door visibility
     - Recommend retaining airway bill and tracking number
8. How long does international return transit and customs clearance take?
   Reader question: How long does international return transit and customs clearance take?
   Key points:
     - Reference international transit benchmarks
     - Note customs hold variability outside Northvale control
9. When is signature confirmation required on international returns?
   Reader question: When is signature confirmation required on international returns?
   Key points:
     - State high-value signature threshold at intake dock
     - Explain insurance recommendation for cross-border shipments
10. How are international returns inspected after clearing customs?
   Reader question: How are international returns inspected after clearing customs?
   Key points:
     - State warehouse inspection decision SLA upon intake
     - Explain photographic documentation for transit-damaged returns
11. What happens if an international return is rejected by customs?
   Reader question: What happens if an international return is rejected by customs?
   Key points:
     - Explain return-to-sender handling for unpaid duties or missing forms
     - Clarify reshipment responsibility for incomplete paperwork
12. In what currency are international return refunds issued?
   Reader question: In what currency are international return refunds issued?
   Key points:
     - Explain refund issuance in original transaction currency
     - Note card-issuer foreign exchange conversion fee range
13. How long do international card and PayPal refunds take?
   Reader question: How long do international card and PayPal refunds take?
   Key points:
     - State standard and PayPal refund processing timelines
     - Note cross-border bank posting variance
14. How are defective international items handled for return costs?
   Reader question: How are defective international items handled for return costs?
   Key points:
     - Explain support reimbursement of verified return courier receipt
     - Require pre-approval before dispatching high-cost courier
15. Can multiple international orders be combined into one return parcel?
   Reader question: Can multiple international orders be combined into one return parcel?
   Key points:
     - Prohibit mixing RMAs across distinct commercial invoices
     - Explain customs reconciliation requirement per order

## Constraints — facts this doc may cite
- `return_window_standard = 30 days`
- `return_window_electronics = 15 days`
- `return_inspection_decision_sla = 48 hours`
- `return_high_value_signature_threshold = $500`
- `shipping_international_transit = 10 to 21 business days`
- `shipping_international_base_fee = $24.95`
- `refund_processing_standard = 5 to 7 business days`
- `refund_processing_paypal = 48 hours`
- `fx_issuer_fee_range = 1% to 3%`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
