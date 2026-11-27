# Brief: faq-account-sec-mfa-otp-002

## Metadata
- doc_id: faq-account-sec-mfa-otp-002
- domain: account
- topic: account_security
- subtopic: mfa-otp
- owning_specialist: account_access
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-account_security-mfa-otp.md

## Subtopic intent
Multi-factor authentication setup, OTP verification lifetimes, resend cooldowns, and lockout recovery procedures. This document answers customer and support questions specific to mfa otp within account/account_security. Does not cover active session revocation, unrecognized device alerts, or forgotten-password recovery links.

## Section outline (each = one chunk, ~700-800 chars)
1. Why does Northvale require multi-factor authentication for sensitive actions?
   Reader question: Why does Northvale require multi-factor authentication for sensitive actions?
   Key points:
     - Explain protection for profile updates, refunds, and account deletion
     - Distinguish standard login from step-up verification
2. How do I enable two-factor authentication on my account?
   Reader question: How do I enable two-factor authentication on my account?
   Key points:
     - Walk through security settings MFA toggle
     - Explain email and SMS verification channels
3. How long is a one-time verification code (OTP) valid?
   Reader question: How long is a one-time verification code (OTP) valid?
   Key points:
     - State exact OTP validity duration in minutes
     - Confirm single-use binding to the requested action
4. What happens if I request a new verification code before the old one expires?
   Reader question: What happens if I request a new verification code before the old one expires?
   Key points:
     - Confirm issuing a new code instantly invalidates prior OTPs
     - Advise using only the most recent email/SMS
5. What happens if I enter too many incorrect OTP codes?
   Reader question: What happens if I enter too many incorrect OTP codes?
   Key points:
     - State OTP verification lockout duration in minutes
     - Explain waiting for lockout expiry before retrying
6. How is an OTP lockout different from a password lockout?
   Reader question: How is an OTP lockout different from a password lockout?
   Key points:
     - Contrast OTP lockout duration with password lockout duration
     - Clarify separate counters
7. Why am I not receiving my OTP email or SMS?
   Reader question: Why am I not receiving my OTP email or SMS?
   Key points:
     - Advise checking spam/junk folders, verified email spelling, and carrier blocks
     - Note SMS opt-in requirement for text OTPs
8. Can I switch my OTP delivery channel mid-verification?
   Reader question: Can I switch my OTP delivery channel mid-verification?
   Key points:
     - Explain selecting email vs SMS in security settings
     - Require verified channel before switching
9. What password rules apply when updating MFA or security settings?
   Reader question: What password rules apply when updating MFA or security settings?
   Key points:
     - State password minimum and maximum character lengths
     - Confirm password check before disabling MFA
10. How do I recover access if I lost access to my MFA device?
   Reader question: How do I recover access if I lost access to my MFA device?
   Key points:
     - Direct to support identity-verification recovery workflow
     - Explain temporary freeze option if device was stolen
11. How fast is my account frozen if I report an unauthorized MFA prompt?
   Reader question: How fast is my account frozen if I report an unauthorized MFA prompt?
   Key points:
     - State compromised account freeze SLA in minutes
     - Urge immediate reporting via portal or support
12. Are OTP codes ever logged or visible to customer support agents?
   Reader question: Are OTP codes ever logged or visible to customer support agents?
   Key points:
     - Confirm OTPs are hashed/never logged in plaintext
     - Warn never to share OTPs with anyone claiming to be support
13. Does verifying an OTP keep my session elevated permanently?
   Reader question: Does verifying an OTP keep my session elevated permanently?
   Key points:
     - Explain time-bounded elevated verification window
     - Note sensitive changes re-prompt after expiry
14. Can I use an authenticator app alongside email/SMS OTP?
   Reader question: Can I use an authenticator app alongside email/SMS OTP?
   Key points:
     - Explain supported MFA methods in security settings
     - Detail backup recovery process
15. What should I do after an OTP lockout expires?
   Reader question: What should I do after an OTP lockout expires?
   Key points:
     - Instruct requesting a fresh OTP and entering it within validity window
     - Advise resetting password if suspicious activity suspected

## Constraints — facts this doc may cite
- `otp_validity_minutes = 10 minutes`
- `otp_lockout_duration = 15 minutes`
- `password_min_length = 12 characters`
- `password_max_length = 128 characters`
- `password_lockout_duration = 30 minutes`
- `compromised_account_freeze_sla = 15 minutes`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
