# Phase 23 — Stabilization — PLAN (status: APPROVED)

## Approvals
- 2026-11-09: APPROVED: live Gemini smoke
- 2026-11-09: APPROVED: Phase 23 Stabilization Plan and OD-24a, OD-24b, OD-24c

## 1. Goal and How it Fits the Architecture
The stabilization phase addresses real-user customer journey failures identified during post-Phase 22 review. While synthetic evaluations with injected state pass, real logged-in users encounter identity disconnects (Bearer sessions lacking gate verification), unhandled BLOCKED specialist branches returning empty responses (502 / SSE error), unconfirmed automated financial mutations, and cross-turn handoff exhaustion. This phase establishes hardened session-identity seeding, uniform blocked-workflow responses, strict owner-scoped tool permissions, robust router state lifecycle, and human review escalation for payment disputes without destabilizing underlying checkpointer or access control foundations.

## 2. Dependencies Satisfied / Missing
- Satisfied:
  - Database schema, Drizzle ORM, PostgresSaver checkpointer, Redis verification service (Phases 1–6).
  - 6 concrete domain specialists and parent router graph with Command(goto) dispatch (Phases 7–12).
  - Failure handling, loop detection, and LangSmith tracing infrastructure (Phases 13–14).
  - REST & SSE Express backend, auth middleware, and customer chat Next.js UI (Phases 16–22).
  - STATUS.md verified baseline: 586/586 server tests (67 files), 144/144 client tests (28 files). Total: 730 passing tests.
- Missing (to be created in this phase):
  - Pure session-identity resolver (`server/src/state/session-identity.ts`).
  - Unified blocked reply helper (`server/src/state/blocked-workflow.ts`).
  - `review_requests` table and Drizzle migration for duplicate charge escalations.

## 3. Scope IN / Scope OUT
- Scope IN:
  - Step 1a: Pure session-identity resolver (`state/session-identity.ts`), `req.authMethod` tracking in `auth.middleware.ts`, and identity propagation in `message.controller.ts`.
  - Step 1b: Shared `createBlockedResponse` helper across all 6 specialists; verify every specialist consumes `resumeContext` and clears `activeWorkflow` upon resolution.
  - Step 2: Security hardening: owner-scoped tools (enforce `userId` matching `order.userId`), disable guest/demo endpoints in production, `crypto.randomInt` OTP generation, OTP lockout across re-issues, Express rate limiting, payload/message length caps, sanitized SSE error events.
  - Step 3: Router hardening: sticky routing guards for `verify_identity` and `WAITING_FOR_USER_INPUT` steps, classifier domain context injection, turn-scoped handoff counter with single ownership in parent router, loop detection exclusion for valid resume transitions, accurate decision types (`INITIAL_ROUTE`, `HANDOFF`, `RE_ROUTE`, `RESUME`, `ESCALATION`).
  - Step 4: Duplicate charge workflow redesign: interactive confirmation dialog, `review_requests` persistence table + migration, human staff review escalation (no auto-refunds).
  - Step 5: Intent alignment in Returns/Refunds, pre-write readbacks, removal of ungrounded policy hallucination fallbacks, unique DB indexes.
  - Step 6: LLM invocation timeouts and single-retry policy, tool retry alignment (idempotent read queries only; mutations never retried), deferred `agent_executions` completion status updates, per-thread advisory lock for concurrent message prevention.
  - Step 7: Multi-turn end-to-end HTTP integration tests, opt-in live Gemini smoke suite, documentation reconciliation.
- Scope OUT:
  - Adding new agents or changing the 6-specialist domain taxonomy.
  - Changing Redis into the checkpointing path.
  - Altering the Drizzle single-schema architecture (`schema.ts`).
  - Direct cross-specialist lateral edges (parent router remains the sole hub).

## 4. Open Decisions Requiring Approval
- **OD-24a (Identity Seeding Boundary):** Introduce pure helper `server/src/state/session-identity.ts` mapping `authMethod === 'bearer'` to `LIGHTLY_VERIFIED` (`method: 'session'`) while preserving `VERIFIED` only within TTL (15m). Helper never emits `VERIFIED`. (Proposal in OPEN-DECISIONS.md).
- **OD-24b (Duplicate Charge Review Escalation):** Add `review_requests` table to `schema.ts` with Drizzle migration. Replace automatic `createRefund` execution with customer confirmation + staff review queue. (Proposal in OPEN-DECISIONS.md).
- **OD-24c (Per-Turn Handoff Counting Semantics):** Redefine `handoffCount` to be turn-scoped and strictly owned by `routerNode` (specialists never emit handoff deltas). (Proposal in OPEN-DECISIONS.md).

