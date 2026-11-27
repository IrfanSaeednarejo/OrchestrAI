# Brief: faq-account-notif-email-003

## Metadata
- doc_id: faq-account-notif-email-003
- domain: account
- topic: notifications
- subtopic: email
- owning_specialist: unscoped
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-notifications-email.md

## Subtopic intent
Marketing email unsubscribe SLAs, back-in-stock alerts, quiet-hours delivery preferences, and bounce suppression handling. This document answers customer and support questions specific to email within account/notifications. Does not cover SMS carrier STOP/HELP keywords, transactional SMS OTPs, or cookie consent banners.

## Section outline (each = one chunk, ~700-800 chars)
1. What types of emails does Northvale send to customers?
   Reader question: What types of emails does Northvale send to customers?
   Key points:
     - Distinguish mandatory transactional emails from optional marketing digests
     - List receipts, shipping updates, security alerts, and newsletters
2. Can I opt out of transactional order and security emails?
   Reader question: Can I opt out of transactional order and security emails?
   Key points:
     - Clarify receipts, password resets, and security alerts cannot be unsubscribed
     - Explain legal and account-safety necessity
3. How do I unsubscribe from promotional marketing emails and digests?
   Reader question: How do I unsubscribe from promotional marketing emails and digests?
   Key points:
     - Explain one-click Unsubscribe footer link and Notification Settings toggle
     - Confirm no login required for footer unsubscribe
4. How quickly does an email unsubscribe take effect?
   Reader question: How quickly does an email unsubscribe take effect?
   Key points:
     - State operational effect window in hours and CAN-SPAM maximum SLA in business days
     - Explain why in-flight queued campaigns may arrive briefly
5. How do back-in-stock and price-drop email alerts work?
   Reader question: How do back-in-stock and price-drop email alerts work?
   Key points:
     - Explain per-product alert signup on out-of-stock pages
     - Confirm automatic single-send or expiry after restock
6. How can I configure email digest frequency or quiet hours?
   Reader question: How can I configure email digest frequency or quiet hours?
   Key points:
     - Explain weekly digest vs real-time promo toggle in Notification Settings
     - Clarify quiet-hours delivery windowing for non-urgent promos
7. How quickly are order dispatch and transit exception emails sent?
   Reader question: How quickly are order dispatch and transit exception emails sent?
   Key points:
     - State dispatch notification SLA and transit exception delay SLA
     - Include direct carrier tracking link
8. How quickly are account deletion confirmation emails sent?
   Reader question: How quickly are account deletion confirmation emails sent?
   Key points:
     - State deletion confirmation email SLA in hours
     - Explain checking spam if missing
9. What happens if my email address bounces repeatedly?
   Reader question: What happens if my email address bounces repeatedly?
   Key points:
     - Distinguish temporary soft bounce from permanent hard-bounce suppression
     - Explain dashboard warning banner to update email
10. How do I remove my email from a bounce suppression list?
   Reader question: How do I remove my email from a bounce suppression list?
   Key points:
     - Advise verifying mailbox capacity and contacting support to clear hard bounce
     - Offer updating to an active email via OTP
11. Why are Northvale emails landing in my Spam or Promotions tab?
   Reader question: Why are Northvale emails landing in my Spam or Promotions tab?
   Key points:
     - Recommend adding sender domain to contacts/whitelist
     - Confirm SPF/DKIM/DMARC authentication
12. What happens to my email preferences if I change my primary email?
   Reader question: What happens to my email preferences if I change my primary email?
   Key points:
     - Confirm notification preferences migrate to the new verified email
     - Note security alert sent to both old and new addresses
13. How do I re-subscribe to marketing digests after unsubscribing?
   Reader question: How do I re-subscribe to marketing digests after unsubscribing?
   Key points:
     - Explain re-enabling promotional emails in Account Settings
     - Confirm explicit opt-in consent
14. Does unsubscribing from marketing emails delete my account?
   Reader question: Does unsubscribing from marketing emails delete my account?
   Key points:
     - Confirm account, order history, and credits remain intact
     - Only promotional mailing list flag is disabled
15. How do I report a suspicious phishing email impersonating Northvale?
   Reader question: How do I report a suspicious phishing email impersonating Northvale?
   Key points:
     - Instruct forwarding suspicious email to security/support and never clicking links
     - Confirm Northvale never asks for passwords or full card numbers via email

## Constraints — facts this doc may cite
- `notification_unsubscribe_effect = 24 hours`
- `notification_can_spam_max = 10 business days`
- `notification_dispatch_delay = 4 hours`
- `notification_transit_exception_delay = 2 hours`
- `data_deletion_confirmation_sla = 24 hours`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
