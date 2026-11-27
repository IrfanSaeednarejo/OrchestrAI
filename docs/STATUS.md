# STATUS (update at the end of every step/phase)

Last verified suite figure reported: Server 768 passing (21 skipped), Client 150/150 passing (918 total passing). Server baseline test count: 647. Client baseline test count: 144.

## Phase state
- Phases 1-23: COMPLETE and signed off.
- Phase 24 (Stabilization): COMPLETE on branch `phase/23-stabilization`.
- Phase 25 (Conversational Routing & Memory Overhaul): COMPLETE on branch `phase/24-conversational-routing`.
- Phase 26 (Profile Update + Identity Verification Flow): COMPLETE on branch `phase/26-profile-update-flow`. All 6 steps + final integration verified and passing:
  - Step 1: Profile verification service (`server/src/services/profile-verification.service.ts`) with Redis storage (`profile:verify:{userId}` 900s TTL, `profile:verify:cooldown:{userId}` 60s cooldown, 15s failure cooldown), SHA-256 code hashing, atomic Lua script for verification, `resend-resets-attempts = yes`, and `peekProfileVerificationCode` non-prod test hook.
  - Step 2: REST endpoints (`/profile/update/request-code`, `/profile/update/verify`, `/profile/update/resend-code` dual-mounted at `/profile/update` and `/api/profile/update`) with authentication, Zod validation, conditional snapshot updates against users table for concurrency safety, and structured responses.
  - Step 3: Shared normalization library (`server/src/shared/normalization.ts`) — `maskEmail()`, `conservativeTitleCaseName()`, and `normalizeName()`, preserving internal capitalization (McDonald, O'Brien) and edge cases.
  - Step 4: Profile specialist redesign (`server/src/agents/specialists/profile/profile.ts`) — 4-step state machine (`collect_value` -> `confirm_change` -> `awaiting_code` -> applied update) owned entirely by profile specialist without lateral handoffs, structured user-facing messages, and no-change early completion.
  - Step 5: Frontend `VerificationPrompt` component (`client/src/components/chat/verification-prompt.tsx`) with 7-state machine (`idle`, `requesting`, `awaiting_input`, `verifying`, `resending`, `success`, `locked_out`), timer-derived countdowns, friendly copy, and full keyboard/screen-reader accessibility.
  - Step 6: Full acceptance test suite (`server/src/api/profile-verification-flow.integration.test.ts`) covering 23 end-to-end integration scenarios.
  - Step Final: Integration test suites verified — Journey 3 rewritten for profile-owned flow in `conversational-routing.integration.test.ts`, Scenario 7 Redis key isolation in `parent-graph-account.integration.test.ts`; 725 server + 150 client tests passing (0 failures).
- Phase 33 (Authentication Redesign): COMPLETE on branch `phase/33-auth-visual-redesign`.
- Phase 34 (Operations & Observability Redesign): COMPLETE on branch `phase/34-ops-visual-redesign`. Full console redesign across `/ops` (Conversation Explorer), `/ops/traces/[id]` (Trace Inspector), and `/ops/evals` (Evaluation Benchmark Dashboard) using Midnight Burgundy (`bg-surface-canvas`, `bg-surface`, `bg-surface-inset`) and Imperial Crimson (`bg-brand-primary`, `text-brand-link`) design system tokens; Geist Mono technical typography for UUIDs, timestamps, and neutral monospace durations (`duration` ms); decoupled operational status badges (`active`, `escalated`, `archived`); verifiable environment telemetry; and responsive mobile layouts. All 150 client tests passing across 28 test files (24/24 ops tests passing). Zero backend or contract changes.
- Phase 37 (Corpus Scaling, Chunker Fix, Idempotent Ingest & Golden Dataset v3 Migration): COMPLETE on branch `phase/37-corpus-scale`.
  - 37a: Fixed `chunker.ts` sentence-splitter truncation defect (+843 chars recovered across 6 chunks in 4 frozen docs); 11 adversarial unit tests passing.
  - 37b: Generated 30 new policy/FAQ markdown docs (10 per domain), passed 42-doc contradiction audit (0 divergences), generated and XMP-injected 30 PDFs.
  - 37c.1': Pre-ingest seed resolver (`eval/seed-labels-resolved.v3-preingest.json`) resolved 96/96 seeds to `(doc_id, chunk_key)`.
  - 37c.2: Added `chunk_key` column + partial unique index (`0014_slippery_king_bedlam.sql`), docId-scoped superseding + `ON CONFLICT (version_id, chunk_key)` upsert, RPM-paced sequential `embedBatch` (700ms interval, 65s 429 backoff) vs `embedQuery` (2s/2x 429 retry), metadata-only XMP version bump on 12 frozen PDFs (`1.0.0→1.0.1` / `2.0.0→2.0.1`), and 2-day split ingest of all 42 PDFs → `516` active chunks (`account: 172`, `orders: 171`, `payments: 173`), `0` null `chunk_key`/`embedding`, HNSW + GIN indexes rebuilt.
  - 37c.2.5 (Gate 5): Post-ingest UUID lookup (`eval/seed-labels-resolved.v3.json`) resolved 96/96 active UUIDs.
  - 37c.3: Migrated golden dataset to `eval/knowledge-golden-dataset.v3.json` (302 total queries: 249 active with gold UUIDs, 14 negatives, 39 excluded; 0 mismatches) and updated `run-retrieval-eval.ts` / `run-retrieval-ablation.ts` to load `v3`.
  - 37c.4: 10-query stratified smoke eval passed (`Hit@3 = 9/10`, `90%`); full server suite `88 passed | 2 skipped` (`768 passed | 21 skipped`).
  - Phase A (Scale Hardening): concurrency limiting (`p-limit`), dry-run mode, RSS memory measurement, embed counter, `page_number` column and migration, `ingestDirectory` support, 56KB large-doc fixture + benchmark script (`benchmark-large-pdf.ts`).
  - Phase B (Hardening & Latency Budgeting): 128 passed | 20 skipped test suite confirmed, p50 476ms local, p95 target revised to <2,000ms (Gemini API embed-bound), peak RSS ~476MB for 56KB fixture, legacy fallback guarded against 42P01 error code, retry logging verified with `console.error`.
  - Phase C (Deployment Artifacts & Discrepancy Reconciliation): all 7 discrepancies A–G resolved and locked across `MIGRATION.md`, `DEPLOYMENT.md`, `eval/production-smoke.md`, `eval/retrieval-queries.README.md`, and `.github/workflows/rag-ci.yml`.
  - Phase D (Production Deployment): operator-ready runbook in `DEPLOYMENT.md` awaiting human execution.

  - Phase 6 (Access Control / Verification Gate): Steps 0-5 closed; Step 6a proof graph verified; Step 6b close-out and type unification completed.
  - Phase 7 (Agent Foundation): Steps 0-5 closed; LLM client, prompt loader, handoff contract, common node patterns, and subgraph harness verified (294 tests).
  - Phase 8 (Meta Orchestrator & Stateful Router Skeleton): Steps 0-5 closed; intent taxonomy, LLM classifier, deterministic guards, specialist stubs, parent graph with Command(goto) dispatch, and end-to-end integration tests verified (331 tests).
  - Phase 9 (Orders Specialists): Steps 0-4 closed; Order Tracking and Returns specialist subgraphs, prompt templates, RAG integration, Scenario 1 & 9 integration tests verified (350 tests).
  - Phase 10 (Payments Specialists): Steps 0-5 closed; Payment and Refund specialist subgraphs, Pattern B lateral re-route, OD-8 allowlist update, Scenarios 3, 4 & 8 integration tests verified (370 tests).
  - Phase 11 (Account Specialists): Steps 0-5 closed; Profile and Account Access real subgraphs, two-mode Account Access (stateless password reset; OTP verification for resume via `buildIdentityUpdate`), Scenarios 5, 6, 7, 13 & 14 parent integration tests verified (400 tests).
  - Phase 12 (Cross-Domain Integration Validation): Steps 1-5 closed; all 14 evaluation scenarios from REFERENCE.md verified live across all 6 concrete domain specialists with zero stubs against real Postgres, pgvector, Redis, and PostgresSaver checkpointer (414 tests).
  - Phase 13 (Failure Handling & Loop Prevention): Steps 0-5 closed; tool retry policy (`maxRetries=1` for `TIMEOUT`, `NETWORK_ERROR`, `DATABASE_ERROR`), tool failure escalation in specialists, terminal `ESCALATED` state lock, loop detection escalation, and classifier fallback routing verified (428 tests).
  - Phase 14 (Observability & Tracing): Steps 0-5 closed; LangSmith optional config and env schema export, typed trace metadata & tag formatting, `createTraceConfig` factory for `RunnableConfig`, and parent graph trace propagation integration test suite verified (444 tests).
  - Phase 15 (Evaluation Framework): Steps 0-5 closed; 30-scenario canonical dataset schema & definitions, 8 deterministic binary evaluators, multi-turn thread evaluation runner, standalone CLI scorecard generator (`npm run eval`), and integration test suite verified (475 tests).
  - Phase 16 (Backend API Layer): Steps 0-5 closed; modular Express REST API, AppError hierarchy, Zod request validation, x-user-id auth with guest fallback, health check, conversation lifecycle, dual-mode message dispatch (JSON + SSE streaming), trace timeline endpoint, and server entrypoint verified (524 tests).
  - Phase 17 (Frontend: Customer Chat): Steps 1-7 closed; scoped Phase 16 amendments (shared ownership helper, 403 matrix, CORS lock, message extraction, stream iterator drain, dev routes), Next.js 14 App Router customer chat in `client/`, safe markdown rendering, demo identity switcher, specialist and handoff badges, neutral verification prompt with dev OTP peek, cosmetic OTP masking (`••••••`), pure chat reducer with synchronous ref double-send guard, cross-workspace verification script (`scripts/verify.ps1`), and manual verification runbook (548 server tests + 66 client tests = 614 tests).
  - Phase 18 (Frontend: Platform/Ops UI & Observability Dashboard): Steps 1-7 closed; dev-gated server ops endpoints (`/api/ops/conversations`, `/api/ops/conversations/:id/traces`, `/api/ops/eval-results`), global TopNav navigation header, conversation explorer with search/status filters, trace viewer & handoff inspector with multi-agent trajectory breadcrumbs and collapsible tool cards, 30-scenario canonical benchmark scorecard dashboard, and manual verification runbook (556 server tests + 93 client tests = 649 tests).
  - Phase 19 (Testing, Hardening & Portfolio Documentation): Steps 1-5 closed; runtime hardening (recursive tool output redaction, `user` reducer null-safety), API security (100kb payload limit, 413 entity-too-large handler, production error sanitization), Next.js error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx`), automated local run script (`scripts/run-local.ps1`), portfolio-grade system README, and final documentation closeout (559 server tests + 95 client tests = 654 tests).
  - Phase 20 (Conversational Routing & Chat State Isolation): Steps 1-3 closed; client chat session isolation & "+ New Chat" disassociation, error sanitization on 403, taxonomy greeting intent and regex triage (`isGreetingMessage`), conversational supervisor onboarding in `routerNode` without forcing specialist dispatch, 100% test pass rate (563 server tests + 98 client tests = 661 tests).
  - Phase 21 (Real User Accounts, Authentication & Storefront Integration): Steps 1-5 closed; database schema addition of nullable `passwordHash` to `users`, scrypt + salt password hashing, signed HMAC-SHA256 Bearer session tokens, auth REST endpoints (register/login/logout/me), storefront endpoints (catalog & order placement), frontend auth modal, storefront modal, and live customer chat order tracking (584 server tests + 112 client tests = 696 tests).
  - Phase 22 (Mandatory User Auth & Dedicated Storefront / Orders Pages): Steps 1-6 closed; mandatory authentication guard hook (`useRequireAuth`), dedicated full-page `/login` and `/register` flows with query redirection, global navigation update (`TopNav` with user identity pill and direct store/orders links), removal of demo identity switcher from user-facing sidebar, dedicated full-page `/store` catalog with dynamic cart & checkout, dedicated `/orders` order history with color-coded status badges and 1-click "Ask Agent About This Order", root `/` chat routing guard and `orderId` input prompt pre-fill (584 server tests + 131 client tests = 715 tests).
  - Phase 23 (Conversational UX, Interactive Service Menu & Order Tracking Reliability): Steps 1-7 closed; dynamic LLM greeting generation (`temperature: 0.2`) returning concise, context-adaptive greetings, interactive service-option buttons (`Track an Order`, `Request a Return`, `Request a Refund`, `Manage Payments`, `Update Profile`, `Account Security`) transported via SSE routing metadata and rendered as clickable pills, order tracking continuation guard in `routerNode` preventing unwanted re-classification during order ID collection (586 server tests + 144 client tests = 730 tests).


## Built so far
Domain data model + repositories + seed; conversation/message services; ConversationState + PostgresSaver checkpointing; routing/agent/tool event logging;
16 deterministic tools with zod schemas and verification metadata; Redis verification-code flow; `executeTool` + `gatedExecuteTool`; pure gate + per-specialist allowlist;
Pattern C blocked-workflow builder; identity-update helper with import-boundary enforcement; knowledge ingestion + domain/topic-scoped retrieval; Phase 6 throwaway integration graph;
Gemini LLM wrapper with structured Zod output; 5-section prompt template loader; HandoffRequest contract and Zod validation; standard node execution patterns; reusable subgraph test harness;
intent taxonomy + LLM classifier (temperature 0.0, structured output); deterministic pre-classification guards (handoff cap, loop detection, resume preconditions, terminal ESCALATED state lock);
specialist stub factory (COMPLETE/HANDOFF/BLOCK/FAIL behaviors); parent graph with `routerNode` and `Command({ goto })` dispatch;
Order Tracking specialist subgraph (`get_order`, `get_shipment_status`, RAG orders/shipping, argument extraction, grounded responses);
Returns specialist subgraph (`check_return_eligibility`, `create_return` with FULL gate Pattern C block, RAG orders/returns, hard decline on ineligibility, resume from activeWorkflow);
Payment specialist subgraph (`get_payment`, `detect_duplicate_charge`, Pattern B handoff to Refund, RAG payments/payments);
Refund specialist subgraph (`create_refund` for duplicate charges, `get_return_by_order`, Pattern B handoff to Returns for unlinked returns, structured `create_refund` for approved returns, RAG payments/refunds);
Profile specialist subgraph (`get_profile`, `update_profile`, FULL verification gate, Pattern C activeWorkflow block, no RAG);
Account Access specialist subgraph (`start_identity_verification`, `verify_identity` with `buildIdentityUpdate` elevation and Pattern C unblock, `initiate_password_reset` with strict identity preservation, RAG account/account_security);
All 6 domain specialists are real concrete subgraphs wired into parent graph; Pattern B (lateral re-route) and Pattern C (verification-for-resume) verified end-to-end;
Robust failure handling: tool execution single-retry on transient timeouts/errors with failure escalation, circular routing loop escalation, max handoff cap (3) escalation, terminal ESCALATED state lock, classifier fallback;
Observability & Tracing: optional LangSmith environment configuration, typed metadata sanitization (preventing PII/secrets leakage), run name standardization across trace levels, tag builder, and `createTraceConfig` factory producing `RunnableConfig` for LangGraph parent graph invocations;
Evaluation Framework: 30 canonical evaluation scenarios covering all 6 domain specialists and 5 patterns, 8 deterministic binary evaluators (`ROUTING_CORRECT`, `HANDOFF_CORRECT`, `SPECIALIST_SCOPE_CORRECT`, `TOOL_SELECTION_CORRECT`, `STATE_PRESERVED`, `KNOWLEDGE_GROUNDED`, `WORKFLOW_COMPLETED`, `RESOLUTION_CORRECT`), multi-turn thread evaluation runner (`runScenario` and `runBenchmark`), standalone CLI runner with terminal and markdown scorecards (`npm run eval`), and locked `MIN_SIMILARITY = 0.60`;
Backend API Layer: modular Express.js application in `src/api/` with custom `AppError` hierarchy, global error handling middleware, Zod request validation, RFC 4122 v4 UUID `x-user-id` authentication with guest fallback, health probe (`/health`), conversation lifecycle endpoints (`/api/conversations`), dual-mode message dispatch (`/api/conversations/:id/messages` supporting both JSON and real-time SSE streaming), trace timeline endpoint (`/api/conversations/:id/traces`), and server entrypoint with graceful shutdown (`npm run start`);
Frontend Customer Chat: Next.js 14 App Router with customer chat UI, safe markdown rendering, demo identity switcher, specialist and handoff badges, neutral verification prompt with dev OTP peek, cosmetic OTP masking, pure chat reducer with synchronous ref double-send guard;
Frontend Platform/Ops UI: conversation explorer with search/status filters, trace viewer & handoff inspector with multi-agent trajectory breadcrumbs and collapsible tool cards, 30-scenario canonical benchmark scorecard dashboard;
Phase 19 hardening: recursive tool output PII redaction, `user` reducer null-safety, 100kb payload limit with 413 handler, production error sanitization, Next.js error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx`), automated local run script (`scripts/run-local.ps1`), portfolio-grade README.