## 5. Execution Steps

### Step 1a: Session-Identity Seeding & Propagation
- **Files touched:**
  - `server/src/state/session-identity.ts` (NEW)
  - `server/src/state/session-identity.test.ts` (NEW)
  - `server/src/api/middleware/auth.middleware.ts`
  - `server/src/api/types.ts`
  - `server/src/api/controllers/message.controller.ts`
  - `server/src/services/conversation-lifecycle.service.ts`
- **Protected files affected:** None.
- **State ownership & changes:**
  - `authMiddleware` attaches `req.authMethod: 'bearer' | 'x-user-id' | 'guest'`.
  - `resolveSessionIdentity(authMethod, currentIdentity, now)` returns updated `IdentityState`.
  - Bearer users receive `status: 'LIGHTLY_VERIFIED'`, `verificationMethod: 'session'`, `verifiedAt: now.toISOString()`.
  - Existing `status: 'VERIFIED'` preserved only if `now - verifiedAt < 15 minutes`; otherwise downgraded to `LIGHTLY_VERIFIED`.
  - Guest and `x-user-id` callers always return `status: 'UNVERIFIED'`.
  - `message.controller.ts` passes the resolved identity as initial input to `graph.stream` and `graph.invoke`.
- **Failure cases:**
  - Malformed `verifiedAt` timestamp in checkpoint: safely defaults to `LIGHTLY_VERIFIED`.
  - Missing `req.user`: rejected by auth middleware before reaching controller.
- **Tests:** `session-identity.test.ts` unit tests covering all permutations; `messages.test.ts` Bearer session integration tests.

### Step 1b: Universal Blocked-Reply Helper & ActiveWorkflow Cleanup
- **Files touched:**
  - `server/src/state/blocked-workflow.ts`
  - `server/src/state/blocked-workflow.test.ts`
  - `server/src/agents/specialists/order-tracking/order-tracking.ts`
  - `server/src/agents/specialists/returns/returns.ts`
  - `server/src/agents/specialists/payment/payment.ts`
  - `server/src/agents/specialists/refund/refund.ts`
  - `server/src/agents/specialists/profile/profile.ts`
- **Protected files affected:** None (`blocked-workflow.ts` is in `state/` but is not in protected list).
- **State ownership & changes:**
  - Export `createBlockedResponse(input: BuildBlockedWorkflowInput, customerMessage: string): ConversationStateUpdate`.
  - Guarantees `workflowStatus: 'WAITING_FOR_USER_INPUT'` and an array containing a customer-facing `AIMessage` on EVERY blocked branch.
  - Refactor all 5 gated specialists (`order-tracking`, `returns`, `payment`, `refund`, `profile`) to use `createBlockedResponse`.
  - Fix all 5 BLOCKED branches in `refund.ts` to emit explanatory messages.
  - Audit every specialist to ensure `activeWorkflow: null` is explicitly returned when a workflow completes.
- **Failure cases:** Empty message string passed: helper enforces a non-empty fallback message.
- **Tests:** Unit tests in `blocked-workflow.test.ts` asserting message presence; specialist tests asserting `AIMessage` emission on gate block.

### Step 2: Security Hardening & Isolation
- **Files touched:**
  - `server/src/tools/queries/order.tools.ts`
  - `server/src/tools/queries/payment.tools.ts`
  - `server/src/tools/mutations/return.tools.ts`
  - `server/src/tools/mutations/identity.tools.ts`
  - `server/src/services/verification.service.ts`
  - `server/src/api/routes/demo.routes.ts`
  - `server/src/api/routes/ops.routes.ts`
  - `server/src/api/middleware/auth.middleware.ts`
  - `server/src/api/app.ts`
  - `server/src/shared/config.ts`
- **Protected files affected:** None.
- **State ownership & changes:**
  - Add ownership check to query tools: caller `userId` must match `order.userId` / `payment.userId` (returns `NOT_FOUND` if mismatch, preventing IDOR).
  - Disable demo and dev routes (`/api/demo-users`, `/api/dev/*`, `/api/ops/*`) when `NODE_ENV === 'production'` or `ENABLE_DEMO_ENDPOINTS === 'false'`.
  - In production, reject `x-user-id` header (require valid signed Bearer token).
  - Replace `Math.random` OTP generation with `crypto.randomInt(100000, 999999).toString()`.
  - Fix Redis lockout: failed attempt counters persist across code re-issues within the 10-minute TTL.
  - Add rate limiting middleware (`express-rate-limit`) on `/api/conversations` and message dispatch.
  - Enforce message content max length of 2000 chars.
  - Sanitize SSE error events to never leak internal stack traces or database errors.
