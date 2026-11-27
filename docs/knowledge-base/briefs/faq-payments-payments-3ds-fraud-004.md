# Brief: faq-payments-payments-3ds-fraud-004

## Metadata
- doc_id: faq-payments-payments-3ds-fraud-004
- domain: payments
- topic: payments
- subtopic: 3ds-fraud
- owning_specialist: payment
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/payments-payments-3ds-fraud.md

## Subtopic intent
3D Secure 2.0 step-up challenges, AVS/CVV mismatch declines, velocity fraud holds, and manual billing verification. This document answers customer and support questions specific to 3ds fraud within payments/payments. Does not cover sales tax rules, FX fees, authorization buffer percentages, or chargeback representment.

## Section outline (each = one chunk, ~700-800 chars)
1. What is 3D Secure 2.0 authentication at checkout?
   Reader question: What is 3D Secure 2.0 authentication at checkout?
   Key points:
     - Explain bank-verified step-up challenge (SMS, app push, biometric)
     - Clarify liability shift and cardholder protection
2. When is a 3D Secure challenge automatically triggered?
   Reader question: When is a 3D Secure challenge automatically triggered?
   Key points:
     - State 3DS transaction dollar threshold and new-device trigger
     - Note regional PSD2/SCA regulatory triggers
3. When do digital wallet payments trigger extra verification?
   Reader question: When do digital wallet payments trigger extra verification?
   Key points:
     - State digital wallet step-up verification threshold
     - Explain biometric vs secondary verification
4. Why was my payment declined due to an AVS address mismatch?
   Reader question: Why was my payment declined due to an AVS address mismatch?
   Key points:
     - Explain Address Verification System billing ZIP/street check
     - Advise matching billing address exactly to bank statement
5. Why did my card fail a CVV security code check?
   Reader question: Why did my card fail a CVV security code check?
   Key points:
     - Explain 3/4-digit security code mismatch decline
     - Warn against repeated retries with wrong CVV
6. What happens if I fail multiple consecutive card authorizations?
   Reader question: What happens if I fail multiple consecutive card authorizations?
   Key points:
     - State card retry lockout duration and account checkout lockout duration
     - Clarify hard-decline waiting period
7. Why was my order placed on a velocity fraud hold?
   Reader question: Why was my order placed on a velocity fraud hold?
   Key points:
     - Explain automated velocity screening window
     - Note mismatch of billing, shipping, or rapid device switches
8. How do I complete manual billing verification for a held order?
   Reader question: How do I complete manual billing verification for a held order?
   Key points:
     - Explain verification email instructions and order-hold window
     - Confirm no sensitive full card numbers are ever requested
9. How quickly is a compromised account frozen if fraud is reported?
   Reader question: How quickly is a compromised account frozen if fraud is reported?
   Key points:
     - State compromised account freeze SLA upon report receipt
     - Explain immediate session revocation
10. Can using a VPN or proxy trigger a checkout fraud decline?
   Reader question: Can using a VPN or proxy trigger a checkout fraud decline?
   Key points:
     - Explain IP-geolocation mismatch risk scoring
     - Advise disabling VPN during payment authentication
11. What should I do if the 3D Secure bank popup fails to load?
   Reader question: What should I do if the 3D Secure bank popup fails to load?
   Key points:
     - Advise disabling ad-blockers or trying an alternate browser
     - Note popup timeout does not capture funds
12. Why are prepaid or virtual single-use cards sometimes declined?
   Reader question: Why are prepaid or virtual single-use cards sometimes declined?
   Key points:
     - Explain lack of AVS billing registration on anonymous prepaid cards
     - Recommend registered debit, credit, or digital wallet
13. How does Northvale protect my stored payment credentials?
   Reader question: How does Northvale protect my stored payment credentials?
   Key points:
     - Explain payment tokenization and PCI-DSS compliance
     - Confirm full card numbers are never stored on Northvale servers
14. Will a fraud hold delay my expedited shipping cutoff?
   Reader question: Will a fraud hold delay my expedited shipping cutoff?
   Key points:
     - Explain orders remain unallocated until verification clears
     - Clarify dispatch clock starts after verification approval
15. Who should I contact if my bank says the card is fine but checkout declines?
   Reader question: Who should I contact if my bank says the card is fine but checkout declines?
   Key points:
     - Explain support escalation for gateway decline codes
     - Note hard-decline cooldown vs soft-decline retry

## Constraints — facts this doc may cite
- `threeds_challenge_threshold = $250`
- `digital_wallet_stepup_threshold = $500`
- `payment_card_retry_lockout_hours = 24 hours`
- `payment_hard_decline_cooldown_hours = 24 hours`
- `checkout_account_lockout_hours = 48 hours`
- `compromised_account_freeze_sla = 15 minutes`
- `security_velocity_window_hours = 24 hours`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
