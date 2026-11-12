# Phase 26 — End-to-End Profile Update & Identity Verification Flow — PLAN (status: DRAFT)

## 1. Goal and Architectural Fit
Implement an end-to-end, robust profile-update and identity-verification flow for the customer support assistant across the backend REST API, assistant graph logic, and frontend UI states. The flow allows an authenticated customer to update their profile name (and optionally default shipping address) via a strict 10-step sequence with a 6-digit email verification code, while proactively handling all failure modes (mail delivery failures, empty inboxes, missing emails on file, ungrounded instructions, circular system leaks, and conservative name normalization).

## 2. Dependencies Satisfied / Missing
- **Satisfied:**
  - `server/src/services/email.service.ts`: Resend email integration with `sendEmail` and `config.email.dryRun` (Phase 25 Step 2). Non-throwing contract returning `Promise<EmailResult>`.
  - `server/src/services/email-templates/verification-code.ts`: Pure table-based verification email template (Phase 25 Step 2).
  - `server/src/agents/specialists/profile/profile.ts`: Profile specialist subgraph with `updateProfile` tool and `resumeContext` (Phase 11, Phase 25 Step 6).
  - `server/src/persistence/redis/client.ts`: Live Redis client for fast TTL key-value storage.
  - `client/src/components/chat/verification-prompt.tsx`: Client verification prompt banner.
