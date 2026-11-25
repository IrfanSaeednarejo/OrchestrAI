# Brief: faq-payments-payments-tax-fx-003

## Metadata
- doc_id: faq-payments-payments-tax-fx-003
- domain: payments
- topic: payments
- subtopic: tax-fx
- owning_specialist: payment
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-payments-tax-fx.md

## Subtopic intent
State/VAT sales tax calculation, tax-exempt organization certificates, multi-currency conversion rates, and foreign transaction fees. This document answers customer and support questions specific to tax fx within payments/payments. Does not cover pre-authorization hold expirations, 3D Secure fraud checks, or refund settlement timelines.

## Section outline (each = one chunk, ~700-800 chars)
1. How is US state and local sales tax calculated at checkout?
   Reader question: How is US state and local sales tax calculated at checkout?
   Key points:
     - Explain destination-based tax calculation by shipping address
     - Note tax applies to items and taxable shipping where required
2. Does Northvale collect VAT or GST on international orders?
   Reader question: Does Northvale collect VAT or GST on international orders?
   Key points:
     - Explain regional VAT/GST collection at checkout vs customs
     - Clarify itemized tax display on commercial invoice
3. Are shipping charges subject to sales tax?
   Reader question: Are shipping charges subject to sales tax?
   Key points:
     - Explain state-by-state taxability of delivery fees
     - Reference international base fee tax treatment where applicable
4. How can tax-exempt organizations register a tax-exemption certificate?
   Reader question: How can tax-exempt organizations register a tax-exemption certificate?
   Key points:
     - Explain uploading state exemption certificate before checkout
     - Note verification review before tax-free ordering
5. Can I request a sales tax refund if I forgot to apply my exemption?
   Reader question: Can I request a sales tax refund if I forgot to apply my exemption?
   Key points:
     - Explain post-purchase tax-adjustment request with valid certificate
     - Confirm tax-only credit to original payment method
6. Which currencies are supported for international checkout?
   Reader question: Which currencies are supported for international checkout?
   Key points:
     - List supported display and settlement currencies
     - Explain automatic geo-currency detection with manual switcher
7. How are multi-currency exchange rates determined?
   Reader question: How are multi-currency exchange rates determined?
   Key points:
     - Explain daily mid-market reference rate lock at checkout
     - Confirm rate is fixed once order is authorized
8. What foreign transaction fees might my card issuer charge?
   Reader question: What foreign transaction fees might my card issuer charge?
   Key points:
     - State typical card-issuer foreign currency conversion fee range
     - Clarify issuer charges these fees, not Northvale
9. How does currency conversion affect international wire transfers?
   Reader question: How does currency conversion affect international wire transfers?
   Key points:
     - State wire transfer minimum order threshold and wire fee
     - Advise sending funds in USD to avoid intermediary short-pays
10. Why can the final tax differ slightly from the initial authorization?
   Reader question: Why can the final tax differ slightly from the initial authorization?
   Key points:
     - Reference maximum authorization buffer percentage for variable calculations
     - Confirm final receipt reflects exact statutory tax
11. How are taxes refunded on partial returns or cancelled items?
   Reader question: How are taxes refunded on partial returns or cancelled items?
   Key points:
     - Confirm proportional sales tax refund on returned/cancelled line items
     - Note non-refundable fees retain applicable tax rules
12. Are digital receipts and VAT invoices available for business accounting?
   Reader question: Are digital receipts and VAT invoices available for business accounting?
   Key points:
     - Explain downloadable PDF tax invoice in order history
     - List merchant tax ID and itemized tax breakdown fields
13. How are duties vs sales taxes separated on international receipts?
   Reader question: How are duties vs sales taxes separated on international receipts?
   Key points:
     - Distinguish import customs duties from local VAT/GST
     - Explain separate line items on checkout summary
14. What if my tax-exempt status expires mid-year?
   Reader question: What if my tax-exempt status expires mid-year?
   Key points:
     - Explain annual certificate renewal reminders
     - Note standard tax applies once certificate expires
15. Why does my bank statement show a slightly different amount in local currency?
   Reader question: Why does my bank statement show a slightly different amount in local currency?
   Key points:
     - Explain card-issuer FX spread and conversion fee range
     - Clarify difference between checkout rate and issuer settlement rate

## Constraints — facts this doc may cite
- `fx_issuer_fee_range = 1% to 3%`
- `payment_auth_buffer_max_pct = 20%`
- `shipping_international_base_fee = $24.95`
- `wire_transfer_min_order = $5,000`
- `wire_transfer_fee = $25`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
