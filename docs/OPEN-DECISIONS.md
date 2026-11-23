# OPEN DECISIONS
Process: the agent writes a proposal (options, tradeoffs, recommendation, impact, tests that would prove it), then WAITS for approval.
Approved items move to DECISIONS.md. Items marked [CONFLICT] are inconsistencies in earlier notes that need a ruling, not a design.

1. [RESOLVED 2026-11-06] Pattern A definition locked, and 14-scenario evaluation matrix confirmed:
   - Pattern A = direct specialist resolution without lateral handoff or verification block (Scenarios 1, 2, 8, 9, 14).
   - Pattern B = lateral handoff to parent router -> parent router re-routes to secondary specialist (Scenarios 3, 4).
   - Pattern C = specialist blocked by verification -> routed to Account Access -> resumes originating specialist (Scenarios 5, 6, 7).
   - Safety/Escalation = Scenarios 10, 11, 12.
   - Security Boundary = Scenario 13 (preventing unverified identity mutation).
   All 14 scenarios validated live across concrete specialists in Phase 12. Recorded in DECISIONS.md under Phase 12.
2. [RESOLVED 2026-11-05] Router design: hybrid guard+LLM classifier; `DEFAULT_MAX_HANDOFFS = 3`; `Command({ goto })` dispatch; loop = same specialist ≥ 2 consecutive visits. Recorded in DECISIONS.md under Phase 8.
3. [RESOLVED 2026-11-05] Agent LLM: `gemini-2.5-flash`, `temperature: 0.0` for routing/tool decisions, `temperature: 0.2` for customer-facing generation, `responseMimeType: 'application/json'` + Zod `responseSchema` for structured output, mockable client interface in Vitest. Recorded in DECISIONS.md under Phase 7.
4. Specialist designs, one block per specialist: scope in/out, phased workflow (entry/action/branch/exit), handoff triggers, escalation conditions, success/failure criteria.
   OD-4a [RESOLVED 2026-11-05]: Order Tracking — single-node phased subgraph. Tools: get_order, get_shipment_status (LIGHT). RAG: orders/shipping. Ambiguous orderId → WAITING_FOR_USER_INPUT. Recorded in DECISIONS.md under Phase 9.
   OD-4b [RESOLVED 2026-11-05]: Returns — single-node phased subgraph. Tools: check_return_eligibility, create_return (FULL-gated), get_return_status, get_return_by_order. RAG: orders/returns. Ineligible → RAG explain → COMPLETED. FULL block → Pattern C → WAITING_FOR_USER_INPUT. Recorded in DECISIONS.md under Phase 9.
   OD-4c [RESOLVED 2026-11-05]: Payment specialist — single-node subgraph. Tools: get_order, get_payment (FULL), detect_duplicate_charge (FULL), search_knowledge (payments/payments). If duplicate confirmed, emits Pattern B handoff to Refund. Recorded in DECISIONS.md under Phase 10.
   OD-4d [RESOLVED 2026-11-05]: Refund specialist — single-node subgraph. Tools: get_order, get_payment (FULL), get_return_status, get_return_by_order, create_refund (FULL), get_refund_status (FULL), search_knowledge (payments/refunds). Duplicate charges processed via handoff resumeContext; unlinked returns hand off to Returns; approved returns trigger structured create_refund. Recorded in DECISIONS.md under Phase 10.
   OD-4e [RESOLVED 2026-11-06]: Profile specialist — single-node phased subgraph. Tools: get_profile, update_profile (FULL-gated). No RAG. On verification block, emits Pattern C activeWorkflow with returnTo: { agent: 'account_access' }. Recorded in DECISIONS.md under Phase 11.
   OD-4f [RESOLVED 2026-11-06]: Account Access specialist — single-node subgraph. Two-mode operation: Mode 1 (Password Reset, Scenario 14) calls initiatePasswordReset with NO identity mutation; Mode 2 (Verification for Resume, Scenarios 5, 6, 7) verifies OTP code via verifyIdentity, calls buildIdentityUpdate from state/identity-update.ts, clears activeWorkflow.blockedBy to null, and dispatches Command({ goto: 'router' }) for parent router resume guard. RAG: account/account_security. Recorded in DECISIONS.md under Phase 11.
