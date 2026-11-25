# Brief: faq-account-sec-password-recovery-004

## Metadata
- doc_id: faq-account-sec-password-recovery-004
- domain: account
- topic: account_security
- subtopic: password-recovery
- owning_specialist: account_access
- version: 1.0.0
- target_sections: 15
- filename: docs/knowledge-base/src/account-account_security-password-recovery.md

## Subtopic intent
Password rotation policies, stateless reset link expiration, lost-email recovery verification, and credential stuffing protections. This document answers customer and support questions specific to password recovery within account/account_security. Does not cover MFA setup, active session inspection, or compromised-account freeze SLAs.

## Section outline (each = one chunk, ~700-800 chars)
1. What are the password complexity and length requirements?
   Reader question: What are the password complexity and length requirements?
   Key points:
     - State minimum and maximum password character lengths
     - Recommend unique passphrase never reused across sites
2. How often am I required to rotate my Northvale password?
   Reader question: How often am I required to rotate my Northvale password?
   Key points:
     - State automatic password expiration and rotation period in days
     - Explain advance email reminder before expiry
3. How do I request a password reset if I forgot my password?
   Reader question: How do I request a password reset if I forgot my password?
   Key points:
     - Walk through "Forgot Password" email flow
     - Confirm stateless reset link delivery to registered email
4. How long is an emailed password recovery link valid?
   Reader question: How long is an emailed password recovery link valid?
   Key points:
     - State password recovery link TTL in hours
     - Explain requesting a fresh link if expired
5. Does requesting a password reset elevate my verification status?
   Reader question: Does requesting a password reset elevate my verification status?
   Key points:
     - Clarify password reset is stateless and does not verify identity for sensitive actions
     - Note separate OTP verification still required
6. How long is my account locked after repeated incorrect passwords?
   Reader question: How long is my account locked after repeated incorrect passwords?
   Key points:
     - State password lockout duration in minutes
     - Clarify self-service unlock via OTP or recovery link
7. What happens if I trigger multiple lockouts in a short period?
   Reader question: What happens if I trigger multiple lockouts in a short period?
   Key points:
     - Reference security velocity detection window in hours
     - Explain support escalation for repeated lockouts
8. What should I do if I no longer have access to my registered email?
   Reader question: What should I do if I no longer have access to my registered email?
   Key points:
     - Direct to support account-recovery verification process
     - Prohibit unverified email swaps
9. Why did my password reset email not arrive?
   Reader question: Why did my password reset email not arrive?
   Key points:
     - Check spam/promotions folders and confirm exact registered email
     - Note rate-limiting protection against reset spam
10. Can I reuse one of my previous passwords when rotating?
   Reader question: Can I reuse one of my previous passwords when rotating?
   Key points:
     - Prohibit immediate reuse of recent passwords
     - Encourage password manager generation
11. How does Northvale defend against credential-stuffing attacks?
   Reader question: How does Northvale defend against credential-stuffing attacks?
   Key points:
     - Explain breach-list screening, rate limiting, and velocity monitoring
     - Note automatic lockout enforcement
12. Should I use an OTP or a recovery link when locked out?
   Reader question: Should I use an OTP or a recovery link when locked out?
   Key points:
     - Explain both options: recovery link immediate vs OTP after lockout expiry
     - State OTP validity duration
13. What happens to my active sessions after a password reset?
   Reader question: What happens to my active sessions after a password reset?
   Key points:
     - Confirm password change invalidates old sessions across devices
     - Require fresh sign-in with new password
14. Are passwords stored in plaintext or encrypted form?
   Reader question: Are passwords stored in plaintext or encrypted form?
   Key points:
     - Confirm salted cryptographic hashing; never stored or logged in plaintext
     - Clarify support never asks for your password
15. Can I change my password while logged in without waiting for rotation?
   Reader question: Can I change my password while logged in without waiting for rotation?
   Key points:
     - Explain voluntary password update in Account Security settings
     - Confirm immediate reset of rotation clock

## Constraints — facts this doc may cite
- `password_min_length = 12 characters`
- `password_max_length = 128 characters`
- `password_rotation_days = 365 days`
- `password_lockout_duration = 30 minutes`
- `password_recovery_link_ttl = 1 hour`
- `security_velocity_window_hours = 24 hours`
- `otp_validity_minutes = 10 minutes`

## Tone and style
Neutral policy prose. No marketing language. No first person. No rhetorical questions in the body. Answer each section's reader question directly in the first sentence of the section.

## Exclusions
Do NOT introduce any numeric fact not listed in "Constraints".
Do NOT reference facts from other subtopics in the same (domain, topic).
Do NOT contradict the frozen corpus.
Do NOT use $X.XX decimal prices in any sentence that will be chunked (chunker defect note — the fixed chunker handles this, but avoid mid-sentence decimals in section-heading-adjacent lines to keep chunks clean).
