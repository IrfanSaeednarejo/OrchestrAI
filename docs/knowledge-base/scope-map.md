# Phase 37b — 30-Document Scope Map (Gate 2)

Target: **30 new documents** (10 per domain: `orders`, `payments`, `account`) across the **12 existing `(domain, topic)` pairs**, adding **450 sections** (`14–16` H2 sections per doc) to the **66** re-chunked sections from the 12 frozen docs (**~516 total chunks** across **42 docs**).

`owning_specialist` is resolved strictly from `server/src/knowledge/specialist-scope.ts` (`SPECIALIST_KNOWLEDGE_SCOPE`). Topics without a dedicated scoped specialist entry are marked `unscoped`.

---

## Scope Map (30 New Docs)

| doc_id | domain | topic | owning_specialist | filename | section_count | subtopic_one_liner |
|---|---|---|---|---|---:|---|
| `pol-orders-returns-domestic-002` | `orders` | `returns` | `returns` | `docs/knowledge-base/src/orders-returns-domestic-standard.md` | 15 | Domestic standard return eligibility, prepaid carrier drop-off rules, inspection grading, and warehouse restocking workflows. |
| `pol-orders-returns-intl-003` | `orders` | `returns` | `returns` | `docs/knowledge-base/src/orders-returns-international-customs.md` | 15 | International return shipping authorizations, commercial invoice customs declarations, duty drawback rules, and cross-border transit timelines. |
| `pol-orders-returns-special-004` | `orders` | `returns` | `returns` | `docs/knowledge-base/src/orders-returns-final-sale-bundles.md` | 15 | Return handling for promotional bundles, clearance items, gift purchases, opened consumables, and partial-kit returns. |
| `faq-orders-shipping-intl-002` | `orders` | `shipping` | `order_tracking` | `docs/knowledge-base/src/orders-shipping-international-duties.md` | 15 | International carrier tiers, DDP vs DDU customs clearance, import taxes, and cross-border delivery exceptions. |
| `faq-orders-shipping-issues-003` | `orders` | `shipping` | `order_tracking` | `docs/knowledge-base/src/orders-shipping-lost-damaged-transit.md` | 15 | Lost-in-transit carrier investigations, damaged parcel claims, porch-piracy affidavits, and reshipment eligibility rules. |
| `faq-orders-shipping-special-004` | `orders` | `shipping` | `order_tracking` | `docs/knowledge-base/src/orders-shipping-po-box-freight.md` | 15 | PO Box, APO/FPO military address, rural surcharge, signature-required delivery, and oversized freight scheduling rules. |
| `pol-orders-cancel-pre-002` | `orders` | `cancellations` | `unscoped` | `docs/knowledge-base/src/orders-cancellations-preorder-backorder.md` | 15 | Cancellation rules for pre-orders, backordered inventory, split-shipment items, and automatic unfulfilled-order expiration. |
| `pol-orders-cancel-mod-003` | `orders` | `cancellations` | `unscoped` | `docs/knowledge-base/src/orders-cancellations-address-edits.md` | 15 | Post-checkout order modifications, shipping address interception windows, warehouse pick-pack cutoff locks, and partial item removal. |
| `faq-orders-exch-instant-002` | `orders` | `exchanges` | `unscoped` | `docs/knowledge-base/src/orders-exchanges-instant-size-swap.md` | 15 | Instant advance exchanges with temporary card holds, size/variant swaps, and price-difference settlement rules. |
| `faq-orders-exch-warranty-003` | `orders` | `exchanges` | `unscoped` | `docs/knowledge-base/src/orders-exchanges-warranty-defects.md` | 15 | Post-30-day manufacturer defect replacements, out-of-stock exchange fallbacks, and serial-number verification requirements. |
| `faq-payments-auth-holds-002` | `payments` | `payments` | `payment` | `docs/knowledge-base/src/payments-payments-authorization-holds.md` | 15 | Pre-authorization holds, split-shipment capture timing, declined-card retry schedules, and duplicate-pending-charge explanations. |
| `faq-payments-tax-fx-003` | `payments` | `payments` | `payment` | `docs/knowledge-base/src/payments-payments-sales-tax-currency.md` | 15 | State/VAT sales tax calculation, tax-exempt organization certificates, multi-currency conversion rates, and foreign transaction fees. |
| `faq-payments-security-004` | `payments` | `payments` | `payment` | `docs/knowledge-base/src/payments-payments-3ds-fraud-checks.md` | 15 | 3D Secure 2.0 step-up challenges, AVS/CVV mismatch declines, velocity fraud holds, and manual billing verification. |
| `pol-payments-refund-timing-002` | `payments` | `refunds` | `refund` | `docs/knowledge-base/src/payments-refunds-rail-settlement.md` | 15 | Refund settlement timelines by payment rail (card, ACH, digital wallet, BNPL), closed-card fallback, and ARN tracking numbers. |
| `pol-payments-refund-credit-003` | `payments` | `refunds` | `refund` | `docs/knowledge-base/src/payments-refunds-store-credit-gifts.md` | 15 | Store credit issuance, gift-receipt refund routing, expired card-to-credit conversions, and promotional voucher clawbacks. |
| `pol-payments-refund-partial-004` | `payments` | `refunds` | `refund` | `docs/knowledge-base/src/payments-refunds-partial-adjustments.md` | 15 | Partial refunds, post-purchase price-match adjustments, restocking deductions, and shipping-fee refundability criteria. |
| `pol-payments-disp-cb-002` | `payments` | `disputes` | `unscoped` | `docs/knowledge-base/src/payments-disputes-chargeback-evidence.md` | 15 | Card-issuer chargeback lifecycle, compelling evidence packets, delivery-proof representment, and open-dispute account locks. |
| `pol-payments-disp-bnpl-003` | `payments` | `disputes` | `unscoped` | `docs/knowledge-base/src/payments-disputes-bnpl-unauthorized.md` | 15 | Klarna/BNPL installment disputes, unrecognized transaction claims, friendly-fraud resolution, and dispute withdrawal steps. |
| `faq-payments-meth-wallets-002` | `payments` | `methods` | `unscoped` | `docs/knowledge-base/src/payments-methods-wallets-bnpl.md` | 15 | Apple Pay, Google Pay, PayPal, and Klarna installment eligibility caps, vaulting limits, and Express Checkout behavior. |
| `faq-payments-meth-gift-003` | `payments` | `methods` | `unscoped` | `docs/knowledge-base/src/payments-methods-giftcards-split.md` | 15 | Gift card redemption rules, balance stacking limits, split-tender payment combinations, and expired-card handling. |
| `faq-account-sec-mfa-002` | `account` | `account_security` | `account_access` | `docs/knowledge-base/src/account-account_security-mfa-otp.md` | 15 | Multi-factor authentication setup, 6-digit OTP verification lifetimes, resend cooldowns, and lockout recovery procedures. |
| `faq-account-sec-sess-003` | `account` | `account_security` | `account_access` | `docs/knowledge-base/src/account-account_security-sessions-hijack.md` | 15 | Active session management, unrecognized-device alerts, compromised account quarantine, and token revocation steps. |
| `faq-account-sec-rec-004` | `account` | `account_security` | `account_access` | `docs/knowledge-base/src/account-account_security-password-recovery.md` | 15 | Password rotation policies, stateless reset link expiration, lost-email recovery verification, and credential stuffing protections. |
| `pol-account-priv-rights-002` | `account` | `privacy` | `unscoped` | `docs/knowledge-base/src/account-privacy-gdpr-ccpa-rights.md` | 15 | GDPR and CCPA data subject rights, DSAR access exports, portability formats, and identity verification for privacy requests. |
| `pol-account-priv-track-003` | `account` | `privacy` | `unscoped` | `docs/knowledge-base/src/account-privacy-cookies-telemetry.md` | 15 | Essential vs analytics cookies, Global Privacy Control (GPC) signal honoring, and third-party ad-tech opt-out mechanisms. |
| `pol-account-priv-ret-004` | `account` | `privacy` | `unscoped` | `docs/knowledge-base/src/account-privacy-retention-sharing.md` | 15 | Data retention schedules for orders, payment tokens, and support transcripts, plus sub-processor data-sharing boundaries. |
| `faq-account-del-proc-002` | `account` | `data_deletion` | `unscoped` | `docs/knowledge-base/src/account-data_deletion-erasure-timeline.md` | 15 | Self-service account deletion workflow, 30-day grace-period cancellation, irreversible purge steps, and confirmation receipts. |
| `faq-account-del-hold-003` | `account` | `data_deletion` | `unscoped` | `docs/knowledge-base/src/account-data_deletion-legal-holds.md` | 15 | Statutory tax/audit retention exemptions, open-order or pending-refund deletion blocks, and anonymized ledger records. |
| `faq-account-notif-sms-002` | `account` | `notifications` | `unscoped` | `docs/knowledge-base/src/account-notifications-sms-transactional.md` | 15 | Transactional SMS alerts for OTPs and delivery updates, STOP/HELP carrier keywords, and dual opt-in consent separation. |
| `faq-account-notif-email-003` | `account` | `notifications` | `unscoped` | `docs/knowledge-base/src/account-notifications-email-digest.md` | 15 | Marketing email unsubscribe SLAs, back-in-stock alerts, quiet-hours delivery preferences, and bounce suppression handling. |