- **Missing:**
  - Dedicated profile update verification endpoints (`/profile/update/request-code`, `/profile/update/verify`, `/profile/update/resend-code` mounted under both `/profile/update` and `/api/profile/update`).
  - Hashed verification record storage with atomic Lua attempt incrementing, delivery status tracking (`sent` | `failed`), attempt count, and last sent timestamp.
  - String normalization & email masking utilities with conservative casing (preserving McDonald, O'Brien, van der Berg) and single-char local part masking.
  - Strict 10-step conversational state machine in `profileNode` templated from message constants, with cooldown handling on auto-trigger, confirmation restatement, and fallback branching.
  - UI state machine and action buttons ("Send code", "Resend code", "Contact support") with server-timestamp-derived countdown timers.

## 3. Scope IN / Scope OUT
- **Scope IN:**
  - Backend endpoints: `POST /profile/update/request-code`, `POST /profile/update/verify`, `POST /profile/update/resend-code` (mounted under both `/profile/update` and `/api/profile/update`, protected by Bearer token auth).
  - Verification record storage in Redis with SHA-256 hashing, 600s code validity (`expiresAt`), 900s Redis storage TTL, max 5 attempts with atomic Lua increment, 60s resend cooldown (15s on send failure), and delivery status (`sent` | `failed`).
  - Name normalization utility: trims, collapses whitespace, applies conservative title-casing (preserving McDonald, O'Brien, van der Berg), preserves raw input, and requires explicit confirmation before committing.
  - Email masking utility: handles standard, single-char local part (`a@example.com`), whitespace-only fallback, and multi-subdomain edge cases.
  - Assistant conversational flow: enforces strict steps 1-10 sequence using centralized message constants, eliminates circular system leaks, handles missing email, handles cooldown on auto-trigger, and triggers code delivery directly on confirmation.
  - Frontend UI components: 9-state machine in `verification-prompt.tsx`, server-timestamp-derived timers, explicit action buttons ("Send code", "Resend code", "Contact support"), validity timer (10m), resend cooldown counter (60s), and contextual failure alerts.
  - Comprehensive acceptance test suite covering all mandatory acceptance scenarios + concurrency, idempotency, edge cases, `no_change`, and recovery loops.
- **Scope OUT:**
  - Updating immutable fields (e.g. email change requires separate dedicated account recovery flow). "Use a different email" is out of scope and replaced by "Contact support" or "Update account email (Contact Support)".
  - Webhook delivery status tracking (e.g., mail delivery bounces via external Resend webhooks). Status is strictly `'sent' | 'failed'`.
  - Modifying protected persistence tables in `schema.ts`.
  - Adding external SMS providers (email verification remains primary).

## 4. Open Decisions & Tradeoffs
- **OD-26a: Verification Storage Layer & Raw Input Lifecycle:**
  - *Decision:* Store verification records in Redis under `profile:verify:{userId}` with SHA-256 hashed code, JSON payload (`{ codeHash, expiresAt, attempts, maxAttempts, lastSentAt, deliveryStatus, pendingUpdates: { name, defaultAddress, originalSnapshot: { name, defaultAddress }, rawInput: { name?, defaultAddress? } } }`), and 900s Redis TTL (greater than 600s code expiry to inspect expired status).
  - *Privacy & Logging Rule:* `rawInput` is stored solely in transient Redis session memory for customer confirmation restatement; it is NEVER serialized to server logs, error payloads, or external API responses. It is permanently discarded upon verification success and upon TTL eviction.
- **OD-26b: Code Hashing Algorithm:**
  - *Decision:* `crypto.createHash('sha256').update(code).digest('hex')`. Sub-millisecond execution, standard for short-lived 6-digit OTP codes.
- **OD-26c: Resend Policy on Attempts & Cooldown:**
  - *Policy:* `resend-resets-attempts = yes`. When a new code is re-issued or resent, the previous code hash is overwritten, expiration reset to `now + 600s`, and `attempts` reset to 0. Cooldown key `profile:verify:cooldown:{userId}` is set for 60s (`SET NX EX 60`).
  - *On Verify Success:* The Redis cooldown key is deleted immediately (`DEL profile:verify:cooldown:{userId}`) along with the verification record, so subsequent user actions are not locked.
- **OD-26d: Delivery Failure Policy & Send Cooldown Tradeoff:**
  - `sendEmail` is non-throwing; it returns `Promise<EmailResult>` where `EmailResult = { success: true; data: { messageId } } | { success: false; error: { code, message } }`.
  - On delivery failure: record `deliveryStatus: 'failed'`, delete the unusable code hash so an undelivered code cannot be used.
  - *Failure Cooldown Tradeoff:* Instead of penalizing the user with a 60s wait when the mail provider suffers a transient error, set a shorter 15s cooldown on failure (`SET EX 15`). Return `{ status: 'failed', reason: sendResult.error.code, resend_after: 15, resend_at: Date.now() + 15_000 }`.
- **OD-26e: Concurrency & Stale Read Mitigation (Snapshot Conditional Update):**
  - When `request-code` reads the current profile, it captures `originalSnapshot: { name: user.name, defaultAddress: user.defaultAddress }`.
  - In `verify`, the database update applies a conditional WHERE clause:
    `WHERE id = :userId AND name = :snapshotName AND default_address = :snapshotAddress`.
  - If the user row was concurrently updated in another session, 0 rows are affected $\to$ returns `{ status: "conflict", message: "Your profile was modified in another session. Please review your profile and try again." }`.
  - Zero schema changes required; completely prevents silent overwrite of concurrent edits.

## 5. Steps (Ordered)

### Step 1: Profile Verification Storage & Service (`profile-verification.service.ts`)
- **Files touched:**
  - `server/src/services/profile-verification.service.ts` (new)
  - `server/src/services/profile-verification.service.test.ts` (new)
- **Details:**
  - Constants: `VERIFICATION_TTL_SECONDS = 600` (10 mins), `REDIS_STORAGE_TTL_SECONDS = 900` (15 mins), `RESEND_COOLDOWN_SECONDS = 60`, `FAILURE_COOLDOWN_SECONDS = 15`, `MAX_ATTEMPTS = 5`.
  - Redis storage key: `profile:verify:{userId}`. Cooldown key: `profile:verify:cooldown:{userId}`.
  - Atomic verification via Redis Lua script:
    - Return codes: `OK | EXPIRED | TOO_MANY_ATTEMPTS | INVALID`.
    - Script checks `now < expiresAt`, checks `attempts < maxAttempts`, checks SHA-256 hash match.
    - If hash matches: returns `OK`.
    - If expired: returns `EXPIRED` (read-only, no state write).
    - If attempts >= 5: returns `TOO_MANY_ATTEMPTS` (read-only, no state write).
    - If hash mismatch: increments `attempts` by 1 and returns `INVALID` with remaining attempts count. Note: `INVALID` is the ONLY branch that performs a state write.
  - Wrap all Redis operations in try/catch; on Redis connection/command failure, return structured `{ success: false, error: { code: 'VERIFICATION_SERVICE_UNAVAILABLE', message: 'Verification service is temporarily unavailable. Please try again shortly.' } }`.
  - `DEL profile:verify:cooldown:{userId}` and `DEL profile:verify:{userId}` on verification success.
  - `resend-resets-attempts = yes` on new code issue.
  - Functions:
    - `issueProfileVerificationCode(userId, pendingUpdates, originalSnapshot)`
    - `verifyProfileVerificationCode(userId, code)`
    - `resendProfileVerificationCode(userId)`
- **Checks:** Unit tests covering atomic attempts increment, 6th attempt idempotency (no state mutation on 6th attempt), expired code with surviving Redis key, cooldown deletion on success, failure cooldown (15s), and resend reset.

### Step 2: Backend REST Endpoints (`profile-update.routes.ts`)
- **Files touched:**
  - `server/src/api/routes/profile-update.routes.ts` (new)
  - `server/src/api/controllers/profile-update.controller.ts` (new)
  - `server/src/api/routes/profile-update.routes.test.ts` (new)
  - `server/src/api/app.ts` (mount `/profile/update` and `/api/profile/update` with auth middleware)
- **Details:**
  - Timestamp units: Epoch milliseconds everywhere (`expires_at`, `resend_at`), with `resend_after` in seconds for display.
  - Zod schemas with cross-field validation:
    ```ts
    const RequestCodeSchema = z.object({
      userId: z.string().uuid(),
      field: z.enum(['name', 'defaultAddress', 'both']),
      name: z.string().optional(),
      defaultAddress: z.string().optional(),
    }).superRefine((data, ctx) => {
      if (data.field === 'name') {
        if (!data.name || data.name.trim().length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name is required when field is "name"', path: ['name'] });
        }
        if (data.defaultAddress !== undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'defaultAddress must not be provided when field is "name"', path: ['defaultAddress'] });
        }
      } else if (data.field === 'defaultAddress') {
        if (!data.defaultAddress || data.defaultAddress.trim().length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'defaultAddress is required when field is "defaultAddress"', path: ['defaultAddress'] });
        }
        if (data.name !== undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'name must not be provided when field is "defaultAddress"', path: ['name'] });
        }
      } else if (data.field === 'both') {
        if (!data.name || data.name.trim().length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name is required when field is "both"', path: ['name'] });
        }
        if (!data.defaultAddress || data.defaultAddress.trim().length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'defaultAddress is required when field is "both"', path: ['defaultAddress'] });
        }
      }
    });
    ```
  - `POST /profile/update/request-code`:
    - Checks user profile in DB. If no email on file, returns `{ status: "no_email", message: "No email address found on profile. Please add an email address first." }`.
    - Early return `no_change`: If normalized `name` and/or `defaultAddress` match user's current DB profile, return `{ status: "no_change", message: "The requested details already match your current profile." }` without issuing a code.
    - Normalizes name conservatively.
    - Captures `originalSnapshot: { name: user.name, defaultAddress: user.defaultAddress }`.
    - Calls `issueProfileVerificationCode`, renders verification template, and calls `sendEmail`.
    - `sendEmail` is non-throwing. If `!sendResult.success`: records `deliveryStatus: 'failed'`, sets 15s cooldown, returns `{ status: "failed", reason: sendResult.error.code, masked_email: maskEmail(user.email), resend_after: 15, resend_at: Date.now() + 15_000 }`.
    - On success: returns `{ status: "sent", masked_email: maskEmail(user.email), expires_at: expiresAtMs, resend_after: 60, resend_at: resendAtMs }`.
    - On Redis unavailable: returns 503 `{ status: "service_unavailable", message: "Verification service is temporarily unavailable. Please try again shortly." }`.
  - `POST /profile/update/verify`:
    - Input: `userId`, `code`.
    - Uses atomic Lua verification.
    - On `OK`: applies conditional DB update (`WHERE id = :userId AND name = :snapshotName AND default_address = :snapshotAddress`). If 0 rows affected, returns `{ status: "conflict", message: "Profile was modified in another session. Please review and try again." }`. Otherwise deletes verification keys and returns `{ status: "ok", updated_fields: { name, defaultAddress } }`.
    - On failure: returns `{ status: "invalid" | "expired" | "too_many_attempts", remaining_attempts?: number }`.
  - `POST /profile/update/resend-code`:
    - Checks cooldown; on cooldown returns 429 `{ status: "cooldown", resend_after: remainingSeconds, resend_at: resendAtMs }`.
    - Otherwise re-issues code (attempts reset to 0) and re-sends email.
- **Checks:** Supertest tests for `"sent"`, `"failed"`, `"no_email"`, `"no_change"`, `"ok"`, `"invalid"`, `"expired"`, `"too_many_attempts"`, `"conflict"`, `"service_unavailable"`, and 401 unauthenticated on both mounts.

### Step 3: Name Normalization & Email Masking Utility
- **Files touched:**
  - `server/src/shared/normalization.ts` (new)
  - `server/src/shared/normalization.test.ts` (new)
- **Details:**
  - `maskEmail(email: string): string`
    - Handles single-char local part: `a@example.com` $\to$ `a***@example.com`.
    - Standard: `john.doe@example.com` $\to$ `j***@example.com`.
    - Multi-domain: `support@mail.co.uk` $\to$ `s***@mail.co.uk`.
    - Invalid, empty, or whitespace-only (`"   "`): returns `""`.
  - `conservativeTitleCaseName(raw: string): string`
    - Trims, collapses whitespace: `raw.trim().replace(/\s+/g, ' ')`.
    - Preserves internal capitals (e.g. `McDonald`, `O'Brien`, `MacLeod`).
    - Preserves lowercase particles (e.g. `van der Berg`, `von`, `de`, `la`).
    - Preserves hyphens (e.g. `Smith-Jones`).
    - Only converts words that are entirely lowercase or entirely uppercase to Title Case (e.g. `"irfan billo raja"` $\to$ `"Irfan Billo Raja"`, `"IRFAN BILLO"` $\to$ `"Irfan Billo"`).
  - `normalizeName(raw: string): { normalized: string; raw: string; isValid: boolean }`.
- **Checks:** Unit tests with test cases: `McDonald`, `O'Brien`, `van der Berg`, `Smith-Jones`, `a@example.com`, `user@sub.domain.com`, whitespace-only email, and edge cases.

### Step 4: Assistant Logic in Profile & Account Specialists
- **Files touched:**
  - `server/src/agents/specialists/profile/profile-messages.ts` (new centralized message constants)
  - `server/src/agents/specialists/profile/profile.ts`
  - `server/src/agents/specialists/profile/profile.test.ts`
  - `server/src/agents/specialists/account-access/account-access.ts`
  - `server/src/agents/specialists/account-access/account-access.test.ts`
- **Details:**
  - Centralize all customer copy in `profile-messages.ts` (zero ad-hoc or system-leak strings):
    - `ASK_WHAT_TO_CHANGE`, `ASK_NEW_NAME`, `ASK_NEW_ADDRESS`
    - `CONFIRM_CHANGE(normalized, raw)`
    - `NO_EMAIL_ON_FILE`
    - `CODE_SENT(maskedEmail, ttlMinutes, cooldownSeconds)`
    - `COOLDOWN_ACTIVE(seconds)`
    - `SEND_FAILED(maskedEmail, cooldownSeconds)`
    - `ENTER_CODE_PROMPT`
    - `CODE_EXPIRED`
    - `TOO_MANY_ATTEMPTS`
    - `UPDATE_SUCCESS(name, defaultAddress)` (echoes the final stored normalized values from DB, never rawInput)
  - Sequence:
    1. User states intent $\to$ asks what to change.
    2. User specifies value (e.g. `"irfan billo raja"`).
    3. Normalizes name $\to$ Restates change: `"You requested to update your name to **Irfan Billo Raja** (from input: *'irfan billo raja'*). Is this correct?"`.
    4. User confirms:
       - If no email: branches to `NO_EMAIL_ON_FILE` ("You do not have an email address on file. Please add an email address to your profile first.").
       - If user is in cooldown: branches to `COOLDOWN_ACTIVE(seconds)` with "Resend code in Xs" action.
       - If email exists and cooldown clear: triggers code delivery server-side.
    5. On delivery success: shows `CODE_SENT` (masked email, 10 min window, check spam).
    6. On delivery failure: shows `SEND_FAILED` with options ("Resend code in 15s", "Contact support").
    7. User enters code $\to$ validates server-side $\to$ DB updated $\to$ confirms with stored normalized value `UPDATE_SUCCESS`.
    8. On `too_many_attempts`: Assistant explicitly informs customer: "Too many failed verification attempts. Your previous code has been invalidated. Please click 'Resend code' to generate a fresh code (which resets attempts to 0) or contact support."
- **Checks:** Subgraph unit tests verifying the exact sequence, cooldown branch on auto-trigger, confirmation restatement, and copy templating.

### Step 5: Frontend UI Verification States & Action Buttons
- **Files touched:**
  - `client/src/components/chat/verification-prompt.tsx`
  - `client/src/components/chat/verification-prompt.test.tsx`
  - `client/src/types/api.ts`
- **Details:**
  - Remove circular/system-leak text `"Verification Required — Identity verification required."`.
  - Define state machine:
    - `IDLE`: No banner.
    - `AWAITING_SEND`: "Please confirm your profile update to send a verification code." Button: "Send code".
    - `SENDING`: "Sending verification code...".
    - `SENT_AWAITING_CODE`: "Verification code sent to {maskedEmail}. Valid for 10 minutes. Please check your spam folder." Shows OTP input hint.
    - `COOLDOWN_ACTIVE`: "Code sent. Resend available in {remainingSeconds}s." Resend button disabled with countdown.
    - `SEND_FAILED`: "We could not deliver your verification code. You can resend in {remainingSeconds}s or contact support." Buttons: "Resend code", "Contact support".
    - `EXPIRED`: "Your verification code has expired. Please request a new code." Button: "Resend code".
    - `LOCKED_OUT`: "Too many failed verification attempts. Please click 'Resend code' to generate a fresh code (which resets attempts to 0) or contact support." Buttons: "Resend code", "Contact support".
    - `VERIFIED`: "Identity verified. Applying profile updates...".
  - Timers are derived from server epoch timestamps (`expiresAtMs - Date.now()`, `resendAtMs - Date.now()`) to prevent local clock drift.
  - Buttons:
    - `"Send code"`
    - `"Resend code"` (with live countdown)
    - `"Contact support"`
- **Checks:** Component tests for all 9 states, server-timestamp countdowns, and action clicks.

### Step 6: End-to-End Acceptance Test Suite
- **Files touched:**
  - `server/src/api/profile-verification-flow.integration.test.ts` (new)
- **Details:**
  - Acceptance tests:
    1. **Happy path:** name change with valid email $\to$ conservative restatement $\to$ auto-send code $\to$ enter code $\to$ DB updated and confirmed.
    2. **Mail API error & two-phase recovery:**
       - Phase (a): Mail API returns error $\to$ response status `"failed"`, code hash deleted (unusable), failure alert + resend cooldown (15s) + contact support shown.
       - Phase (b): Advance past 15s cooldown $\to$ call `resend-code` (mail API succeeds) $\to$ enter code $\to$ verify succeeds $\to$ DB updated.
    3. **No email on file:** user without email $\to$ branched to add/verify email, zero send calls attempted.
    4. **Expired code:** code past 10 minutes $\to$ status `"expired"`, resend offered.
    5. **Wrong code 5x:** 5 incorrect attempts $\to$ status `"too_many_attempts"`, lockout enforced, new code required.
    6. **6th attempt idempotency:** 6th attempt continues returning `"too_many_attempts"` without state write or modifying DB.
    7. **Concurrent verify:** simultaneous verify calls with wrong code increment attempts atomically via Lua script (no lost updates).
    8. **No change early return:** requesting current name returns `"no_change"` without sending email.
    9. **Concurrent edit conflict:** profile updated in another session between request-code and verify $\to$ returns `"conflict"`, no overwrite.
    10. **Service unavailable:** Redis connection failure $\to$ returns 503 `"service_unavailable"`.
    11. **Unauthenticated guard:** unauthenticated request to both `/profile/update/request-code` and `/api/profile/update/request-code` returns 401.
    12. **Name normalization edge cases:** `McDonald`, `O'Brien`, `van der Berg`, `irfan billo raja` confirmed before DB commit.
    13. **Mask edge cases:** single-char local part (`a@example.com`), multi-level subdomains, whitespace-only email.
- **Checks:** All 13 acceptance tests passing against real Postgres, Redis, and mocked email service.

## 6. Functional Requirements
- Strict 10-step sequence with confirm-before-commit and server-side code generation.
- Never expose or return raw verification codes in logs, API responses, or UI.
- `rawInput` is never logged, serialized to API responses, or stored beyond transient session memory; permanently discarded upon verify and TTL eviction.
- Log send attempts, delivery status (`sent`, `failed`), and error codes for observability without logging raw email or code.
- Strict cooldown (60s on success, 15s on failure) and expiration (10m) enforcement.

## 7. Non-Functional Requirements
- **Consistency:** Exact matching between backend REST endpoint and assistant tool execution.
- **Security:** Hashed code storage (SHA-256), 5-attempt limit before invalidation, atomic Lua increments, zero PII leakage.
- **Observability:** Structured logging of messageId and delivery status.
- **Testability:** 100% deterministic test coverage with Vitest and Supertest.

## 8. Acceptance Criteria
- All 13 specified acceptance tests in `server/src/api/profile-verification-flow.integration.test.ts` pass.
- `npm run typecheck` passes with 0 errors across both `server/` and `client/`.
- `npm run lint` passes with 0 errors across both `server/` and `client/`.
- No regressions in existing cross-domain scenarios (`npm test -- src/graphs/parent/parent-graph-cross-domain.integration.test.ts`).

## 9. Risks and Stop Points
- Any modification to protected files (`schema.ts`, `conversation-state.ts`, `events.ts`, `checkpointer/*`) is strictly forbidden.
- Redis concurrency: Read-modify-write on attempts must use a Redis Lua script (`OK | EXPIRED | TOO_MANY_ATTEMPTS | INVALID` where only `INVALID` writes) to prevent concurrent race conditions from bypassing the 5-attempt limit.
- If Redis is unavailable, return structured `VERIFICATION_SERVICE_UNAVAILABLE` (HTTP 503) rather than crashing.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