5. [RESOLVED 2026-11-05] Handoff and resume semantics: `resumeContext` = pending tool + validated args + resolved IDs; parent router writes `RE_ROUTE` event and routes to `activeWorkflow.returnTo`; resumed specialist clears `activeWorkflow` on COMPLETED. Recorded in DECISIONS.md under Phase 8.
6. [RESOLVED 2026-11-05] HandoffRequest payload shape (sourceAgent, handoffReason, detectedIntent, recommendedDomain, relevantContext, attemptedActions, confidence) and Zod validation. Recorded in DECISIONS.md under Phase 7.
7. [RESOLVED 2026-11-06] Backend API Architecture & Server Framework:
   Option A adopted — Dedicated Express.js REST application in `server/src/api/` with CORS, JSON body parser, Zod validation middleware, custom AppError hierarchy extending Error, dual-mode message responses (standard JSON + Server-Sent Events SSE streaming), x-user-id header validation against Postgres users table with guest fallback (using distinct RFC 4122 v4 UUID), and trace timeline endpoint. Recorded in DECISIONS.md under Phase 16.
8. [RESOLVED 2026-11-05] Refund specialist payment identification (Scenario 8): Option A adopted — `get_payment` (FULL gated) added to `refund` specialist allowlist in `server/src/tools/permissions.ts` and `REFERENCE.md`. Enables self-contained structured check in Scenario 8. Recorded in DECISIONS.md under Phase 10.
9. Original Stage 1/2 requirements doc is not available. Functional/non-functional requirements should be consolidated into docs/REQUIREMENTS.md during Phase 7 planning from DECISIONS + REFERENCE.
10. [RESOLVED] Phase 6 Step 6a and Step 6b signed off; Phase 6 closed.
11. [RESOLVED 2026-11-05] Pattern B lateral re-route mechanism in Parent Router: Option A adopted — existing `activeWorkflow` with `blockedBy: null` triggers `checkResumePreconditions` in router, emitting `decisionType: 'RE_ROUTE'` and dispatching `Command({ goto: targetSpecialist })`. Zero schema or state changes required. Recorded in DECISIONS.md under Phase 10.
12. [RESOLVED 2026-11-06] Tool Retry & Failure Escalation Policy (Scenario 11): Option A adopted — centralized single-retry (`maxRetries = 1`) inside `executeTool` for retryable infrastructure errors (`TIMEOUT`, `NETWORK_ERROR`, `DATABASE_ERROR`). On retry failure or unrecoverable error, specialist emits `workflowStatus: 'ESCALATED'` with human handoff message. Non-retryable domain outcomes (`NOT_FOUND`, `INVALID_ARGUMENTS`, `INELIGIBLE`) fail immediately without retry. Recorded in DECISIONS.md under Phase 13.
13. [RESOLVED 2026-11-06] Terminal `ESCALATED` State Router Guard & Fallback Routing: Option A adopted — added check in `evaluatePreClassificationGuards`: if `state.workflowStatus === 'ESCALATED'`, immediately return `{ outcome: 'ESCALATE', reason: 'Conversation in terminal ESCALATED state.' }`, preserving human handoff without invoking LLM classification. When LLM classification fails/errors, router logs `decisionType: 'FALLBACK'` and defaults safely to `order_tracking`. Recorded in DECISIONS.md under Phase 13.
14. [RESOLVED 2026-11-06] LangSmith Observability & Tracing Architecture:
    Option A adopted — Native LangGraph/LangChain tracing via `RunnableConfig` (`runName`, `tags`, `metadata`) paired with a centralized `createTraceConfig` factory in `server/src/observability/`. Tracing enabled automatically when `LANGCHAIN_TRACING_V2="true"` and `LANGCHAIN_API_KEY` is set. Tests run offline with zero external network calls. Recorded in DECISIONS.md under Phase 14.
