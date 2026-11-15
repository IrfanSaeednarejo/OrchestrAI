# STATUS (update at the end of every step/phase)

Last verified suite figure reported: Server 647+ passing, Client 144/144 passing. Server baseline test count: 615. Client baseline test count: 144.

## Phase state
- Phases 1-23: COMPLETE and signed off.
- Phase 24 (Stabilization): COMPLETE on branch `phase/23-stabilization`.
- Phase 25 (Conversational Routing & Memory Overhaul): COMPLETE on branch `phase/24-conversational-routing`.
- Phase 26 (Email Verification & Multi-Turn Profile Verification Flow): COMPLETE on branch `phase/25-email-verification`. All 9 steps verified and passing:
  - Step 1: Resend dependency and typed email configuration with env validation (`sendEmail`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_DRY_RUN`).
  - Step 2: Resend email service, verification code template (`renderVerificationCodeEmail`), and smoke script (`email-smoke.ts`).
  - Step 3: Verification service hardening: 60s per-user resend cooldown (`verify:cooldown:{userId}`), `VERIFICATION_CODE_TTL_SECONDS = 600`, and `revokeVerificationCode(userId)`.
  - Step 4: Email delivery for `start_identity_verification` with masked email delivery and raw code redaction from tool outputs.
  - Step 5: Compound profile requests greeting regex hardening in `isGreetingMessage` (`taxonomy.ts`).
  - Step 6: Context-aware field prompt and transcript memory in `profileNode` (`ProfileIntentSchema.targetField`, targeted clarification).
  - Step 7: Verification handoff & supervisor domain override for verification code requests during blocked workflows.
  - Step 8: Surface masked recipient email (`maskedEmail`) and cooldown retry seconds in `account_accessNode` prompt.
  - Step 9: Multi-turn end-to-end integration test (`Journey 3` in `conversational-routing.integration.test.ts`), multi-turn verification, and suite validation.

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
1. Owner merges phase/22-mandatory-auth-and-storefront-pages and tags phase-22-done.
2. Full production-grade user authentication, catalog browsing, order history, and conversational support live. 🎉

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