---

## Coverage Check

### Docs per `(domain, topic)`
| Domain | Topic | Existing | New Docs | Total Docs |
|---|---|---:|---:|---:|
| `orders` | `returns` | 1 | 3 | 4 |
| `orders` | `shipping` | 1 | 3 | 4 |
| `orders` | `cancellations` | 1 | 2 | 3 |
| `orders` | `exchanges` | 1 | 2 | 3 |
| `payments` | `payments` | 1 | 3 | 4 |
| `payments` | `refunds` | 1 | 3 | 4 |
| `payments` | `disputes` | 1 | 2 | 3 |
| `payments` | `methods` | 1 | 2 | 3 |
| `account` | `account_security` | 1 | 3 | 4 |
| `account` | `privacy` | 1 | 3 | 4 |
| `account` | `data_deletion` | 1 | 2 | 3 |
| `account` | `notifications` | 1 | 2 | 3 |
| **Total** | **12 topics** | **12** | **30** | **42** |

### Docs per `owning_specialist`
| `owning_specialist` | Scoped `(domain, topic)` | Existing Docs | New Docs | Total Docs |
|---|---|---:|---:|---:|
| `returns` | `orders / returns` | 1 | 3 | 4 |
| `order_tracking` | `orders / shipping` | 1 | 3 | 4 |
| `payment` | `payments / payments` | 1 | 3 | 4 |
| `refund` | `payments / refunds` | 1 | 3 | 4 |
| `account_access` | `account / account_security` | 1 | 3 | 4 |
| `unscoped` (`null` in `specialist-scope.ts`) | `cancellations`, `exchanges`, `disputes`, `methods`, `privacy`, `data_deletion`, `notifications` | 7 | 15 | 22 |
| **Total** | — | **12** | **30** | **42** |

- **Topics with only 1 doc**: **0** (every `(domain, topic)` pair has at least 2 new docs / 3 total docs).
- **Planned section total**: `30 × 15 = 450` new chunks + `66` frozen chunks = **`516` total chunks**.