15. [RESOLVED 2026-11-06] Evaluation Framework Architecture & Scenario Expansion:
    Option A adopted — Strongly typed in-code scenario dataset (30 scenarios expanding REFERENCE.md 1-14 with 16 new edge/failure cases) in `server/src/evaluation/dataset/scenarios.ts`; 8 deterministic binary evaluators (`ROUTING_CORRECT`, `HANDOFF_CORRECT`, `SPECIALIST_SCOPE_CORRECT`, `TOOL_SELECTION_CORRECT`, `STATE_PRESERVED`, `KNOWLEDGE_GROUNDED`, `WORKFLOW_COMPLETED`, `RESOLUTION_CORRECT`); dual-mode execution via Vitest CI suite (`npm test`) and standalone CLI report generator (`npm run eval`); maintain calibrated `MIN_SIMILARITY = 0.60`. Recorded in DECISIONS.md under Phase 15.

20. [RESOLVED 2026-11-07] Conversational Router Agent Architecture for General Inquiries & Greetings:
    Option A adopted — When the user sends greetings ("hello", "hi") or unclassified store queries, the router handles them directly via a conversational LLM greeting detailing OrchestrAI capabilities without dispatching Command({ goto: 'order_tracking' }) or requiring an order ID. The router keeps workflowStatus: 'WAITING_FOR_USER_INPUT' and transitions to specialist dispatch on the subsequent turn once a domain intent is expressed. Recorded in DECISIONS.md under Phase 20.

21. [RESOLVED 2026-11-07] Real User Authentication & Storefront Integration:
    OD-21a [RESOLVED 2026-11-07]: Password Hashing & Security Service — Option A adopted: Node.js built-in `crypto.scrypt` with 16-byte random salt, 64-byte derived key, and constant-time `crypto.timingSafeEqual`. Requires zero external binary dependencies and provides production cryptographic security.
    OD-21b [RESOLVED 2026-11-07]: Session Token Transport & Backward Compatibility — Option A adopted: Stateless signed HMAC-SHA256 Bearer session token (`Authorization: Bearer <token>`). `auth.middleware.ts` evaluates Bearer tokens first (for real registered users) and falls back cleanly to `x-user-id` header (for benchmark/eval test suites) and guest fallback for anonymous visits.
    OD-21c [RESOLVED 2026-11-07]: Order & Shipment Initialization on Checkout — Option A adopted: `POST /api/orders` executes an atomic Drizzle transaction creating `orders` (status: 'paid'), `order_items` (with unit price snapshot), `payments` (status: 'captured'), and `shipments` (status: 'in_transit' with tracking number). Enables newly registered customers to immediately query the multi-agent system regarding their order in real time. Recorded in DECISIONS.md under Phase 21.

22. [RESOLVED 2026-11-08] Mandatory User Authentication Guard & Storefront/Orders UX Architecture:
    OD-22a [RESOLVED 2026-11-08]: Client-side Navigation Guard (`useRequireAuth`) — Option A adopted: A lightweight React hook (`useRequireAuth(targetPath)`) wrapping Next.js App Router `useRouter()`. Inspects `isAuthenticated` and `isLoading` from `auth-context.tsx`. When unauthenticated, replaces the active URL with `/login?redirect=${encodeURIComponent(targetPath)}`. Ensures sessions persist across reloads via localStorage Bearer tokens and automatically redirects unauthorized visitors from `/`, `/store`, and `/orders`.
    OD-22b [RESOLVED 2026-11-08]: 1-Click Order Chat Integration via Query Parameter — Option A adopted: When the customer clicks "Ask Agent About This Order" from either `/store` checkout receipt or `/orders` history, they navigate to `/?orderId=${order.id}`. The root chat component inspects `useSearchParams().get('orderId')` within `<Suspense>` and initializes the chat message draft with `"Where is my order ${orderId}? Can you give me the latest tracking status?"`. Enables immediate single-click conversational tracking without manual copy-pasting. Recorded in DECISIONS.md under Phase 22.