- **Failure cases:** Cross-tenant ID access attempt: returns `NOT_FOUND` without leaking entity existence.
- **Tests:** Tool ownership tests; auth middleware rejection tests in production mode; OTP randomness and lockout tests.

### Step 3: Router Hardening & Handoff Lifecycle
- **Files touched:**
  - `server/src/graphs/parent/parent-graph.ts`
  - `server/src/routing/guards.ts`
  - `server/src/routing/classifier/classifier.ts`
  - `server/src/graphs/parent/parent-graph.test.ts`
- **Protected files affected:** None (`parent-graph.ts` is not protected; `guards.ts` is adjacent but not in protected list).
- **State ownership & changes:**
  - Add sticky guard in `evaluatePreClassificationGuards`: if `activeWorkflow.currentStep === 'verify_identity'` and `activeWorkflow.blockedBy` is present, route directly to `account_access` without invoking LLM classification.
  - Extend sticky continuation guard: if an active specialist left `workflowStatus === 'WAITING_FOR_USER_INPUT'`, route back to that specialist for input completion.
  - In `classifyMessage`, inject `currentDomain` and `previousAgent` into prompt context so LLM understands conversation continuity.
  - Reset `handoffCount` to 0 at the start of each new user turn. Router is the sole entity that increments `handoffCount` on `HANDOFF` or `RE_ROUTE`. Specialists never increment handoff count.
  - Exclude `RE_ROUTE` (resumes) from `isRoutingLoop` triggering.
  - Properly record decision types: `INITIAL_ROUTE` for new turns/continuation, `HANDOFF` for lateral hops, `RE_ROUTE` for unblocked resume, `RESUME` for returnTo.
- **Failure cases:** Customer inputs arbitrary text while in verification: sticky guard keeps conversation focused on verification until completed or cancelled.
- **Tests:** Router tests for verification interception, turn reset, and resume loop exemption.

### Step 4: Duplicate Charge Flow Redesign & Human Review Queue
- **Files touched:**
  - `server/src/persistence/db/schema.ts`
  - `server/src/persistence/db/migrations/*` (new migration)
  - `server/src/persistence/repositories/review-request.repository.ts` (NEW)
  - `server/src/agents/specialists/payment/payment.ts`
  - `server/src/agents/specialists/refund/refund.ts`
  - `server/src/tools/mutations/refund.tools.ts`
- **Protected files affected:** `server/src/persistence/db/schema.ts` (requires Tier 2 approval under OD-24b).
- **State ownership & changes:**
  - Define `review_requests` table: `id`, `conversationId`, `userId`, `orderId`, `paymentId`, `duplicatePaymentId`, `amount`, `status`, `reason`, timestamps.
  - In `payment.ts`, when `detectDuplicateCharge` reports potential duplicate:
    1. Ask the customer to confirm: "We detected two charges of $X for order Y. Would you like our billing team to review and refund this charge?"
    2. Set `workflowStatus: 'WAITING_FOR_USER_INPUT'`, `resumeContext: { awaitingDuplicateConfirmation: true, ... }`.
  - When customer confirms: create a record in `review_requests` with `status: 'pending'`, inform customer that human review request #ID is submitted, and transition to `COMPLETED`. No automated refund mutation.
- **Failure cases:** User declines duplicate charge refund: cancel pending action gracefully and complete turn.
- **Tests:** Migration verification test; repository unit tests; Payment duplicate charge confirmation flow tests.

### Step 5: Intent Alignment, Readback & Policy Grounding
- **Files touched:**
  - `server/src/agents/specialists/returns/returns.ts`
  - `server/src/agents/specialists/refund/refund.ts`
  - `server/src/persistence/db/schema.ts` (indexes)
- **Protected files affected:** None.
- **State ownership & changes:**
  - In `returns.ts` and `refund.ts`, respect extracted intent (`check_status` vs `create_return` vs `check_eligibility`). Do not initiate creation when user only asked for status.
  - Readback before writes: before creating a return or refund review, verify current DB status has not changed concurrently.
  - Remove all fallback policy strings that hallucinate rules when RAG returns empty; strictly emit grounded standard decline messages.
  - Add unique indexes on `returns (order_id)` and `refunds (payment_id)` to enforce database-level idempotency against race conditions.
- **Failure cases:** Concurrent duplicate return requests: rejected by unique DB constraint and handled gracefully.
- **Tests:** Specialist status vs create intent tests; concurrency collision tests.

### Step 6: Resilience, Idempotent Retries & Advisory Locking
- **Files touched:**
  - `server/src/agents/llm/client.ts`
  - `server/src/tools/execution.ts`
  - `server/src/routing/events.ts`
  - `server/src/api/controllers/message.controller.ts`
