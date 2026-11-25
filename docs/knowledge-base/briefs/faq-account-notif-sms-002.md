# Brief: faq-account-notif-sms-002

## Metadata
- doc_id: faq-account-notif-sms-002
- domain: account
- topic: notifications
- subtopic: sms
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-notifications-sms.md

## Subtopic intent
Transactional SMS alerts for OTPs and delivery updates, STOP/HELP carrier keywords, and dual opt-in consent separation. This document answers customer and support questions specific to sms within account/notifications. Does not cover marketing email digests, back-in-stock email alerts, or email bounce suppression.

## Section outline (each = one chunk, ~700-800 chars)
1. What types of transactional SMS messages does Northvale send?
   Reader question: What types of transactional SMS messages does Northvale send?
   Key points:
     - List account security OTPs, security alerts, and urgent delivery exceptions
     - Distinguish transactional SMS from promotional SMS
2. How do I opt in to receive transactional SMS notifications?
   Reader question: How do I opt in to receive transactional SMS notifications?
   Key points:
     - Explain entering and verifying mobile number in Notification Settings
     - Confirm explicit SMS consent checkbox
3. Why is promotional SMS opt-in separate from transactional SMS?
   Reader question: Why is promotional SMS opt-in separate from transactional SMS?
   Key points:
     - Explain dual-consent separation per TCPA/carrier rules
     - Confirm opting out of marketing SMS does not block security OTPs
4. How quickly are order dispatch SMS and email alerts sent?
   Reader question: How quickly are order dispatch SMS and email alerts sent?
   Key points:
     - State dispatch notification delay SLA and tracking activation SLA
     - Clarify real-time carrier sync
5. How fast are delivery exception SMS alerts triggered?
   Reader question: How fast are delivery exception SMS alerts triggered?
   Key points:
     - State transit exception alert delay SLA in hours
     - Explain carrier delay or failed-attempt triggers
6. How long are SMS verification OTPs valid?
   Reader question: How long are SMS verification OTPs valid?
   Key points:
     - State OTP validity window in minutes
     - Advise keeping phone signal active during verification
7. How do I stop receiving SMS messages using carrier keywords?
   Reader question: How do I stop receiving SMS messages using carrier keywords?
   Key points:
     - Explain replying STOP to opt out of SMS channel
     - Note HELP keyword returns support contact info
8. How quickly does an SMS opt-out take effect?
   Reader question: How quickly does an SMS opt-out take effect?
   Key points:
     - State operational unsubscribe effect window in hours
     - Confirm immediate automated suppression for STOP replies
9. Can I re-subscribe to SMS alerts after texting STOP?
   Reader question: Can I re-subscribe to SMS alerts after texting STOP?
   Key points:
     - Explain texting START or re-enabling in Notification Settings
     - Require fresh phone verification if number changed
10. Are message and data rates charged by my mobile carrier?
   Reader question: Are message and data rates charged by my mobile carrier?
   Key points:
     - Confirm Northvale sends SMS free, standard carrier rates may apply
     - Clarify international SMS carrier support
11. What happens if I change my mobile phone number?
   Reader question: What happens if I change my mobile phone number?
   Key points:
     - Instruct updating and re-verifying new number in settings
     - Explain automatic unlinking to prevent alerts going to recycled numbers
12. Why am I not receiving SMS OTPs on my phone?
   Reader question: Why am I not receiving SMS OTPs on my phone?
   Key points:
     - Check carrier short-code blocking, Do Not Disturb, or roaming delays
     - Suggest email OTP fallback
13. Are security login alerts sent via SMS or email?
   Reader question: Are security login alerts sent via SMS or email?
   Key points:
     - Explain email default for security alerts plus optional SMS
     - Ensure critical credential changes always notify
14. Does Northvale share my mobile number with third-party marketers?
   Reader question: Does Northvale share my mobile number with third-party marketers?
   Key points:
     - Prohibit selling or sharing SMS opt-in numbers for third-party marketing
     - Confirm strict carrier-gateway-only transmission
15. How do I update my SMS preferences without deleting my account?
   Reader question: How do I update my SMS preferences without deleting my account?
   Key points:
     - Direct to Account Settings > Notifications > SMS Preferences
     - Confirm granular toggles

## Constraints — facts this doc may cite
- `notification_dispatch_delay = 4 hours`
- `notification_transit_exception_delay = 2 hours`
- `notification_unsubscribe_effect = 24 hours`
- `otp_validity_minutes = 10 minutes`
- `shipping_tracking_activation_sla = 4 hours`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