## Known issues (resolved)
1. ~~`user` field reducer uses `update ?? state`, so an explicit `user: null` update is ignored.~~ **Resolved Phase 19 Step 1**: updated to `update !== undefined ? update : state`.
3. Seed fixture sets Order.status='returned' for "return approved, no refund yet", arguably premature.
4. Style inconsistency: `verificationService` is an object-namespace export; everything else uses plain named exports.
5. ~~`executeTool` `redact()` is shallow and skips array outputs; harmless today.~~ **Resolved Phase 19 Step 1**: recursive redaction for objects and arrays.
6. 6a graph's ALLOWED branch does not clear `activeWorkflow`, so `blockedBy` goes stale after a successful resume (resolved in Phase 8: router writes RE_ROUTE event; specialist clears activeWorkflow on COMPLETED).

## Immediate next actions
1. Operator conducts Phase D production deployment runbook following `DEPLOYMENT.md` (no automated agent execution).
2. Owner merges `phase/29-pdf-rag-pipeline` and tags `phase-29-done`.
3. Phase 34 Operations & Observability Redesign completed on branch `phase/34-ops-visual-redesign`. All five visual redesign phases (Chat, Store, Orders, Auth, Ops) are now complete and accepted.

## Neon Postgres deployment (out-of-phase)
- Neon project: `withered-wildflower-96418740` (org `org-frosty-river-50490515`), branch `production` (`br-silent-band-bdye411r`).
- `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) written to `server/.env` and `.env.local`.
- `server/src/shared/config.ts` updated: `DATABASE_URL`/`DATABASE_URL_UNPOOLED` optional fields; config parses connection details from `DATABASE_URL` when present, falls back to individual `POSTGRES_*` vars.
- `server/drizzle.config.ts` updated: prefers `DATABASE_URL_UNPOOLED` → `DATABASE_URL` → individual vars for migrations/DDL.
- `server/vitest.config.ts` updated: `testTimeout: 30000`, `hookTimeout: 30000` (some integration tests require >5s on Neon).
- `server/package.json` updated: added `"build": "tsc"` script.
- `package.json` (root) updated: added `"build"` script running client + server builds in sequence.
- `neon.ts` created at root (Neon configuration file).
- Drizzle migrations applied to Neon via `npm run db:migrate` ✓
- LangGraph checkpoint tables created via `npm run checkpointer:setup` ✓
- Database seeded via `npm run db:seed` ✓ (4 users, 9 orders, 4 payments, 3 returns, 2 refunds)
- Knowledge documents ingested via `npm run knowledge:ingest` ✓ (5/5 documents)
- `npm run build` (root): Next.js client + TypeScript server both pass ✓
- `/health` endpoint: `{"status":"healthy","services":{"database":"up","redis":"up"}}` ✓
- `/api/products` returns 2 products from Neon ✓
- `/api/demo-users` returns seeded users ✓
- Full conversation turn (create conversation → POST message → GET messages): end-to-end round-trip through LangGraph + Neon checkpointer ✓
- Server test count: 537 passing (some integration tests timeout at 5s default; pass at 30s). Client: 131/131 ✓.

## Phase 36 (COMPLETE) — Retrieval Latency Optimization

**Branch**: `main` (tagged `phase-36-done`)

**Empirical baseline** (Phase 35, N=30, remote Neon us-east-2): p50 **1,223.20ms** / p95 **3,316.02ms**. WAN floor: ~225ms per round-trip.

### Step 1 — COMPLETE (commit `db8ee27`)
- Changed `await logRetrievalExecutionSafely(...)` → `void logRetrievalExecutionSafely(...)` in `server/src/knowledge/retrieval.ts:158`.
- Post-Step-1 measured: p50 **1,142.52ms** (~80ms savings, NOT ~222ms).
- **Finding**: Predicted telemetry decoupling would recover 222ms p50. Measured recovery was ~80ms. Root cause: telemetry (222ms p50) ran in parallel with sparse retrieval (228ms p50) under `Promise.all`, so removing telemetry did not shorten the critical path dominated by the dense branch's 6 serial round-trips. The honest savings figure is ~80ms. Fire-and-forget is still correct — it removes a coupling and reduces tail risk (p95 of telemetry was 276ms). Do NOT put "saved 222ms" anywhere.

### Step 2 — COMPLETE (commit `5c872a8`, `6fa18e8`, and Step 2b-β resolution)
- Evaluated HNSW GUC migration strategies: URL options rejected by PgBouncer (08P01), `ALTER ROLE` rejected by Neon permissions (42501).
- Resolved via Step 2b-β: Dedicated `retrieval-client.ts` using `DATABASE_URL_UNPOOLED` with connection-level startup `options`.
- Ran `check-gucs.ts` 5 consecutive times: 5/5 PASSED (`hnsw.ef_search=100`, `hnsw.iterative_scan=relaxed_order`, `hnsw.max_scan_tuples=40000`, `pgvector=0.8.7`).

### Step 3 — COMPLETE (Layer A Code Cleanup)
- `searchDenseScoped` in `knowledge.repository.ts`: Removed `db.transaction(...)` wrapper and 3× `SET LOCAL` statements.
- `searchDenseScoped` and `searchSparseScoped` now execute autocommit queries directly against `retrievalDb` (`retrieval-client.ts`).
- Created `server/src/knowledge/layer-a-equivalence.test.ts` verifying autocommit execution and candidate retrieval under the new pool.
- Empirical Latency Measurement (`measure-retrieval-latency.ts` N=30):
  - Baseline (Phase 35): DB Wall p50 **1,223.20ms**, Dense p50 **996.88ms** (6 serial RTs)
  - Post-Layer-A (Phase 36 Step 3): DB Wall p50 **889.96ms** (-333.24ms), Dense p50 **665.82ms** (-331.06ms)
  - Single serial query round-trip floor now isolated to network transit time.
- All 741+ tests passing (test count preserved, zero regressions).

### Step 4 — COMPLETE (Layer B Single-CTE Hybrid Retrieval)
- Implemented `searchHybridScopedCTE` in `server/src/persistence/repositories/knowledge.repository.ts`.
- Consolidates Dense candidate selection, Sparse full-text candidate selection, and Reciprocal Rank Fusion (RRF k=60) into **exactly 1 database round-trip statement** with deterministic tie-breaking (`ORDER BY f.rrf_score DESC, f.distance ASC NULLS LAST, c.id ASC`).
- Switched production scoped retrieval path in `server/src/knowledge/retrieval.ts` to execute `searchHybridScopedCTE`.
- Created `server/scripts/measure-cte-latency.ts` and measured empirical retrieval times:
  - Phase 35 Baseline: DB Wall p50 **1,223.20ms** / p95 **3,316.02ms** (6 serial RTs)
  - Phase 36 Step 3 (Layer A): DB Wall p50 **889.96ms** / p95 **2,767.22ms**
  - Phase 36 Step 4 (Layer B CTE, WAN): Single-Query p50 **349.01ms** / p95 **758.65ms** (-874.19ms / -71.5% from baseline)
  - Warmup-Excluded Local WAN (N=30 warm of 35): p50 **253.73ms** (Min 227.91ms, Max 379.34ms, p95 303.20ms)

### Step 5 — COMPLETE (Equivalence Verification, Production Measurement & Close-Out)
- **Task A (Equivalence Verification)**:
  - Reality check caught synthetic chunk ID mismatch in legacy fixture. Regenerated baseline against production corpus using stratified 30-query sample from golden dataset v2.
  - Asserted 100% set and order equality in `layer-b-cte.test.ts`:
    - Queries where top-3 SET differs: **0 / 30**
    - Queries where ORDER differs: **0 / 30**
    - Score differences beyond 0.001: **0 / 30**
  - **Verdict**: 100% top-3 set, order, and score equivalence against production corpus.
- **Task B (Production Measurement via Railway Diagnostic Route)**:
  - Deployed header-gated diagnostic route (`x-diag-token === ADMIN_DIAG_TOKEN`) to Railway.
  - Measured warmup-excluded retrieval latency directly from Railway (`measurement_origin: railway-us-east4` to Neon `us-east-2`, N=30 warm runs after 5 discarded warmup runs):
    - **Min**: `20.95ms`
    - **p50**: `21.42ms`
    - **p95**: `22.23ms`
    - **Max**: `22.37ms`
    - **Mean**: `21.47ms`
  - Reconciles earlier ~231ms–253ms local measurements as pure cross-continental network transit from Pakistan to US-East; in-region production retrieval latency executes in **~21ms**.
  - Production smoke test verified with authenticated Bearer session token and returns query.
  - Diagnostic route and test suite removed immediately after measurement in cleanup commit.
- **Task C (Deployment Hardening)**:
  - Verified `retrieval-client.ts` enforces `DATABASE_URL_RETRIEVAL` presence and throws a clear, actionable error if missing.
  - Strictly prevents silent fallback to `DATABASE_URL` (which would run with wrong GUC defaults). Verified via unit tests in `server/src/persistence/db/retrieval-client.test.ts`.

**Current test count**: 752 passed | 21 skipped (baseline was 741; diag route removed -5 tests from 757 to 752).

---

## Phase 37 (In Progress) — Corpus Scale, Chunker Fix & Re-Labeling

**Branch**: `phase/37-corpus-scale`

### Sub-Phase 37a — COMPLETE (Gate 1 verified, commits `9aeaee7`, `0c8b69b`)
- **Chunker Fix (`server/src/knowledge/chunker.ts`)**: Replaced destructive sentence-splitting regex with `splitIntoSentencesWithSeparators`, protecting decimals (`25.50`), version numbers (`3.2`, `1.0.0`), and abbreviations (`No.`, `e.g.`, `i.e.`) with a strict verbatim round-trip invariant. Added 11 adversarial tests in `chunker.test.ts` (14/14 passing).
- **Production Chunk-Truncation Audit (READ-ONLY)**: Audited 66 production chunks against source PDFs and found 6 silently truncated by a regex that dropped sentence fragments preceding decimal amounts, losing 81–202 characters of customer-facing policy per affected chunk (`64aafead`, `9fbc24e7`, `f638b0c3`, `859759ac`, `1f440385`, `db883c4f`).
- **Staging Recovery Proof (`server/scripts/.chunk-staging.json`)**: Re-chunking the 12 frozen PDFs recovered `+843` chars (`+99`, `+188`, `+165`, `+202`, `+81`, `+108`) across the 6 affected chunks (`52,166` staged vs `51,323` prod), with `0` char difference across all 60 unaffected chunks.
- **Test count**: 763 active server tests across 88 files (`752 + 11` new chunker tests), run via CI in-region; parallel local runs from a high-latency region show integration-only WAN timeouts, documented below.

### Known Issues
- Integration tests (`parent-graph-*.integration.test.ts`) fail with WAN timeouts when run in parallel from Pakistan -> `us-east-2` (`755 passed | 8 failed | 21 skipped` in parallel run). Pass sequentially with `--fileParallelism=false --testTimeout=60000` (e.g., `parent-graph-cross-domain` 14/14, `parent-graph-account` 5/5). CI (in-region) is the source of truth. Root fix: region-aware test timeout or test-side batching, deferred to Phase 39+.

---

## Changelog
- 2026-11-05: Phase 6 Step 6a integration proof graph and test suite verified (239 tests).
- 2026-11-05: Phase 6 Step 6b type unification (SpecialistId), cast cleanup, and Phase 6 close-out (240 tests).
- 2026-11-05: Phase 7 Agent Foundation completed: LLM wrapper, prompt loader, handoff schema, common node patterns, subgraph harness (294 tests).
- 2026-11-05: Phase 8 Meta Orchestrator & Stateful Router completed: taxonomy, classifier, guards, stubs, parent graph, integration tests (331 tests).
- 2026-11-05: Phase 9 Orders Specialists completed: Order Tracking and Returns real subgraphs, RAG scoping, parent graph integration (350 tests).
- 2026-11-05: Phase 10 Payments Specialists completed: Payment and Refund real subgraphs, Pattern B lateral re-route, Scenarios 3, 4 & 8 parent integration tests (370 tests).
- 2026-11-06: Phase 11 Account Specialists completed: Profile and Account Access real subgraphs, two-mode operation, Pattern C verification resume, Scenarios 5, 6, 7, 13 & 14 parent integration tests (400 tests).
- 2026-11-06: Phase 12 Cross-Domain Integration Validation completed: all 14 evaluation scenarios verified live across all 6 real domain specialists; OD-1 resolved (414 tests).
- 2026-11-06: Phase 13 Failure Handling & Loop Prevention completed: tool retry policy (maxRetries=1 for transient infrastructure errors), tool failure escalation in specialists, terminal ESCALATED state lock, loop detection escalation, and classifier fallback routing verified (428 tests).
- 2026-11-06: Phase 14 Observability & Tracing completed: LangSmith optional config and env schema export, typed trace metadata & tag formatting, `createTraceConfig` factory for `RunnableConfig`, and parent graph trace propagation integration test suite verified (444 tests).
- 2026-11-06: Phase 15 Evaluation Framework completed: 30 canonical scenarios dataset, 8 binary evaluators, multi-turn eval runner, CLI runner (`npm run eval`), and integration test suite verified (475 tests).
- 2026-11-06: Phase 16 Backend API Layer completed: Express.js REST API, AppError hierarchy, Zod request validation, x-user-id auth, health check, conversation lifecycle, dual-mode message dispatch (JSON + SSE streaming), trace timeline endpoint, server entrypoint, and integration test suite verified (524 tests).
- 2026-11-06: Phase 17 Frontend: Customer Chat completed: scoped Phase 16 amendments (shared ownership helper, 403 matrix, CORS lock, message extraction, stream iterator drain, dev routes), Next.js 14 App Router customer chat in `client/`, safe markdown rendering, demo identity switcher, specialist and handoff badges, neutral verification prompt with dev OTP peek, cosmetic OTP masking (`••••••`), pure chat reducer with synchronous ref double-send guard, cross-workspace verification script (`scripts/verify.ps1`), and manual verification runbook (548 server tests + 66 client tests = 614 tests).
- 2026-11-06: Phase 18 Frontend: Platform/Ops UI & Observability Dashboard completed: dev-gated server ops endpoints (`/api/ops/conversations`, `/api/ops/conversations/:id/traces`, `/api/ops/eval-results`), global TopNav navigation header, conversation explorer with search/status filters, trace viewer & handoff inspector with multi-agent trajectory breadcrumbs and collapsible tool cards, 30-scenario canonical benchmark scorecard dashboard, and manual verification runbook (556 server tests + 93 client tests = 649 tests).
- 2026-11-06: Phase 19 Testing, Hardening & Portfolio Documentation completed: runtime hardening (recursive tool output redaction, `user` reducer null-safety), API security (100kb payload limit, 413 entity-too-large handler, production error sanitization), Next.js error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx`), automated local run script (`scripts/run-local.ps1`), portfolio-grade system README, and final documentation closeout (559 server tests + 95 client tests = 654 tests).
- 2026-11-07: Phase 20 Conversational Routing & Chat State Isolation completed: client session disassociation on "+ New Chat" and user switch, 403 leakage prevention, greeting classification and supervisor triage response, seamless subsequent domain dispatch (563 server tests + 98 client tests = 661 tests).
- 2026-11-07: Phase 21 Real User Accounts, Authentication & Storefront Integration completed: schema addition of nullable passwordHash to users, Node crypto.scrypt password hashing with salt, signed HMAC-SHA256 session tokens with dual-mode auth middleware fallback, /api/auth and /api/orders REST endpoints, frontend AuthModal and StorefrontModal, and real customer chat order tracking (584 server tests + 112 client tests = 696 tests).
- 2026-11-08: Phase 22 Mandatory User Auth & Dedicated Storefront / Orders Pages completed: mandatory authentication guard hook (`useRequireAuth`), dedicated full-page `/login` and `/register` flows with query redirection, global navigation update (`TopNav` with user identity pill and direct store/orders links), removal of demo identity switcher from user-facing sidebar, dedicated full-page `/store` catalog with dynamic cart & checkout, dedicated `/orders` order history with color-coded status badges and 1-click "Ask Agent About This Order", root `/` chat routing guard and `orderId` input prompt pre-fill (584 server tests + 131 client tests = 715 tests).
- 2026-11-08: Bug Fixes & UX Clarification: UUID fast-path regex extraction across specialists (Order Tracking, Returns, Payment), Pattern C profile verification routing and resume context fix, actionable guidance hint in client VerificationPrompt banner and input placeholder (584 server tests + 131 client tests = 715 tests).
- 2026-11-08: Neon Postgres deployment: wired DATABASE_URL/UNPOOLED into config, drizzle, env; migrations, checkpointer setup, seed, and knowledge ingestion applied to Neon; root build scripts; vitest testTimeout raised to 30s; full end-to-end round-trip verified against Neon (commit 45393f0).
- 2026-11-09: Phase 24 Stabilization completed: session-identity propagation (LIGHTLY_VERIFIED for Bearer tokens), universal blocked-reply helper, tenant isolation across all domain tools, turn-scoped handoffs, duplicate charge confirmation with review_requests table, intent alignment and database idempotency unique indexes, transaction-level advisory locking, LLM/tool retry resilience, and multi-turn HTTP integration tests (615 server tests + 144 client tests = 759 tests, 1 skipped).
- 2026-11-11: Phase 25 Conversational Routing & Memory Overhaul completed: dynamic router triage eliminating sticky continuation locks, grounded General Assistant specialist node, additive conversation entity memory (`lastKnownEntities`) and pending task tracking, bounded transcript context injection, friendly activity progress streaming, and multi-intent queueing (647 server tests + 144 client tests = 791 tests, 1 skipped).
- 2026-11-13: Phase 26 Profile Update + Identity Verification Flow completed: profile-owned 4-step update state machine with zero lateral handoffs, Redis-backed atomic verification service (SHA-256 hashed codes, Lua script, 60s/15s cooldowns), dual-mounted REST endpoints (`/profile/update/request-code`, `/verify`, `/resend-code`) with conditional snapshot concurrency protection, client VerificationPrompt 7-state machine, and 23 acceptance integration tests (725 server tests + 150 client tests = 875 tests, 1 skipped).
- 2026-11-20: Phase 29 PDF RAG Pipeline & Hardening completed: scale hardening (concurrency limiting, dry-run, RSS tracking, embed counter, page_number migration), hybrid RAG retrieval, 42P01 legacy fallback guard, retry logging verification, latency budget revision (p95 <2,000ms), and production deployment runbook reconciliation (128 passed, 20 skipped).
- 2026-11-21: Phase 30 Chat Visual Redesign started on branch `phase/30-chat-visual-redesign`. Steps 1–5: foundation CSS tokens and Tailwind extension (Midnight Burgundy / Imperial Crimson palette, Manrope + Geist Mono fonts), TopNav dark redesign with mobile hamburger, ConversationSidebar dark redesign with mobile off-canvas drawer (fixes 87px squeeze defect), SpecialistBadge unified dark surface with specialist-specific Lucide icons, ServiceOptionBar Crimson-toned active pills, MarkdownRenderer dark prose tokens, ChatFeed dark canvas with brand-tinted user bubbles and semantic streaming pill, MessageInput Crimson send button with lock-state icon, VerificationPrompt dark-surfaced 7-state machine, page.tsx shell with mobile drawer wiring and dark escalation banners, error.tsx and not-found.tsx dark styling. All 150 client tests passing across 28 test files; all data-testid attributes and aria-labels preserved; zero backend changes.
- 2026-11-21: Phase 31 Store Page Redesign completed on branch `phase/31-store-visual-redesign`. Steps 0–1: discovery proposal (`client/ORCHESTRAI_STORE_REDESIGN_PROPOSAL.md`), StageShow visual demonstration (`store-redesign-stageshow.html`), and full page redesign in `client/src/app/store/page.tsx` using Midnight Burgundy (`bg-surface-canvas`, `bg-surface`) and Imperial Crimson (`bg-brand-primary`, `text-brand-link`) design system tokens; added hardware icon badge nodes (`Keyboard`, `Mic`, `Package`), stock indicator tags, highlighted border on active items, tactile quantity steppers, elevated sticky checkout order summary with line items and delivery preview, and dark telemetry receipt card (`order-confirmation-card`). All 150 client tests passing across 28 suites (4/4 store integration tests passing). Zero backend or contract changes.
- 2026-11-21: Phase 32 Orders Page Redesign completed on branch `phase/32-orders-visual-redesign`. Steps 0–1: discovery proposal (`client/ORCHESTRAI_ORDERS_REDESIGN_PROPOSAL.md`), StageShow visual demonstration (`orders-redesign-stageshow.html`), and full page redesign in `client/src/app/orders/page.tsx` using Midnight Burgundy (`bg-surface-canvas`, `bg-surface`) and Imperial Crimson (`bg-brand-primary`, `text-brand-link`) design system tokens; added unified semantic status badges (`status-success`, `status-info`, `status-warning`, `status-error`), `Geist Mono` order telemetry chip, structured metadata grid, autonomous AI assistant handoff dock (`bg-surface-inset`), calm empty state with catalog CTA, and responsive mobile adaptations. All 150 client tests passing across 28 suites (5/5 orders unit/integration tests passing). Zero backend or contract changes.
- 2026-11-21: Phase 33 Authentication Redesign completed on branch `phase/33-auth-visual-redesign`. Steps 0–7: discovery proposal (`client/ORCHESTRAI_AUTH_REDESIGN_PROPOSAL.md`), StageShow visual demonstration (`auth-split-screen-stageshow.html`), full split-screen architecture for `/login` (`client/src/app/login/page.tsx`) and `/register` (`client/src/app/register/page.tsx`) featuring 57.5% multi-agent orchestration architectural visual mesh (Meta-Triage node, checkpointer radar rings, 6 specialist satellites, bezier transition splines, and editorial metrics), 42.5% focused authentication panel, mobile compact branded header, and shared modal dialog redesign (`client/src/components/auth/auth-modal.tsx`) using Midnight Burgundy (`bg-surface-canvas`, `bg-surface`, `bg-surface-inset`) and Imperial Crimson (`bg-brand-primary`, `text-brand-link`) design system tokens; added brand mark badges, AlertCircle semantic error banners (`bg-status-error/10`), recessed form inputs, and smooth tab transition pills. All 150 client tests passing across 28 suites (11/11 auth tests passing). Zero backend or contract changes.
- 2026-11-21: Phase 34 Operations & Observability Redesign completed on branch `phase/34-ops-visual-redesign`. Steps 0–5: discovery proposal (`client/ORCHESTRAI_OPS_REDESIGN_PROPOSAL.md`), StageShow visual demonstration (`ops-redesign-stageshow.html`), full console redesign across `/ops` (Conversation Explorer), `/ops/traces/[id]` (Trace Inspector), and `/ops/evals` (Evaluation Benchmark Dashboard) using Midnight Burgundy (`bg-surface-canvas`, `bg-surface`, `bg-surface-inset`) and Imperial Crimson (`bg-brand-primary`, `text-brand-link`) design system tokens; added Geist Mono technical typography for IDs, timestamps, and neutral monospace durations, decoupled operational status semantics (`active`, `escalated`, `archived`), verifiable environment telemetry, and responsive mobile adaptations. All 150 client tests passing across 28 suites (24/24 ops tests passing). Zero backend or contract changes.
- 2026-11-27: Phase 37 Corpus Scaling & Golden Dataset v3 Migration completed on branch `phase/37-corpus-scale`: chunker sentence-splitter fix (+843 chars recovered), 30 new policy/FAQ PDFs + 42-doc contradiction audit, `chunk_key` schema migration, RPM-paced sequential `embedBatch` + split `embedQuery` retry policy, full 42-doc / 516-chunk ingest + HNSW/GIN REINDEX, 96/96 post-ingest seed UUID resolution (`eval/seed-labels-resolved.v3.json`), `v3` golden dataset migration (`eval/knowledge-golden-dataset.v3.json`), and 10-query smoke eval (`Hit@3 = 90%`). Server suite: 768 passing, 21 skipped.

