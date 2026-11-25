# Brief: faq-account-sec-sessions-003

## Metadata
- doc_id: faq-account-sec-sessions-003
- domain: account
- topic: account_security
- subtopic: sessions
- owning_specialist: account_access
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-account_security-sessions.md

## Subtopic intent
Active session management, unrecognized-device alerts, compromised account quarantine, and token revocation steps. This document answers customer and support questions specific to sessions within account/account_security. Does not cover MFA/OTP lockout durations, password rotation intervals, or stateless password reset emails.

## Section outline (each = one chunk, ~700-800 chars)
1. How can I view all active login sessions on my account?
   Reader question: How can I view all active login sessions on my account?
   Key points:
     - Navigate to Account Security > Active Sessions
     - Explain device type, approximate location, and last-active timestamp
2. When does Northvale send an unrecognized-device login alert?
   Reader question: When does Northvale send an unrecognized-device login alert?
   Key points:
     - Explain automatic email alerts on new device or geographic location
     - Include direct link to review or freeze account
3. How does velocity monitoring detect suspicious login attempts?
   Reader question: How does velocity monitoring detect suspicious login attempts?
   Key points:
     - State security velocity detection window in hours
     - Explain automated flagging of rapid multi-IP or repeated lockouts
4. How do I sign out of a single unfamiliar session or all devices?
   Reader question: How do I sign out of a single unfamiliar session or all devices?
   Key points:
     - Explain per-session "Revoke" vs "Sign Out All Devices" button
     - Confirm immediate session token invalidation
5. What should I do immediately if I suspect my account was hijacked?
   Reader question: What should I do immediately if I suspect my account was hijacked?
   Key points:
     - Instruct reporting via portal/support, revoking sessions, and changing password
     - Note compromised account freeze SLA
6. How quickly is a compromised account placed into a frozen state?
   Reader question: How quickly is a compromised account placed into a frozen state?
   Key points:
     - State compromised account freeze SLA in minutes
     - Explain what a freeze blocks (orders, profile edits, payouts)
7. What happens to pending orders when an account is quarantined?
   Reader question: What happens to pending orders when an account is quarantined?
   Key points:
     - Explain pause on unshipped high-risk orders for owner confirmation
     - Confirm legitimate shipped tracking remains traceable via support
8. How does a password lockout protect against credential stuffing?
   Reader question: How does a password lockout protect against credential stuffing?
   Key points:
     - State password lockout duration in minutes
     - Explain escalating repeated lockouts to phone support
9. Can an administrator lock my account for suspicious activity?
   Reader question: Can an administrator lock my account for suspicious activity?
   Key points:
     - Explain admin-initiated security lock vs automated lockout
     - Require verified identity check before admin unlock
10. How do I unfreeze my account after a compromise investigation?
   Reader question: How do I unfreeze my account after a compromise investigation?
   Key points:
     - Outline identity verification, OTP confirmation, and mandatory password reset
     - Confirm restoration of clean session
11. How long are security and unauthorized-activity logs retained?
   Reader question: How long are security and unauthorized-activity logs retained?
   Key points:
     - State security records retention period in years
     - Explain fraud-prevention and network protection purpose
12. Why did I receive a login alert when I used a VPN or mobile data?
   Reader question: Why did I receive a login alert when I used a VPN or mobile data?
   Key points:
     - Explain dynamic IP and carrier geolocation shifts
     - Advise confirming own activity vs revoking session
13. Does changing my email address revoke existing active sessions?
   Reader question: Does changing my email address revoke existing active sessions?
   Key points:
     - Confirm security-critical credential changes trigger alerts and session refresh
     - Require OTP verification before email change
14. How do Bearer session tokens expire on shared computers?
   Reader question: How do Bearer session tokens expire on shared computers?
   Key points:
     - Advise explicit sign-out on public/shared devices
     - Explain automatic token expiration and manual revocation
15. Are saved payment cards protected if someone accesses an active session?
   Reader question: Are saved payment cards protected if someone accesses an active session?
   Key points:
     - Confirm full card numbers are masked/tokenized
     - Explain step-up verification for sensitive changes

## Constraints — facts this doc may cite
- `security_velocity_window_hours = 24 hours`
- `compromised_account_freeze_sla = 15 minutes`
- `password_lockout_duration = 30 minutes`
- `otp_validity_minutes = 10 minutes`
- `data_retention_security_records = 5 years`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