23. [RESOLVED 2026-11-08] Conversational UX, Interactive Service Menu & Order Tracking Reliability:
    OD-23a [RESOLVED 2026-11-08]: Greeting Response Generation — Option A adopted: short context-aware LLM greeting generation (`temperature: 0.2`) returning `{ greeting, options }` schema instead of hardcoded repetitive script.
    OD-23b [RESOLVED 2026-11-08]: Interactive Options Transport & Rendering — Option A adopted: options transported in `AIMessage.additional_kwargs.options` -> forwarded in SSE routing event -> stored in `ChatState.serviceOptions` -> rendered as interactive `ServiceOptionBar` pills in chat.
    OD-23c [RESOLVED 2026-11-08]: Order Tracking Continuation Guard — Option A adopted: direct continuation guard in `routerNode` ensuring pending order ID collection turns re-route directly to `order_tracking` without spurious LLM re-classification. Recorded in DECISIONS.md under Phase 23.

24. [RESOLVED 2026-11-09] Phase 24 Stabilization Decisions:
    - OD-24a [RESOLVED 2026-11-09]: Identity Seeding Boundary vs. "Only Account Access Writes Identity" Invariant:
      Option A adopted — Pure helper `server/src/state/session-identity.ts`. Maps `req.authMethod === 'bearer'` to `status: 'LIGHTLY_VERIFIED'` with `verificationMethod: 'session'`. Guests and `x-user-id` callers map to `UNVERIFIED`. If checkpoint already has `status: 'VERIFIED'`, preserves `VERIFIED` only if `verifiedAt` is within 15-minute TTL, else drops to `LIGHTLY_VERIFIED`. The helper NEVER creates or elevates to `VERIFIED`. `auth.middleware.ts` sets `req.authMethod`; controller passes identity into graph input. Recorded in DECISIONS.md under Phase 24.

    - OD-24b [RESOLVED 2026-11-09]: Duplicate Charge Human Review Escalation & `review_requests` Table:
      Option A adopted — Added `review_requests` table to `server/src/persistence/db/schema.ts` with columns (`id`, `conversationId`, `userId`, `orderId`, `paymentId`, `duplicatePaymentId`, `amount`, `status`, `reason`, `createdAt`, `updatedAt`). When duplicate charge is detected, agent asks user to confirm. Once confirmed, creates a `review_requests` record with `status: 'pending'`, escalating to human review queue instead of executing an immediate automated refund. Migration `0008_nappy_thunderbolt.sql` applied. Recorded in DECISIONS.md under Phase 24.

    - OD-24c [RESOLVED 2026-11-09]: Per-Turn Handoff Counter Semantics in `ConversationState`:
      Option A adopted — Made `handoffCount` turn-scoped (reset to 0 at the start of each user turn in `message.controller.ts` via graph input `{ routing: { handoffCount: 0 } }`). Single authoritative owner: only the parent router updates `handoffCount` when executing a `HANDOFF` or `RE_ROUTE`. Specialists never emit `handoffCount` deltas. Resume transitions (`RE_ROUTE`) are exempt from loop detection. Prevents false-positive escalations while maintaining loop safety per turn. Recorded in DECISIONS.md under Phase 24.