- **Protected files affected:** `server/src/routing/events.ts` (protected - only non-breaking update for execution completion).
- **State ownership & changes:**
  - In `client.ts`, add 10-second timeout and single exponential-backoff retry on LLM network/rate-limit errors.
  - In `execution.ts`, restrict tool retry strictly to idempotent read tools (`getOrder`, `getPayment`, `getProfile`, `searchKnowledge`). Never retry mutation tools (`createReturn`, `createRefund`, `updateProfile`).
  - Align retry error codes with real Postgres/pg errors (`ECONNREFUSED`, `ETIMEDOUT`, `57P01`).
  - In `agent_executions`, defer status update to the end of the node execution so failures reflect actual outcomes.
  - In `message.controller.ts`, acquire a PostgreSQL advisory lock (`pg_try_advisory_xact_lock(hashtext(conversationId))`) during message execution to block concurrent turns on the same thread.
- **Failure cases:** Rapid concurrent POST requests on same conversation: second request receives 409 Conflict.
- **Tests:** Advisory lock test; mutation non-retry assertion test; LLM timeout test.

### Step 7: Multi-Turn HTTP Integration Tests & Documentation
- **Files touched:**
  - `server/src/api/stabilization.integration.test.ts` (NEW)
  - `server/src/test/live-smoke.test.ts` (NEW, opt-in via env flag)
  - `docs/STATUS.md`
  - `docs/DECISIONS.md`
  - `docs/OPEN-DECISIONS.md`
  - `docs/ROADMAP.md`
- **Protected files affected:** None.
- **State ownership & changes:**
  - Multi-turn HTTP integration test: real Bearer register -> login -> create order -> ask order status in chat -> verify zero 502s, `status: 'LIGHTLY_VERIFIED'`, and grounded response.
  - Multi-turn return flow test: unverified user -> login -> check eligibility -> verify OTP -> return created -> activeWorkflow cleared.
  - Opt-in live smoke suite: gated by `RUN_LIVE_GEMINI_SMOKE=true` and explicit owner approval.
  - Reconcile documentation across all completed phases.
- **Failure cases:** Live smoke fails if API key invalid or model unavailable.
- **Tests:** Full test suite execution ensuring all tests pass.

## 6. Functional Requirements
1. Logged-in Bearer token users must never be blocked by LIGHT-gated tools (`get_order`, `get_shipment_status`).
2. Every specialist BLOCKED gate outcome must produce a polite, clear customer-facing message explaining next steps.
3. The API must never respond with 502 Bad Gateway or empty SSE streams during normal customer support workflows.
4. Duplicate charge detections must require customer confirmation and route to a staff review queue rather than executing auto-refunds.
5. Inquiries about return/refund status must not initiate creation workflows.
6. A conversation can proceed across multiple turns without hitting the max handoff escalation limit.

## 7. Non-Functional Requirements
- **Security:** Zero cross-tenant data leakage (IDOR-safe tools). Zero raw verification codes or secrets in logs.
- **Integrity:** Database-level idempotency via unique indexes and advisory locks.
- **Performance:** No added network latency for normal requests; session-identity evaluation is pure in-memory math.
- **Testability:** 100% deterministic offline test suite with real Postgres and Redis. Zero real Gemini API calls during standard CI/test runs.

## 8. Acceptance Criteria
- `npm run lint` passes with 0 errors across both server and client.
- `npm run typecheck` passes with 0 errors across both server and client.
- `npm test` passes with test count strictly >= 730 baseline.
- `server/src/api/stabilization.integration.test.ts` passes end-to-end for Bearer token customer journeys.
- All 14 evaluation scenarios from REFERENCE.md continue to pass.

## 9. Risks and Stop Conditions
- **Database Schema Migration (Step 4):** Touching `schema.ts` and generating migrations requires Tier 2 owner approval. Stop and wait for approval before running `npm run db:generate` or `npm run db:migrate`.
- **Protected Files:** `server/src/state/conversation-state.ts` and `server/src/routing/events.ts` are protected. Any change requires explicit approval under OD-24c.
- **Live Gemini Calls:** Never call the live Gemini API without explicit chat approval: "APPROVED: live Gemini smoke".

## 10. Docs to Update on Completion
- `docs/STATUS.md` — report new test counts, phase state, and changelog.
- `docs/DECISIONS.md` — record approved OD-24a, OD-24b, OD-24c decisions.
- `docs/OPEN-DECISIONS.md` — mark OD-24 items as resolved.
- `docs/ROADMAP.md` — check off Phase 24 / Stabilization.
