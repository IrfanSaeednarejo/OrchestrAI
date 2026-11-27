# Brief: pol-account-privacy-cookies-003

## Metadata
- doc_id: pol-account-privacy-cookies-003
- domain: account
- topic: privacy
- subtopic: cookies
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-privacy-cookies.md

## Subtopic intent
Essential vs analytics cookies, Global Privacy Control (GPC) signal honoring, and third-party ad-tech opt-out mechanisms. This document answers customer and support questions specific to cookies within account/privacy. Does not cover GDPR/CCPA DSAR exports, age verification, or multi-year order retention schedules.

## Section outline (each = one chunk, ~700-800 chars)
1. What types of cookies and local storage does Northvale use?
   Reader question: What types of cookies and local storage does Northvale use?
   Key points:
     - Distinguish strictly necessary, functional, analytics, and advertising cookies
     - Explain session vs persistent tokens
2. Which cookies are strictly necessary and cannot be disabled?
   Reader question: Which cookies are strictly necessary and cannot be disabled?
   Key points:
     - List authentication session, shopping cart, CSRF, and fraud-prevention cookies
     - Explain site breakage if blocked in browser
3. How does Northvale honor Global Privacy Control (GPC) signals?
   Reader question: How does Northvale honor Global Privacy Control (GPC) signals?
   Key points:
     - Confirm automatic detection of browser GPC header/signal
     - Treat GPC as valid opt-out of ad-tech sharing/sale
4. How can I manage or withdraw my cookie consent preferences?
   Reader question: How can I manage or withdraw my cookie consent preferences?
   Key points:
     - Explain footer "Cookie Preferences" center
     - Confirm changes take effect immediately for future page loads
5. How long are digital marketing telemetry records retained?
   Reader question: How long are digital marketing telemetry records retained?
   Key points:
     - State marketing telemetry retention period in years
     - Explain aggregation/anonymization after window
6. How do I opt out of behavioral advertising and retargeting pixels?
   Reader question: How do I opt out of behavioral advertising and retargeting pixels?
   Key points:
     - Explain disabling advertising cookies in preference center
     - Note industry opt-out tools and GPC compatibility
7. How long does a marketing communication opt-out take to apply?
   Reader question: How long does a marketing communication opt-out take to apply?
   Key points:
     - State operational opt-out effect window and CAN-SPAM maximum SLA
     - Distinguish cookie opt-out from email unsubscribe
8. Does Northvale use session-replay or error-telemetry tools?
   Reader question: Does Northvale use session-replay or error-telemetry tools?
   Key points:
     - Explain anonymized error diagnostics with PII/payment masking
     - Confirm password and card fields are never captured
9. What happens to analytics tracking when I use incognito or private browsing?
   Reader question: What happens to analytics tracking when I use incognito or private browsing?
   Key points:
     - Explain ephemeral session state cleared on browser close
     - Note logged-in preferences still follow account settings
10. Are third-party social media pixels loaded without consent?
   Reader question: Are third-party social media pixels loaded without consent?
   Key points:
     - Explain consent-gated loading in opt-in jurisdictions
     - Confirm GPC blocks third-party ad tags
11. How does Northvale separate essential security telemetry from ad tracking?
   Reader question: How does Northvale separate essential security telemetry from ad tracking?
   Key points:
     - Distinguish fraud/rate-limit signals from marketing cookies
     - Confirm security checks remain active even when ad cookies are off
12. Can mobile app or mobile web users configure the same privacy controls?
   Reader question: Can mobile app or mobile web users configure the same privacy controls?
   Key points:
     - Explain unified Cookie Preferences across responsive web
     - Note OS-level "Limit Ad Tracking" respect
13. Do cookie preferences sync across my logged-in devices?
   Reader question: Do cookie preferences sync across my logged-in devices?
   Key points:
     - Explain browser-stored consent vs account-level marketing preferences
     - Advise setting GPC per browser
14. Where can I view a list of active cookie categories and durations?
   Reader question: Where can I view a list of active cookie categories and durations?
   Key points:
     - Direct to Cookie Preference modal category details
     - Explain periodic cookie-inventory updates
15. Who can I contact with questions about web tracking or telemetry?
   Reader question: Who can I contact with questions about web tracking or telemetry?
   Key points:
     - Provide privacy compliance team contact path
     - Confirm prompt review of tracking reports

## Constraints — facts this doc may cite
- `data_retention_marketing_telemetry = 2 years`
- `notification_unsubscribe_effect = 24 hours`
- `notification_can_spam_max = 10 business days`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