26. [RESOLVED 2026-11-13] Phase 26 Profile Update & Identity Verification Flow:
    - OD-26a [RESOLVED 2026-11-13]: Profile-Owned Flow Architecture: Profile update flow is owned entirely by the profile specialist across a 4-step state machine (`collect_value` -> `confirm_change` -> `awaiting_code` -> database update). No Pattern C handoff to Account Access for updates.
    - OD-26b [RESOLVED 2026-11-13]: Redis Key Architecture & Namespace Isolation: `profile:verify:{userId}` (hash containing codeHash, pendingUpdates, snapshot, attempts, expiresAtMs; TTL 900s) and `profile:verify:cooldown:{userId}` (60s resend cooldown; 15s failure cooldown). In non-prod, `profile:verify:peek:{userId}` (120s TTL) supports dev/integration tests.
    - OD-26c [RESOLVED 2026-11-13]: Atomic Lua Verification & Attempt Reset: Atomic Lua script verification (`OK`, `EXPIRED`, `TOO_MANY_ATTEMPTS`, `INVALID`). Only INVALID writes (increments attempt counter). Resend resets attempts to 0. Successful verify deletes code and cooldown.
    - OD-26d [RESOLVED 2026-11-13]: Non-Throwing Email Service & Transient Failure Cooldown: `sendEmail` returns `Promise<EmailResult>` without throwing. On mail send failure, deleted unusable code, sets 15s failure cooldown to prevent rapid spamming.
    - OD-26e [RESOLVED 2026-11-13]: Snapshot-Based Optimistic Concurrency Control: SQL conditional update `WHERE id = :userId AND name = :nameSnapshot AND default_address = :addressSnapshot`. 0 rows affected returns `{ status: "conflict" }`.
    - OD-26f [RESOLVED 2026-11-13]: Frontend 7-State Machine: `VerificationPrompt` component executes `idle`, `requesting`, `awaiting_input`, `verifying`, `resending`, `success`, `locked_out` with server-timestamp countdowns and friendly customer copy. Recorded in DECISIONS.md under Phase 26.

29. [RESOLVED 2026-11-20] Phase 29 PDF RAG Pipeline & Scale Hardening:
    - OD-29a [RESOLVED 2026-11-20]: Legacy Fallback Error Guarding — Option B adopted: `retrieveKnowledge()` catches Postgres error `42P01` (`UNDEFINED_TABLE`) during legacy `knowledge_documents` fallback queries and returns `{ success: true, data: [] }` rather than throwing, ensuring safety when migration `0014_drop_knowledge_documents.sql` is applied.
    - OD-29b [RESOLVED 2026-11-20]: p95 Latency Budget Revision — Revised from `<1,000ms` to `<2,000ms`. Tail latency (>1,500ms) is attributable to Gemini `gemini-embedding-001` remote API response variance; local database query and RRF fusion latency remain steady at ~53ms and <1ms respectively.
    - OD-29c [RESOLVED 2026-11-20]: Legacy Fallback Degraded Semantics — Documented in `MIGRATION.md` and `DEPLOYMENT.md` that legacy `knowledge_documents.embedding` was populated using `text-embedding-004` (L2 norm ≈ 1.0), whereas active queries use `gemini-embedding-001` (L2 norm ≈ 0.57). Fallback provides degraded cross-space retrieval, not seamless safe fallback.
    - OD-29d [DEFERRED POST-PHASE-C]: Golden Dataset v1.0.1 Alignment — `eval-q-06` targetSectionPath currently points to `"What is email verification and why is it required?"`, but actual top-1 semantic retrieval is `"How does the verification code process work?"`. Smoke tests assert actual top-1; golden dataset update deferred.
    - OD-29e [RESOLVED 2026-11-20]: Legacy Retrieval Queries Dataset Companion — `eval/retrieval-queries.json` (30 queries) is retained as legacy artifact with companion `eval/retrieval-queries.README.md`; `eval/knowledge-golden-dataset.json` (6 queries) remains authoritative for CI.

    30. [RESOLVED 2026-11-20] Phase 29 Production Sign-Off Decisions (Phase D readiness):
        - OD-30a [RESOLVED 2026-11-20]: p95 SLI Acceptance — Accept `<2,000ms` as the production SLI for Phase D. Revised target justified by Round 34's 10-run benchmark (409–815ms stable; 1,763ms outlier unreproduced) and by the embed-bound nature of the budget (query+fusion ≈53ms; embed dominates). Query-embedding cache deferred until production data shows either (i) p95 >2,000ms with sustained frequency or (ii) repeat-query rate high enough that caching helps the actual customer mix. Revisit trigger tracked in ROADMAP.
        - OD-30b [RESOLVED 2026-11-20]: Production DB Region — Colocate backend and Neon Postgres in `us-east-2`. Neon project `withered-wildflower-96418740` region must be confirmed to match backend deploy region before ingestion; mismatch invalidates OD-30a's p95 target by 12.5–16×. **Operator gate: if backend deployment lands outside `us-east-2`, DO NOT PROCEED with ingestion — revise this decision and re-evaluate OD-30a first.**
        - OD-30c [RESOLVED 2026-11-20]: 0014 Backup Policy — Cold `pg_dump` of `knowledge_documents` taken immediately before drop, **verified via restore into throwaway DB** (schema-only minimum, full restore preferred), stored off-Neon. Second independent copy from prior day as belt-and-suspenders. PITR is a bonus check, **not relied upon as contractual recovery** — cold dump remains the sole contractual recovery mechanism regardless of Neon tier. If on a paid plan with retention >7 days, PITR adds coverage but does not change the contractual mechanism.
        - OD-30d [RESOLVED 2026-11-20]: CI Gate 2 Parallelism — Accept sequential Gate 2 (137–159s observed; ~2.5 min per RAG PR). Parallelism deferred until PR-velocity friction or CI timeouts emerge empirically. Parallelism risk (test-isolation flake, Gemini rate-limit contention during live-embedding Gate 2) outweighs speed benefit at current PR volume. Revisit trigger tracked in ROADMAP.

36. [OPEN 2026-11-23] Phase 36 Step 2b-β: HNSW GUC Strategy — Unpooled Retrieval Endpoint

   **Background**: The goal of Layer A (Phase 36 Step 3) is to remove the `BEGIN`/`COMMIT` transaction and three `SET LOCAL` statements from `searchDenseScoped` in `knowledge.repository.ts:74-97`, each of which costs one round-trip (~225ms WAN). This saves 4 of the 6 round-trips in the dense branch (RT 1–4: BEGIN + 3×SET LOCAL).

   **Blocker**: The GUC values set by those `SET LOCAL` statements (`hnsw.ef_search=100`, `hnsw.iterative_scan=relaxed_order`, `hnsw.max_scan_tuples=40000`) must be re-established at connection level before the transaction can be safely removed. Two strategies were attempted and both failed on 2026-11-23:

   - **URL `options` parameter** (`options=-c hnsw.ef_search=100`): Neon PgBouncer in transaction mode rejects custom startup parameters with error `08P01 "unsupported startup parameter in options: hnsw.ef_search"`. **Ruled out.**
   - **`ALTER ROLE neondb_owner SET "hnsw.ef_search" = 100`**: Returns `42501 permission denied to set parameter "hnsw.ef_search"`. Neon does not grant `neondb_owner` the privilege needed to alter custom GUC defaults at the role level. **Ruled out.**
   - **Session-level `SET` via `pool.on('connect')` callback**: On Neon PgBouncer in transaction mode, session-scoped `SET` persists for the lifetime of the **backend** (not the client transaction). The same backend is shared by multiple pooler clients — leaks GUC state across unrelated connections. **Ruled out as unsafe.**

   **Options**:

   **Option A — Unpooled endpoint for retrieval (Recommended)**
   - Neon provides a direct (non-pooled) connection string: `DATABASE_URL_UNPOOLED` (already configured in `server/.env` per STATUS.md, Neon deployment section).
   - On direct connections (not PgBouncer), custom GUC startup parameters ARE accepted in the `options` query param: `...&options=-c hnsw.ef_search%3D100 -c hnsw.iterative_scan%3Drelaxed_order -c hnsw.max_scan_tuples%3D40000`.
   - New env var: `DATABASE_URL_RETRIEVAL` = `DATABASE_URL_UNPOOLED` + GUC options string (operator sets this in `.env`, Railway, etc.).
   - New file: `server/src/persistence/db/retrieval-client.ts` — a small `pg.Pool` with `max: 3` reading `DATABASE_URL_RETRIEVAL`. Fails fast (throws at startup) if `DATABASE_URL_RETRIEVAL` is not set.
   - `knowledge.repository.ts` imports from `retrieval-client.ts` instead of the main `client.ts`.
   - `client.ts` (protected file): **not touched**.
   - Tradeoffs:
     - Pro: Eliminates transaction + 3×SET LOCAL; dense branch drops from 6 serial round-trips to 1.
     - Pro: Direct connection has lower latency variance (no PgBouncer queueing).
     - Pro: `retrieval-client.ts` is a new file; does not modify any protected file.
     - Con: Consumes Neon direct connection quota. `max: 3` pool is safe on Neon free tier (100 direct connection limit).
     - Con: `DATABASE_URL_RETRIEVAL` must be set in all environments (local, CI, production). Missing var must fail fast.
     - Con: Operator must add env var before deploying; minor ops complexity.

   **Option B — Accept defaults, pursue Layer B only (single CTE inside transaction)**
   - Keep the transaction and 3×SET LOCAL in `searchDenseScoped`. Do not attempt GUC migration.
   - Pursue Layer B (single CTE) only. CTE runs inside the existing transaction; SET LOCAL values still apply. Round-trip count drops from 7 total (BEGIN + 3×SET LOCAL + dense SELECT + COMMIT + sparse SELECT) to 5 (BEGIN + 3×SET LOCAL + 1 CTE SELECT + COMMIT). Net savings: 2 round-trips (~450ms WAN).
   - Tradeoffs:
     - Pro: No new env var, no new pool, no connection quota impact.
     - Pro: Simpler. No deployment change needed.
     - Con: Still pays for BEGIN + COMMIT + 3×SET LOCAL on every retrieval call. At 5 round-trips × ~225ms WAN = ~1,125ms just for overhead, well above the ~250ms WAN target.
     - Con: Co-located target (≤15ms) is unreachable with 5 serial round-trips.

   **Recommendation**: Option A. The unpooled endpoint is already provisioned. Adding `retrieval-client.ts` is a contained new file that does not modify any protected file. The GUC settings become deterministic and verifiable. Connection quota impact (`max: 3`) is negligible. This is the architecturally cleanest path to the stated latency target.

   **Implementation steps if approved**:
   1. Operator sets `DATABASE_URL_RETRIEVAL` = `<DATABASE_URL_UNPOOLED>&options=-c hnsw.ef_search%3D100 -c hnsw.iterative_scan%3Drelaxed_order -c hnsw.max_scan_tuples%3D40000` in `server/.env`.
   2. Create `server/src/persistence/db/retrieval-client.ts` (new `pg.Pool`, `max: 3`).
   3. Update `check-gucs.ts` to use the retrieval pool for verification.
   4. Run `check-gucs.ts` 5 times against the retrieval pool. All 5 must return `100/relaxed_order/40000`.
   5. Only then proceed to Step 3 (remove transaction + SET LOCAL from `searchDenseScoped`).

   **Approval gate**: Do not proceed to Step 3 until this OD is approved by owner, `DATABASE_URL_RETRIEVAL` is set, and `check-gucs.ts` returns `100/relaxed_order/40000` on all 5 consecutive runs using the retrieval pool.



