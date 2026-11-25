# DECISIONS (locked). Do not reverse silently; propose changes via OPEN-DECISIONS.md.

## Principles
Requirements -> architecture -> tradeoffs -> design -> implementation -> technology, never reversed. Simple infrastructure, sophisticated agent architecture.
Small focused steps; explicit typed state; clear agent boundaries; no agent spaghetti (agents never jump directly to each other; the parent re-routes).

## State and persistence
- ConversationState is a TS type living inside the Postgres checkpoint (official PostgresSaver reusing the app's pg.Pool). It is NOT a table.
- Application tables (conversations, messages, routing_history, agent_executions, tool_executions) are the durable operational history.
- No distributed transaction between checkpoint writes and operational writes. Message row is written first, then the graph is invoked with ONLY the new message.
- Redis is excluded from checkpointing; used for verification codes and justified caching only.
- Reducers: messages append; routing.history append (bounded runtime log, not a replacement for routing_history); routing.handoffCount DELTA-based;
  routing.visitedAgents deduped merge; identity and activeWorkflow full overwrite; scalar fields overwrite.
- Nodes emit ConversationStateUpdate; routing updates are Partial<RoutingState> only (never OverwriteValue).
- Events are intentionally asymmetric: RoutingEvent -> state update + DB row; AgentExecutionEvent and ToolExecutionEvent -> DB row only.
- Only HANDOFF and RE_ROUTE increment handoffCount.
- Single retailer; one payment per order; refund.returnId nullable (duplicate-charge refunds); shipments.deliveredAt added for return-window measurement.

## Tools
- 16 tools. Every tool: zod-validated input, returns ToolResult, never throws, repository failures -> REPOSITORY_ERROR.
- Empty result is success with empty data; NOT_FOUND only for a missing referenced entity (load-bearing for Scenario 4).
- Return eligibility: order delivered AND deliveredAt within 30 days AND no non-rejected return exists. Reasons: ORDER_NOT_FOUND, ORDER_NOT_DELIVERED, RETURN_WINDOW_EXPIRED, RETURN_ALREADY_EXISTS.
  check_return_eligibility and create_return share one evaluation function.
- Duplicate charge heuristic: same user, same amount, both captured (not authorized), different payment/order, within 24h. No match = success with potentialDuplicate false.
- create_refund: captured payment required; blocked by existing pending/processing/completed refund (failed does not block); if returnId given the return must be 'approved' and
  belong to the payment's order; returnId null valid; amount must equal payment.amount exactly as a string (no partial refunds); starts 'pending'.
  Codes: INVALID_INPUT, PAYMENT_NOT_FOUND, PAYMENT_NOT_CAPTURED, REFUND_ALREADY_EXISTS, RETURN_NOT_FOUND, RETURN_NOT_APPROVED, RETURN_ORDER_MISMATCH, AMOUNT_MISMATCH, REPOSITORY_ERROR.
- update_profile changes only name and defaultAddress (never email). get_profile returns the full row (FULL verification gates it).
- initiate_password_reset is stateless (users has no credential column), returns {acknowledged:true}, never touches identity.
- Verification code: 6-digit, Redis key verify:{userId} {code, attempts}, TTL 600s, single use, max 5 wrong attempts, re-issue overwrites, no resend throttle, raw code never logged.
  Typed failures: INVALID_CODE, CODE_EXPIRED, MAX_ATTEMPTS_EXCEEDED, VERIFICATION_SERVICE_UNAVAILABLE. Atomic attempt handling sits behind VerificationService.
- executeTool: times, catches throws (UNEXPECTED_ERROR), logs one tool_executions row, redacts sensitive fields shallowly, logging failure never affects the result.

## Access control (Phase 6)
- gatedExecuteTool wraps executeTool; specialists only receive the gated version. The gate checks allowlist permission BEFORE verification; identity null = UNVERIFIED.
- A verification failure is a typed BLOCKED result, distinct from ToolResult failures; DENIED for allowlist violations. The gate never mutates state; the calling node writes activeWorkflow.
  Blocked/denied attempts write a tool_executions failure row (e.g. VERIFICATION_REQUIRED).
- Pattern C builder (state/blocked-workflow.ts): BlockedByReason = 'VERIFICATION_LIGHT' | 'VERIFICATION_FULL'; emits all six activeWorkflow fields every time; ActiveWorkflowState.blockedBy stays string|null.
- Identity mutation: only via state/identity-update.ts (enforces status/method/verifiedAt invariants, throws on violation), importable only by Account Access paths; enforced by ESLint no-restricted-imports + a source-scanning boundary test.
  Integration tests must not import it; supply identity via graph input.

## Knowledge / RAG
- gemini-embedding-2 via @google/genai, 768 dims, whole-document chunks, asymmetric prefixes ("title: none | text: ..." for docs, "task: search result | query: ..." for queries; NO taskType field).
- Ingestion wipes and reseeds; manual script, not part of the test suite. Tests mock the embeddings client.
- retrieveKnowledge requires non-empty domains (no unscoped search), optional topics filter, similarity = 1 - cosine distance. MIN_SIMILARITY = 0.60 provisional (recalibrate Phase 15), injected server-side.
- Per-specialist scope is domain+topic (see REFERENCE.md); Profile gets NO_KNOWLEDGE_ACCESS. Empty retrieval = no grounded knowledge; specialists must not answer from memory.
- Structured questions use structured queries; semantic questions use retrieval.

## Agents (Phase 7)
- LLM: `gemini-2.5-flash` via `@google/genai`. Deterministic decisions/tool calls use `temperature: 0.0`; customer-facing generation uses `temperature: 0.2`.
- Structured output uses `responseMimeType: 'application/json'` and validates responses with Zod schemas. Wrapper returns typed `LLMResult<T>` and never throws raw SDK errors. In Vitest, `@google/genai` is mocked (no real Gemini API calls).
- Prompt templates enforce 5 standard sections (`Identity`, `Objective`, `Scope`, `Phased-Workflow`, `Guidelines`) with `{{key}}` parameter interpolation. Missing required sections throw at validation time; unreplaced variables trigger a warning.
- `HandoffRequest` payload contract: `sourceAgent` (SpecialistId), `handoffReason` (string), `detectedIntent` (string | null), `recommendedDomain` (string), `relevantContext` (Record<string, unknown>), `attemptedActions` (string[]), `confidence` (number in [0, 1]). Strictly validated with Zod.
- Specialist node patterns execute all tools via `gatedExecuteTool`. Gate outcomes map to: ALLOWED -> `{ workflowStatus: 'COMPLETED' }`, BLOCKED -> `{ ...buildBlockedWorkflowUpdate(...), workflowStatus: 'WAITING_FOR_USER_INPUT' }`, DENIED -> `{ workflowStatus: 'FAILED' }`.
- Subgraph test harness (`buildSubgraphHarness`, `buildSingleNodeHarness`) runs against `ConversationStateAnnotation` with `MemorySaver` checkpointer for fast in-memory integration testing.

## Router & Orchestration (Phase 8) — approved 2026-11-05
- Routing strategy: hybrid guard-first + LLM classifier. Deterministic guards (`isHandoffCapExceeded`, `isRoutingLoop`, `checkResumePreconditions`) run before the LLM to avoid unnecessary API calls. Guards produce `GuardOutcome` with `action: 'ESCALATE' | 'RESUME' | 'CLASSIFY'`.
- Intent taxonomy: 15 intents mapped to 6 `SpecialistId` values in `routing/classifier/taxonomy.ts`. Classifier uses `gemini-2.5-flash` at `temperature: 0.0` with structured JSON output validated by Zod.
- Default thresholds: `DEFAULT_MAX_HANDOFFS = 3` (escalate when `handoffCount > 3`); loop detected when any specialist appears ≥ 2 consecutive times in `routing.visitedAgents`.
- Dispatch: `routerNode` returns `Command({ goto: specialistId })`. Each specialist node is registered with `ends: ['router', END]`; router registered with `ends: [all 6 specialist names]`. LangGraph's static validator requires this.
- `AnyCompiledGraph` changed from a `type` alias to an `interface` with `invoke()` and `getState()` method signatures (structural typing). This eliminates `as unknown as` casts for `buildParentGraph().compile()`. The existing PoC tests retain their casts; no test logic changed.
- Resume semantics: when `activeWorkflow.returnTo` is set, `checkResumePreconditions` routes directly to that specialist with a `RE_ROUTE` routing event (no LLM call). The resumed specialist clears `activeWorkflow` on `COMPLETED` by emitting `activeWorkflow: overwrite(null)`.
- All routing decisions write a `routing_history` row via `recordRoutingEvent` (via `logRoutingEventSafely` fallback for in-memory tests).

## Orders Specialists (Phase 9) — approved 2026-11-05
- Order Tracking specialist: single-node subgraph architecture; deterministic LLM argument extraction (`temperature: 0.0`) for UUID `orderId`; missing/ambiguous order ID emits `WAITING_FOR_USER_INPUT` (Scenario 2 shape); calls `getOrder` and `getShipmentStatus` via `gatedExecuteTool` (LIGHT verification); retrieves RAG policy (`domains: ['orders']`, `topics: ['shipping']`); customer response generated at `temperature: 0.2` with plain-text fallback on LLM failure.
- Returns specialist: single-node subgraph architecture; extracts `orderId`, `reason`, and return intent; checks `checkReturnEligibility` via `gatedExecuteTool`; for ineligible returns (`RETURN_WINDOW_EXPIRED`, `ORDER_NOT_DELIVERED`, `RETURN_ALREADY_EXISTS`), queries RAG policy (`domains: ['orders']`, `topics: ['returns']`) and issues a definitive, polite decline with `workflowStatus: 'COMPLETED'` (Scenario 9); for eligible creation requests, calls `createReturn` (FULL verification requirement); if blocked, emits Pattern C `activeWorkflow` update with `workflowStatus: 'WAITING_FOR_USER_INPUT'` (Scenario 6 shape); clears `activeWorkflow: null` on completion.
- Telemetry: specialist nodes record an `agent_executions` row for the conversation and supply its UUID as `agentExecutionId` to `gatedExecuteTool`, satisfying the `tool_executions` foreign-key constraint.
- Parent graph wiring: `buildParentGraph` defaults to real `orderTrackingNode` and `returnsNode` subgraphs while retaining configurable stub overrides via `ParentGraphOptions.specialists` and `configurable.stubBehaviors` for isolated router testing.

## Payments Specialists & Pattern B Lateral Re-Route (Phase 10) — approved 2026-11-05
- Payment specialist: single-node subgraph architecture; extracts `orderId` or `paymentId` via LLM (`temperature: 0.0`); calls `getPayment` via `gatedExecuteTool` (FULL verification requirement); detects duplicate charges via `detectDuplicateCharge` (FULL verification); on confirmed duplicate (`potentialDuplicate: true`), emits Pattern B lateral handoff returning `Command({ goto: 'router' })` with `currentIntent: 'REFUND_ACTION_REQUIRED'`, `currentDomain: 'refund'`, `activeWorkflow: { blockedBy: null, returnTo: { domain: 'refund', agent: 'refund', workflowStep: 'create_refund' }, resumeContext: { ... } }`, and `routing: { previousAgent: 'payment', handoffCount: 1 }`. If no duplicate found, explains payment status grounded in `payments/payments` RAG policy (`temperature: 0.2`) with `workflowStatus: 'COMPLETED'`.
- Refund specialist: single-node subgraph architecture; consumes duplicate refund context from `resumeContext` (`returnId: null`) and calls `createRefund` directly (Scenario 3); for general refund requests, inspects linked returns using `getReturnByOrder`; if no return exists, emits Pattern B handoff to Returns specialist (`returnTo: { agent: 'returns' }`, Scenario 4); if approved return exists, performs structured check via `getPayment` and calls `createRefund` (Scenario 8); clears `activeWorkflow: null` on completion.
- OD-8 (Refund payment lookup): `get_payment` (FULL gated) added to `refund` specialist allowlist in `server/src/tools/permissions.ts` and `REFERENCE.md`. Enables self-contained structured check in Scenario 8 without extra inter-agent ping-pong hops.
- OD-11 (Pattern B Lateral Re-route): implemented using existing `activeWorkflow` with `blockedBy: null`. The router guard `checkResumePreconditions` automatically routes to `returnTo.agent`, logging a `RE_ROUTE` routing event and dispatching `Command({ goto: targetSpecialist })`. Zero schema changes or state modifications required.
- Parent graph wiring: `buildParentGraph` wires real `paymentSpecialistNode` and `refundSpecialistNode` as default nodes while preserving configurable stub overrides via `ParentGraphOptions.specialists` and `configurable.stubBehaviors`.

## Account Specialists & Pattern C Resume (Phase 11) — approved 2026-11-06
- Profile specialist: single-node subgraph architecture; classifies `view_profile` vs `update_profile` via LLM (`temperature: 0.0`); calls `getProfile` or `updateProfile` via `gatedExecuteTool` (both FULL verification requirement); on verification block, emits Pattern C `activeWorkflow` with `blockedBy: 'VERIFICATION_FULL'`, `returnTo: { agent: 'account_access' }`, and `workflowStatus: 'WAITING_FOR_USER_INPUT'`; no RAG access (locked in REFERENCE.md); response generated at `temperature: 0.2`.
- Account Access specialist: single-node subgraph architecture with two-mode operation:
  - Mode 1 (Password Reset, Scenario 14): stateless reset via `initiatePasswordReset`; customer receives reset link; `identity.status` is never touched (strictly preserved across the invocation); returns `workflowStatus: 'COMPLETED'`.
  - Mode 2 (Verification for Resume, Scenarios 5, 6, 7): two-step OTP flow via `startIdentityVerification` and `verifyIdentity`. On verification success, calls `buildIdentityUpdate({ status: 'VERIFIED', verificationMethod: 'otp', ... })` imported exclusively from `state/identity-update.ts` (enforced boundary); sets `activeWorkflow.blockedBy = null` and dispatches `Command({ goto: 'router' })`.
  - Security policy inquiries: scoped RAG retrieval (`domains: ['account']`, `topics: ['account_security']`).
- Pattern C Verification Resume: upon receiving unblocked `activeWorkflow` (`blockedBy: null`) from Account Access, the parent router's `checkResumePreconditions` guard fires automatically, logging a `RE_ROUTE` routing event and dispatching `Command({ goto: returnTo.agent })` directly to the originating specialist without an LLM classification call. The resumed specialist executes its FULL-gated tool and clears `activeWorkflow: null` on completion.
- Router multi-turn continuation: in `routerNode`, when dispatching to the same specialist that handled the prior turn (`state.routing.currentAgent === targetSpecialist`), `decisionType` is logged as `'INITIAL_ROUTE'` (continuation), not a lateral `'HANDOFF'`. This prevents multi-turn conversational interactions from spuriously exhausting the handoff threshold.
- Parent graph wiring: `buildParentGraph` wires real `profileSpecialistNode` and `accountAccessSpecialistNode` as defaults while preserving configurable stub overrides for isolated routing tests. All 6 domain specialists are now concrete subgraphs.

## Cross-Domain Integration Validation & Patterns A/B/C (Phase 12) — approved 2026-11-06
- OD-1 formal resolution: Pattern A is defined as direct specialist resolution without lateral handoff or verification blocking. The complete 14-scenario evaluation matrix from REFERENCE.md is validated against the integrated parent graph with all 6 concrete specialists and zero stubs:
  - Pattern A (Direct Specialist Resolution): Scenarios 1 (order tracking), 2 (order tracking clarification), 8 (refund status check), 9 (returns policy decline), 14 (stateless password reset).
  - Pattern B (Lateral Handoff & Parent Re-Route): Scenarios 3 (duplicate charge in Payment -> lateral handoff -> Refund), 4 (refund inquiry in Refund without return -> lateral handoff -> Returns).
  - Pattern C (Verification Block & Multi-Turn Resume): Scenarios 5 (unverified user in Payment -> Account Access FULL -> resume Payment), 6 (LIGHT user in Returns -> Account Access FULL -> resume Returns), 7 (login issue mid-Returns flow -> Account Access -> resume Returns).
  - Safety & Escalation: Scenarios 10 (routing loop detected -> immediate human escalation), 11 (missing order ID graceful failure -> human escalation recommendation), 12 (cross-domain cancellation/address update edge case -> human escalation).
  - Security Boundary: Scenario 13 (unverified attempt to mutate profile / payment data blocked by pure gate).
- Integration test suite structure: `server/src/graphs/parent/parent-graph-cross-domain.integration.test.ts` executes all 14 scenarios end-to-end against real PostgreSQL, pgvector, Redis, and PostgresSaver checkpointer, validating routing history rows, checkpointed state transitions, and tool execution audit trails.

## Failure Handling, Loop Prevention & Terminal State Lock (Phase 13) — approved 2026-11-06
- OD-12 (Tool Retry Policy): `executeTool` implements centralized automatic single-retry (`maxRetries = 1`) on transient infrastructure errors (`TIMEOUT`, `NETWORK_ERROR`, `DATABASE_ERROR`). Non-retryable domain outcomes (`NOT_FOUND`, `INVALID_ARGUMENTS`, `INELIGIBLE`, `ALREADY_EXISTS`) and programming bugs (`UNEXPECTED_ERROR`) fail immediately without retry. Tool execution audit table records retry count (`failed after 2 attempts`). On unrecoverable tool infrastructure failure, specialists transition `workflowStatus` to `'ESCALATED'` with a polite human escalation message (Scenario 11).
- OD-13 (Terminal ESCALATED State Router Guard): `evaluatePreClassificationGuards` checks if `state.workflowStatus === 'ESCALATED'` before calling the LLM classifier. If already escalated, it immediately returns `{ outcome: 'ESCALATE' }`, preventing the autonomous bot from hijacking conversations once handed off to human support.
- Loop Prevention Escalation: when `isRoutingLoop` triggers (proposed specialist visited ≥ 2 times or immediate ping-pong with handoffCount ≥ 2), the router logs `decisionType: 'ESCALATION'`, transitions `workflowStatus: 'ESCALATED'`, and outputs a human handoff message (Scenario 10).
- Max Handoff Cap: when `handoffCount >= DEFAULT_MAX_HANDOFFS` (3), the router logs `decisionType: 'ESCALATION'`, transitions `workflowStatus: 'ESCALATED'`, and outputs a human handoff message (Scenario 12).
- Classifier Failure Fallback: when `classifyMessage` fails or throws an exception, the router logs `decisionType: 'FALLBACK'` (which does not increment handoffCount), defaults safely to `order_tracking`, and allows the conversation to continue gracefully without crashing.
- Failure handling integration suite: `server/src/graphs/parent/parent-graph-failure-handling.integration.test.ts` validates loop escalation, tool timeout retry escalation, handoff limit escalation, multi-turn terminal ESCALATED state lock, and classifier fallback routing live against PostgreSQL, Redis, and PostgresSaver checkpointer.

## Observability & Tracing (Phase 14) — approved 2026-11-06
- OD-14 (LangSmith Observability Architecture): Option A adopted — native LangGraph/LangChain tracing via `RunnableConfig` (`runName`, `tags`, `metadata`) paired with a centralized `createTraceConfig` factory in `server/src/observability/`.
  - Config loader in `server/src/shared/config.ts` parses optional environment variables (`LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`, `LANGCHAIN_ENDPOINT`). Tracing is disabled by default in test/dev unless explicitly activated with an API key.
  - Typed metadata sanitization: `sanitizeMetadata` guarantees that no secrets, passwords, or raw verification codes leak into telemetry. Whitelists `conversationId`, `userId`, `threadId`, `domain`, `specialist`, `intent`, `workflowStatus`, `verificationStatus`, `handoffCount`, `level`, and `environment`.
  - Standardized run naming and tagging: `buildRunName` standardizes trace names across hierarchy (`OrchestrAI:ParentGraph`, `OrchestrAI:Router`, `OrchestrAI:Specialist:${specialist}`, `OrchestrAI:Tool`, `OrchestrAI:LLM`). `buildTags` formats searchable run tags for filtering in LangSmith.
  - Offline test safety: parent graph and observability integration suites run with zero real API calls to LangSmith via Vitest in-memory callback spies and disabled tracing flags.
  - Trace propagation integration suite: `server/src/graphs/parent/parent-graph-tracing.integration.test.ts` validates trace config passing, multi-turn metadata propagation across handoffs, escalation status reflection, and tool execution audit trail alignment live against PostgreSQL, Redis, and PostgresSaver checkpointer.

## Evaluation Framework (Phase 15) — approved 2026-11-06
- OD-15 (Evaluation Framework Architecture & Scenario Expansion): Option A adopted — code-first canonical dataset in `server/src/evaluation/dataset/` paired with 8 deterministic programmatic binary evaluators and dual-mode execution (Vitest CI suite + standalone CLI scorecard runner).
  - 30 canonical evaluation scenarios defined in `server/src/evaluation/dataset/scenarios.ts` expanding REFERENCE.md 1-14 with 16 new edge cases, boundary checks, and multi-turn failure trajectories across all 6 domain specialists and 5 patterns.
  - 8 deterministic binary evaluators in `server/src/evaluation/evaluators/binary-evaluators.ts`: `ROUTING_CORRECT`, `HANDOFF_CORRECT`, `SPECIALIST_SCOPE_CORRECT`, `TOOL_SELECTION_CORRECT`, `STATE_PRESERVED`, `KNOWLEDGE_GROUNDED`, `WORKFLOW_COMPLETED`, and `RESOLUTION_CORRECT`.
  - Multi-turn thread evaluation runner in `server/src/evaluation/runner/eval-runner.ts` (`runScenario` and `runBenchmark`): executes multi-turn conversations through LangGraph checkpointer threads, feeds `EvaluatorContext` to all 8 evaluators, and computes domain and evaluator pass rates.
  - Standalone CLI runner in `server/src/evaluation/cli/run-eval.ts` (`npm run eval`): outputs formatted ASCII scorecard tables and generates a markdown report (`eval-results.md`).
  - Threshold verification: `MIN_SIMILARITY = 0.60` confirmed and locked in `server/src/tools/queries/knowledge.tools.ts` for policy retrieval gating.
  - Integration suite in `server/src/evaluation/evaluation.test.ts` validates dataset schema conformity, evaluator completeness, pattern executions, and benchmark reporting offline with zero external network dependencies.

## Backend API Layer (Phase 16) — approved 2026-11-06
- OD-7 (Backend API Architecture & Server Framework): Option A adopted — modular Express.js REST API in `server/src/api/` cleanly separating errors, middleware, schemas, controllers, and routes:
  - App & Lifecycle: `createApp(configure?)` factory with optional router injection for isolated testing; standalone server entrypoint in `server/src/api/server.ts` with graceful SIGTERM/SIGINT shutdown and `"start": "tsx src/api/server.ts"`.
  - Global Error Handling: `AppError` custom error class hierarchy extending native `Error` (`NotFoundError`, `ValidationError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`). Async route handlers wrapped with `asyncHandler`. Centralized `errorHandler` middleware catches `AppError`, `ZodError`, and `SyntaxError` (malformed JSON), sanitizing error messages in production.
  - Authentication & Caller Identity: `x-user-id` header validation middleware enforcing RFC 4122 v4 UUID format against the Postgres `users` table. Transparent guest fallback to a dedicated guest user record (`DEFAULT_GUEST_USER_ID = '00000000-0000-4000-a000-000000000001'`), ensuring foreign key integrity without colliding with nil UUID test assertions.
  - Endpoints Implemented:
    - `GET /health`: unauthenticated liveness and readiness probe executing live PostgreSQL (`SELECT 1`) and Redis (`ping`) checks.
    - `POST /api/conversations`: initializes new conversation thread with optional guest fallback.
    - `GET /api/conversations`: paginated list of conversations scoped to authenticated caller (`limit`, `offset`).
    - `GET /api/conversations/:id`: conversation details with strict caller ownership enforcement (403 for unauthorized callers).
    - `GET /api/conversations/:id/messages`: chronological message history for conversation owner.
    - `POST /api/conversations/:id/messages`: dual-mode message dispatch endpoint. Persists user message with `role: 'user'` to PostgreSQL before graph invocation (hard rule). Standard JSON mode returns final assistant reply, workflowStatus, and routing state; SSE streaming mode (`Accept: text/event-stream`) streams real-time `start`, `node`, `message`, `routing`, and `done` events with client disconnect handling.
    - `GET /api/conversations/:id/traces`: compiles chronological merged timeline of routing decisions, agent executions, and tool execution audit trails for the conversation.
  - Request Validation: Zod schemas (`StartConversationSchema`, `PaginationQuerySchema`, `ConversationIdParamSchema`, `SendMessageSchema`) enforced via `validateRequest` middleware using `Object.assign` to safely update Express request getters.
  - Full API integration and unit suites: 49 tests across `health.test.ts`, `conversations.test.ts`, `messages.test.ts`, and `api.integration.test.ts` validating complete lifecycle, cross-conversation isolation, streaming, error sanitization, and database persistence.

## Testing conventions
- Real DB/Redis in integration tests with scoped cleanup (never an unscoped delete); distinct fixture prefixes to avoid cross-file races.
- Raw verbatim command output in reports; always run typecheck after final edits.


## Frontend Foundation & Customer Chat UI (Phase 17) — approved 2026-11-06
- Phase 16 Amendments (Security, Authorization & Telemetry):
  - Shared Ownership Authorization: `assertConversationOwnership` in `server/src/api/utils/auth-helpers.ts` strictly validates that authenticated callers match conversation owners, and guest users strictly access conversations owned by `DEFAULT_GUEST_USER_ID`. No fail-open authorization.
  - Guest Session Pool: All header-less callers share one guest conversation pool (accepted demo limitation).
  - Turn-Scoped Extraction: `HumanMessage` given explicit UUID `id`. Only `ai` messages produced *after* this pivot ID are extracted. If none produced, skip persistence and return 502 (JSON) / `event: error` (SSE).
  - SSE Abort Resilience: Disconnections tracked via `res.on('close')`. The stream iterator drains to completion without `break`, ensuring checkpoints are preserved and assistant messages are saved once.
  - CORS Locking: Origin locked to `CLIENT_ORIGIN` (`http://localhost:3000` by default) without `credentials: true`.
  - Dev-Gated Demo Endpoints: `GET /api/demo-users` (dynamic user resolution by email) and `GET /api/dev/verification-code` (reads Redis OTP via `verificationService.peekVerificationCode`, 600s TTL per `verification.service.ts`) mounted outside `authMiddleware`, gated by `ENABLE_DEMO_ENDPOINTS` (hard-off in production).
  - OD-17 (OTP Verification Storage & Masking): Option A adopted — OTP codes stored verbatim in DB (`content: "123456"`). In chat feed, user message is rendered cosmetically as `••••••` if and only if it is exactly 6 digits AND immediately preceded by an assistant message with non-null `blockedBy`.
- Client Workspace & Dependency Pinning:
  - Stack: Next.js 14.2.35 App Router, React 18.3.1, Tailwind CSS 3.4.15, Lucide React 0.460.0, React Markdown 9.0.1, Remark GFM 4.0.0, Vitest 2.1.5.
  - Markdown Security: Raw HTML prohibited (no `rehype-raw`), links sanitized (no `javascript:` URLs, forced `rel="noopener noreferrer"`), remote images rendered as safe links (never autoloaded), user messages rendered as plain text.
  - Audit Exceptions List: Upstream Next 14.x advisories related to Image Optimization and Server Actions are accepted exceptions because OrchestrAI client uses neither feature (operates purely as an App Router client fetching from Express). Build-time devDependency advisories for `vitest`/`tinypool` and `eslint` are accepted for local tooling.

## Platform/Ops UI & Observability Dashboard (Phase 18) — approved 2026-11-06
- OD-18 (Ops Architecture & Access Control):
  - Architecture: Dedicated Next.js App Router sub-tree under `/ops` (`/ops` overview & conversation explorer, `/ops/traces/[id]` trace & timeline inspector, `/ops/evals` benchmark scorecard).
  - Backend Ops API: Dev-gated endpoints (`/api/ops/conversations`, `/api/ops/conversations/:id/traces`, `/api/ops/eval-results`) mounted behind `requireDemoEnabled` middleware.
  - Access Gating: Controlled via `ENABLE_DEMO_ENDPOINTS` on server (hard-off in production) and `NEXT_PUBLIC_ENABLE_OPS_UI` on client.
  - Trace Visualization: Chronological timeline with color-coded nodes for Routing decisions (purple), Agent executions (blue), and Tool calls (emerald) with collapsible execution cards and visual multi-agent handoff breadcrumbs.

## Testing, Hardening & Portfolio Documentation (Phase 19) — approved 2026-11-06
- OD-19 (Runtime Hardening, API Security & Deep Health Checks):
  - Core Runtime Hardening: Recursive array and nested object redaction in `executeTool` to mask credentials/PII across array outputs. Reducer null-safety for `user` field in `conversation-state.ts` (`update !== undefined ? update : state`).
  - API Security: 100kb payload limit in Express body parser (`express.json({ limit: '100kb' })`). Production error sanitization suppressing internal stack traces and database error strings when `NODE_ENV === 'production'`.
  - Deep Health & Readiness Check: `/health?deep=true` verifies live PostgreSQL connection (`SELECT 1`) and Redis connectivity (`ping()`), returning 503 if either dependency fails.
  - Frontend Resilience: Next.js App Router error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx`).
  - Portfolio Documentation: Complete root `README.md` with Mermaid architecture diagrams, state lifecycle documentation, Patterns A/B/C explanations, and one-command local startup script (`scripts/run-local.ps1`).

## Conversational Routing & Chat State Isolation (Phase 20) — approved 2026-11-07
- OD-20 (Conversational Router Agent Architecture):
  - Option A adopted: Standalone customer greetings ("hello there", "hi", "good morning") without domain requests are intercepted by `routerNode` via `isGreetingMessage()`. The router responds directly as "OrchestrAI Supervisor", explains the platform's support capabilities (order tracking, returns, payments, refunds, profile, account access), sets `workflowStatus: 'WAITING_FOR_USER_INPUT'`, and keeps `currentAgent: 'router'` without dispatching `Command({ goto: 'order_tracking' })` or requiring an order ID. Subsequent turns statefully route to specialists as an initial assignment without incrementing `handoffCount`.
- Chat Session Isolation & Disassociation:
  - Frontend Synchronous Reset: Switching demo identities or clicking "+ New Chat" synchronously resets `selectedConvId` to `null` and dispatches `RESET_STATE`, immediately wiping transcripts and disconnecting the active LangGraph checkpoint thread.
  - Ownership Error Resilience: On `403 Forbidden` / ownership errors, stale conversation state is wiped (`RESET_STATE` + `STREAM_ERROR`), preventing cross-user message leakage.

## Real User Accounts, Authentication & Storefront Integration (Phase 21) — approved 2026-11-07
- OD-21a (Password Hashing & Security Service):
  - Option A adopted: Passwords hashed using Node.js standard `crypto.scrypt` with a fresh 16-byte cryptographically random salt and 64-byte derived key. Verification uses constant-time `crypto.timingSafeEqual`. Requires zero external binary dependencies (`bcrypt` or `argon2`), avoiding build issues while guaranteeing security.
- OD-21b (Session Token Transport & Dual-Mode Compatibility):
  - Option A adopted: Stateless signed HMAC-SHA256 Bearer tokens (`Authorization: Bearer <token>`) signed with `TOKEN_SECRET`. Auth middleware evaluates Bearer tokens first, preserving backward compatibility with `x-user-id` header for existing benchmark suites and evaluation harnesses.
- OD-21c (Order & Shipment Initialization on Checkout):
  - Option A adopted: `POST /api/orders` executes an atomic transaction creating `orders` (status: 'paid'), `order_items` (with unit price snapshot), `payments` (status: 'captured'), and `shipments` (status: 'in_transit' with tracking number). Newly registered users can immediately query the agent in chat regarding their real order with instant grounded answers.
- Frontend Auth & Commerce Experience:
  - `AuthProvider` & `useAuth()` hook managing token persistence in `localStorage`.
  - Accessible `AuthModal` with Sign In / Register tabs.
  - Interactive `StorefrontModal` displaying catalog products, real-time cart pricing, and a 1-click "Ask Agent About This Order" action.
  - Seamless fallback to demo identities for development and scenario benchmarking.

## Mandatory User Auth & Dedicated Storefront / Orders Pages (Phase 22) — approved 2026-11-08
- OD-22a (Client-side Navigation Guard via `useRequireAuth`):
  - Option A adopted: Lightweight React hook `useRequireAuth(targetPath)` inspecting `isAuthenticated` and `isLoading` from `auth-context.tsx`. When unauthenticated, automatically navigates to `/login?redirect=${encodeURIComponent(targetPath)}`. Logged-in sessions persist across page refreshes and browser restarts via localStorage Bearer tokens. Protects root customer chat (`/`), `/store`, and `/orders`.
- OD-22b (1-Click Order Chat Integration via Query Parameter):
  - Option A adopted: When users click "Ask Agent About This Order" from either the `/store` checkout receipt or `/orders` history card, they navigate to `/?orderId=${order.id}`. The root chat component inspects `useSearchParams().get('orderId')` within `<Suspense>` and initializes the chat message draft with `"Where is my order ${orderId}? Can you give me the latest tracking status?"`. Enables immediate single-click conversational tracking without manual copy-pasting.
- Dedicated App Router Pages & Clean UX:
  - Dedicated `/login` and `/register` pages with error banners, loading indicators, and post-auth redirect handling.
  - Global `TopNav` displaying direct links to `Support Chat`, `Store`, `My Orders`, and an active user profile pill with `Sign Out`.
  - Cleaned user-facing sidebar by removing the demo identity selector and disclaimer while preserving database seed fixtures for headless evaluation test suites.
  - Dedicated `/store` catalog with product quantity selection, real-time total calculation, address verification, and instant checkout receipt.
  - Dedicated `/orders` management page showing real order IDs, placed dates, order totals, shipping destinations, status badges (`paid`, `shipped`, `delivered`, `pending`, `cancelled`), and direct "Ask Agent" routing.

## Conversational UX, Interactive Service Menu & Order Tracking Reliability (Phase 23) — approved 2026-11-08
- OD-23a (Dynamic Greeting Response Generation):
  - Option A adopted: In `routerNode`, replaced static multi-sentence assistant introduction with structured LLM generation (`generateGreetingResponse`, temperature 0.2) returning `{ greeting: string, options: ServiceOption[] }`. Greetings are concise (1-2 sentences), natural, and context-dependent. Fallback to a polite, short static default if LLM is unavailable.
- OD-23b (Interactive Service Options Transport & Rendering):
  - Option A adopted: Options are attached to `AIMessage.additional_kwargs.options`, forwarded through `message.controller.ts` via the SSE `routing` event (`SSERoutingEvent.options`), and stored in `ChatState.serviceOptions`. The client renders these as clickable pills (`ServiceOptionBar`) beneath the last assistant message. Clicking an option dispatches `sendMessage` directly, and `START_SEND` automatically clears active options.
- OD-23c (Order Tracking Continuation Guard):
  - Option A adopted: In `routerNode`, when `state.routing.currentAgent === 'order_tracking'` and `state.workflowStatus === 'WAITING_FOR_USER_INPUT'`, router bypasses LLM classification and dispatches directly back to `order_tracking`. Prevents misclassification and loop drops during multi-turn order ID collection.

## Phase 24 (Stabilization) — approved 2026-11-09
- OD-24a (Session-Identity Seeding & Propagation):
  - Option A adopted: Pure helper `server/src/state/session-identity.ts` maps `req.authMethod === 'bearer'` to `status: 'LIGHTLY_VERIFIED'` with `verificationMethod: 'session'`. Guests and `x-user-id` callers map to `UNVERIFIED`. Existing `status: 'VERIFIED'` in checkpoints is preserved only if `verifiedAt` is within 15-minute TTL, else drops to `LIGHTLY_VERIFIED`. The helper never elevates to `VERIFIED`. Ensures logged-in Bearer customers are never blocked by LIGHT-gated tools (`get_order`, `get_shipment_status`).
- OD-24b (Duplicate Charge Human Review Escalation & `review_requests` Table):
  - Option A adopted: Added relational `review_requests` table to `server/src/persistence/db/schema.ts` (migration `0008_nappy_thunderbolt.sql`). When payment specialist detects duplicate charges, it asks customer for confirmation. Upon confirmation, a `review_requests` record with `status: 'pending'` is persisted to Postgres and the conversation transitions to `WAITING_FOR_USER_INPUT` awaiting staff review, eliminating ungrounded automated refunds.
- OD-24c (Per-Turn Handoff Counter Semantics & Loop Exemption on Resume):
  - Option A adopted: `routing.handoffCount` is turn-scoped (initialized to 0 per user turn via graph input `{ routing: { handoffCount: 0 } }` in `message.controller.ts`). Only the parent router mutates `handoffCount` when executing a `HANDOFF` or `RE_ROUTE`; specialists never emit handoff count updates. Resume transitions (`RE_ROUTE`) are exempt from loop detection.
- Universal Blocked-Reply Helper & State Cleanup:
  - `createBlockedResponse` helper in `state/blocked-workflow.ts` standardizes polite, explanatory customer replies across all specialist gate blockages. Specialists clear `activeWorkflow: null` upon successful completion.

## Phase 25 (Email Verification & Multi-Turn Profile Verification Flow) — approved 2026-11-12
- Resend Email Service & Verification Code Template:
  - Added Resend-based `sendEmail` service in `server/src/services/email.service.ts` with lazy client initialization, 8-second timeout (`Promise.race`), and `config.email.dryRun` defaulting to true in test environments.
  - Zero PII in logs: logs only `messageId` and the recipient domain (e.g. `@gmail.com`).
  - Added pure `renderVerificationCodeEmail` template generating accessible table-based HTML and plain-text versions without external assets or links.
- Verification Service Hardening:
  - Single source of truth `VERIFICATION_CODE_TTL_SECONDS = 600`.
  - 60-second per-user resend cooldown enforced via Redis key `verify:cooldown:{userId}` (`SET NX EX 60`).
  - Added `revokeVerificationCode(userId)` to delete `verify:{userId}` if email delivery fails.
- `start_identity_verification` Tool Contract:
  - Never returns the raw code; returns `{ sent: true, maskedEmail: string, expiresInSeconds: number }`.
  - Recipient is loaded strictly from the database for `userId`; never accepted from tool input.
  - On cooldown, returns `RESEND_COOLDOWN` failure with retry seconds remaining.
- Context-Aware Field Identification in `profileNode`:
  - `ProfileIntentSchema` includes `targetField` (`name` | `defaultAddress` | `both` | `unknown`).
  - Injected bounded conversation transcript via `formatConversationTranscript` into intent extraction prompt.
  - When no new value is supplied, asks specifically for the targeted field (e.g. name or address).
  - Guarded `isResuming` by `state.identity?.status === 'VERIFIED'`, preventing premature execution of old pending requests on mid-flow refinement turns.
- Router Domain Override for Verification Requests:
  - When an active workflow is blocked by verification, requests for a verification code route to `account_access`, overriding domain bias from `currentDomain`.
  - Narrowed Guard 3a catches 6-digit codes (`/\b\d{6}\b/`) directly to `account_access` without re-classifying.
- Database Idempotency & Concurrency Hardening:
  - Applied unique index on `returns(order_id)` and partial unique index on `refunds(payment_id) WHERE status != 'failed'` (migration `0009_chemical_tana_nile.sql`).
  - Added transaction-level PostgreSQL advisory locking (`pg_try_advisory_xact_lock(hashtext(conversationId))`) in `message.controller.ts` to serialize turns per conversation and return 409 Conflict on concurrent POST requests.
- LLM & Tool Execution Resilience:
  - 10-second timeout with single exponential-backoff retry on transient errors in `llm/client.ts`.
  - Mutation tools (`create_return`, `create_refund`, `update_profile`, `start_verification`, `verify_identity`) restricted to zero retries in `tools/execution.ts`; idempotent read tools retry on transient database errors.

## Phase 25 (Conversational Routing & Memory Overhaul) — approved 2026-11-11
- OD-25a (Elimination of Sticky Continuation Locks):
  - In `routerNode`, removed legacy continuation guards 3b (order tracking) and 3c (payment confirmation). Narrowed verification guard 3a to pure 6-digit numeric OTP regex (`/^\d{6}$/`) during active verification, and kept narrow bare-UUID regex fast path. All other messages reach the contextual classifier dynamically.
- OD-25b (Grounded General Assistant Specialist Node):
  - Created `general_assistant` specialist node (`server/src/agents/specialists/general-assistant/`) grounded strictly in a typed platform capabilities registry. Answers greetings, capability inquiries ("what else can you do?"), and store questions with structured suggestions, transitioning state to `workflowStatus: 'WAITING_FOR_USER_INPUT'`.
  - Abandon pending non-verification tasks upon conversational topic switches.
- OD-25c (Conversation Entity Memory & Pending-Task Tracking):
  - Added additive `lastKnownEntities` and `pendingTask` fields to `ConversationState` (`server/src/state/conversation-state.ts`, protected file).
  - Specialists write resolved `orderId`, `paymentId`, and `returnId` to `lastKnownEntities` on completion. Subsequent turns reference "this order" seamlessly across specialists.
- OD-25d (Transcript & Entity Context Injection):
  - Created `server/src/agents/common/context.ts` providing `formatConversationTranscript(messages, limit = 6)` and entity formatters.
  - Injected transcript, pending task state, and entity memory into classifier and specialist prompts.
- OD-25e (Friendly Activity Streaming & UI Progress Decoupling):
  - Express SSE controller emits typed `event: activity` delivering friendly progress messages (`"Looking up order and shipment details..."`) to user chat while preserving raw node names in ops traces.
  - Client `ChatFeed` renders friendly activity text without exposing backend specialist node names to customers.
- OD-25f (Multi-Intent Classification & Queued Intent Routing):
  - Classifier detects compound requests with up to 2 intents (primary + secondary).
  - Router dispatches primary intent and saves secondary intent in `state.intentQueue`.
  - Added conditional edges from specialists returning to router when `intentQueue` has pending items, capping execution safely.

## Phase 26 (Profile Update & Identity Verification Flow) — approved 2026-11-13
- OD-26a (Profile-Owned Verification Flow Architecture):
  - The profile update flow is owned entirely by the profile specialist across a 4-step state machine (`collect_value` -> `confirm_change` -> `awaiting_code` -> database update). No Pattern C handoff to Account Access is used for profile updates (Account Access handles view-profile verification and password resets).
  - Normalization library in `server/src/shared/normalization.ts` handles `maskEmail()`, `conservativeTitleCaseName()`, and `normalizeName()`, preserving internal capitals (McDonald, O'Brien) and trimming whitespace.
  - `rawInput` is stored only in the Redis payload (`profile:verify:{userId}`) for verification, never logged or returned in API responses, and discarded on completion or eviction.
- OD-26b (Redis Key Architecture & Namespace Isolation):
  - Separate Redis keys from Account Access: `profile:verify:{userId}` (hash containing codeHash, pendingUpdates, snapshot, attempts, expiresAtMs; TTL 900s) and `profile:verify:cooldown:{userId}` (60s resend cooldown).
  - Verification codes are hashed using SHA-256 before storage; the raw 6-digit code is never persisted in production.
  - In non-production environments (`NODE_ENV !== 'production'`), a temporary peek key `profile:verify:peek:{userId}` (120s TTL) is written to support deterministic integration and E2E test verification via `GET /api/demo/profile-verify-peek/:userId`.
- OD-26c (Atomic Verification via Lua & Attempt Reset on Resend):
  - Atomic verification executed via Redis Lua script: returns `OK`, `EXPIRED`, `TOO_MANY_ATTEMPTS`, or `INVALID`. The `INVALID` branch is the only path that writes (increments attempt counter).
  - Attempt limit capped at 5; 6th attempt triggers `TOO_MANY_ATTEMPTS` lockout.
  - Resend resets attempts to 0 (`resend-resets-attempts = yes`) and deletes the previous code.
  - Successful verification immediately deletes the pending verification key and any active cooldown key.
- OD-26d (Non-Throwing Email Service & Transient Failure Cooldown):
  - `sendEmail` returns `Promise<EmailResult>` and never throws.
  - When email delivery fails, the unusable code is deleted, but a shortened 15s failure cooldown key (`SET profile:verify:cooldown:{userId} 15`) is activated to prevent rapid spamming while allowing prompt user retry.
  - Delivery statuses modeled as `'sent' | 'failed'` (no 'bounced' status).
- OD-26e (Snapshot-Based Optimistic Concurrency Control):
  - Concurrency safety implemented via snapshot conditional SQL update against the `users` table:
    `UPDATE users SET ... WHERE id = :userId AND name = :nameSnapshot AND default_address = :addressSnapshot`
  - If 0 rows are affected (due to concurrent edit), the verify endpoint and agent return `{ status: "conflict" }` without overwriting concurrent edits.
- OD-26f (Client Verification Prompt 7-State Deterministic State Machine):
  - Frontend component `VerificationPrompt` in `client/src/components/chat/verification-prompt.tsx` runs a strict 7-state machine: `idle`, `requesting`, `awaiting_input`, `verifying`, `resending`, `success`, `locked_out`.
  - Timers are derived from server timestamps (`expiresAtMs`, `resendAtMs`).
  - Copy is clean and customer-friendly without system-leak tokens (no raw snake_case or technical error strings).

## Phase 29 (PDF RAG Pipeline & Hardening)
- Hybrid Retrieval: reciprocal rank fusion (RRF) combining dense cosine similarity and sparse full-text search (`tsvector` / `websearch_to_tsquery('english', ...)`).
- Embeddings Model: `gemini-embedding-001` via `@google/genai` (768 dimensions, L2 norm ≈ 0.57) replacing legacy `text-embedding-004` (L2 norm ≈ 1.0).
- Scale Hardening: `p-limit` concurrency throttle (`CONCURRENCY_LIMIT = 5`), dry-run validation flag, resident set size (RSS) tracking, embedding call counter, and `page_number` metadata preservation in migration `0013_page_number.sql`.
- 42P01 Error Guard: `retrieveKnowledge()` catches Postgres `42P01` (`UNDEFINED_TABLE`) on fallback query to `knowledge_documents` and returns `{ success: true, data: [] }` rather than failing, enabling safe future execution of `0014_drop_knowledge_documents.sql`.
- Latency Budget: p95 latency target locked to `<2,000ms` justified by remote Gemini API embedding tail latency; local query and RRF fusion latency verified at ~53ms and <1ms.
- Cross-Space Rollback Semantics: Rollback fallback to `knowledge_documents` provides degraded cross-space cosine similarity; documented in `MIGRATION.md` and `DEPLOYMENT.md`.
- Legacy Golden Set Isolation: `eval/retrieval-queries.json` marked legacy via `eval/retrieval-queries.README.md`; CI strictly evaluates canonical 6-query `knowledge-golden-dataset.json`.

### Phase D Production Sign-Off (2026-11-20)
- p95 SLI `<2,000ms` accepted for production (embed-bound: query+fusion ≈53ms, embed tail drives budget). Query-embedding cache deferred; revisit when production data shows sustained p95 >2,000ms or high repeat-query rate.
- Backend + Neon Postgres colocated in `us-east-2`. Operator must verify Neon project region matches backend deploy region before ingestion; mismatch invalidates the p95 target by 12.5–16×.
- 0014 backup policy: cold `pg_dump` with verified restore + prior-day off-site copy is the sole contractual recovery mechanism. PITR is a bonus, not contractual.
- CI Gate 2 parallelism deferred; sequential 137–159s accepted at current PR volume. Revisit when PR-velocity friction emerges.
- Full decisions: see `docs/OPEN-DECISIONS.md` item 30.
### Phase D Production Deployment (2026-11-20)

- **Fresh database bootstrap.** PROD started as an empty Neon Postgres 18.7 database in `us-east-2`. Migration chain applied 14 migrations (0000–0013); `0014_drop_knowledge_documents` moved to `migrations-deferred/` and deferred to Phase E, because `searchKnowledgeByEmbedding` and `schema.ts` still reference the table — running `0014` now would cause the next `drizzle-kit generate` to re-create it.
- **Migration journal repair.** Discovered during fresh-bootstrap audit: `_journal.json` was missing entries 0013 and 0014 despite `.sql` files existing. `drizzle-orm/node-postgres/migrator` silently skipped them, meaning `page_number` was never added on a fresh DB. Repaired by regenerating 0013 via `drizzle-kit generate` and moving 0014 to `migrations-deferred/`. Journal now 14 entries, 14 snapshots, 14 active .sql files.
- **Test DB isolation.** `TEST_DATABASE_URL` and `TEST_DATABASE_URL_UNPOOLED` added to `server/.env`, pointing at a Neon branch `ep-odd-wildflower` off PROD. `test-global-setup.ts` now prefers `TEST_DATABASE_URL` over `DATABASE_URL` with a loud log line when the override is active. Prevents test runs from mutating PROD.
- **Ingest verified end-to-end.** PROD and TEST both at 14 chunks / 5 doc versions. Embedding L2 norm 0.5795 confirms `gemini-embedding-001` with `RETRIEVAL_DOCUMENT` taskType; if the pipeline had regressed to `text-embedding-004` or dropped taskType, L2 would be ≈ 1.00. Section paths identical between PROD and TEST — pipeline is deterministic.
- **Smoke probes 8/8 PASS.** P1–P6 top-1 match expected sections; N1 (cross-domain) and N2 (nonexistent topic) return 0 hits. Notably P6 top-1 is `"How does the verification code process work?"`, not the stale golden `targetSectionPath` — RRF ranks the more specific section first.
- **Test suite green.** 128 passed | 20 skipped (148 total) against the isolated TEST database. 20 skipped are the deferred large-doc fixture tests behind `RUN_LARGE_DOC_TESTS`.
- **Latency (dev-only).** Smoke probe p50 3,059ms / p95 7,190ms measured from Pakistan to Ohio — WAN-bound, not code-bound. Confirms the colocation requirement (production backend in `us-east-2` should see p50 500–800ms, embed-dominated).
- **Pre-backend-launch blocker.** `ENABLE_DEMO_ENDPOINTS=true` currently set in `server/.env` — must be `false` before the backend HTTP server launches. Documented in `DEPLOYMENT.md` §1.

## Phase 36 Retrieval Latency Optimization (2026-11-23)
- **OD-36 (Connection-Level HNSW GUC Strategy)**: Option A adopted. Dedicated retrieval pool in `server/src/persistence/db/retrieval-client.ts` (`max: 3`) using Neon's direct unpooled endpoint with startup query parameters via `DATABASE_URL_RETRIEVAL`:
  `&options=-c%20hnsw.ef_search%3D100%20-c%20hnsw.iterative_scan%3Drelaxed_order%20-c%20hnsw.max_scan_tuples%3D40000`.
- **Four Rejected Approaches for HNSW GUC Management**:
  1. *URL options parameter on pooled endpoint (`DATABASE_URL`)*: Rejected. Neon PgBouncer in transaction mode rejects custom startup parameters with error `08P01` ("unsupported startup parameter in options: hnsw.ef_search").
  2. *Role-level GUC configuration (`ALTER ROLE neondb_owner SET ...`)*: Rejected. Failed with error `42501` ("permission denied to set parameter hnsw.ef_search"). Neon does not grant superuser privileges to `neondb_owner`.
  3. *Session-level hook (`pool.on('connect') SET ...`)*: Rejected as unsafe. On pooled transaction-mode PgBouncer, backend connections are shared across distinct clients and persistent session `SET` leaks GUC states across transactions.
  4. *Silent fallback to `DATABASE_URL` when `DATABASE_URL_RETRIEVAL` missing*: Rejected. Would silently revert `hnsw.ef_search` to default `40` without any warning or error, causing invisible recall degradation. `retrieval-client.ts` strictly throws a descriptive error if `DATABASE_URL_RETRIEVAL` is absent.
- **Chosen Unpooled-Endpoint Approach**: `server/src/persistence/db/retrieval-client.ts` connects directly to Neon (bypassing PgBouncer) where custom startup GUC parameters are supported natively. Verified deterministically across 5/5 fresh connection allocations.
- **Telemetry Critical Path**: Telemetry fire-and-forget verified (`void logRetrievalExecutionSafely(...)`). Recovered ~80ms p50 (honestly measured; not 222ms, because telemetry ran parallel to sparse retrieval).
- **Dense Round-Trip Elimination (Layer A)**: Collapsed `searchDenseScoped` from 6 serial queries (`BEGIN`, 3× `SET LOCAL`, `SELECT`, `COMMIT`) to 1 autocommit `SELECT` query via `retrievalDb`. Dense p50 reduced from 996.88ms to 665.82ms over WAN.
- **Single-CTE Hybrid Consolidation (Layer B)**: Implemented `searchHybridScopedCTE` in `knowledge.repository.ts`, consolidating dense vector search, sparse full-text search, and Reciprocal Rank Fusion (RRF k=60) into **exactly 1 database round-trip statement** with deterministic tie-breaking. Switched `retrieveKnowledge` in `retrieval.ts` to use `searchHybridScopedCTE`. Measured retrieval p50 dropped from 1,223.20ms (Phase 35 baseline) to **349.01ms** (71.5% reduction) over WAN. Equivalence verified with 0/30 set or order differences against pre-CTE baseline across 30 stratified queries from golden dataset v2.
- **Production Retrieval Latency Measurement & Temporary Diag Route (Phase 36)**: A temporary header-gated diagnostic route (`server/src/api/diag/retrieval-latency.ts` gated by `x-diag-token === ADMIN_DIAG_TOKEN`, returning 404 on missing/wrong token) was deployed to Railway to capture true cross-region retrieval latency without client-side WAN packet jitter. Warmup-excluded measurement (N=30 runs after 5 discarded warmup runs) executed directly from Railway (`measurement_origin: railway-us-east4` to Neon `us-east-2`) yielded:
  - **p50**: `21.42ms`
  - **p95**: `22.23ms`
  - **min**: `20.95ms`
  - **max**: `22.37ms`
  - **mean**: `21.47ms`
  The diagnostic endpoint and its test file were removed immediately after capturing this production measurement; zero lingering references remain in code.

## Phase 37 Corpus Scale, Chunker Fix & Re-Labeling (2026-11-25)
- **OD-37a (`upsertKnowledgeVersion` Superseding Scope — Option A)**: Scoped version superseding in `knowledge.repository.ts` by `docId` (instead of `(domain, topic)`), with a required sibling-doc regression test. Semantic shift: `topic` transitions from *"one doc per topic"* to *"a retrieval bucket containing N documents"*, while specialist-to-topic scope remains 1:1. **Corpus scaling converts scoped retrieval from saturated to informative; the eval signal that was previously null becomes real.**
- **OD-37b (`knowledge_chunks.chunk_key` & Partial Unique Index — Option B)**: Added `chunk_key text NOT NULL` (zero-padded 2-digit positional key `'01'`, `'02'`, ..., not derived from section headings) to `knowledge_chunks` with partial unique index `knowledge_chunks_version_chunk_key_active_unique ON knowledge_chunks (version_id, chunk_key) WHERE status = 'active'`. Preserves `search_vector` (`GENERATED ALWAYS AS (to_tsvector('english', coalesce(section_path, '') || ' ' || content)) STORED` per `0012_nice_groot.sql`), allows historical `superseded` rows to coexist with `active` rows at the same `(version_id, chunk_key)`, and enforces a same-version content-hash guard (halting if `existing.version === incoming.version && existing.content_hash !== incoming.content_hash`).
- **OD-37c (Topic Naming Convention)**: Standardized on underscore topic identifiers (`account_security`, `data_deletion`) matching existing frontmatter and `specialist-scope.ts`.
- **Unscoped Topics & Production Retrieval Surface (Phase 37)**: Phase 37 scales corpus from 66 to ~516 chunks across 12 topics. Only 5 of 12 topics are current production-retrievable in `scoped-retrieval.ts`; 7 topics return `NO_KNOWLEDGE_ACCESS` because their specialists (`profile`, `general_assistant`) have null scope and no unscoped fallback. Scoped eval measures 5 topics / ~300 chunks; unscoped eval measures 12 topics / ~516 chunks. Phase 38 must report both and label them. The 15 unscoped-topic new docs are dormant from the production perspective but active in unscoped eval and ready for future specialist-scope expansion.
- **Procedural Numbers Exclusion (Phase 37b.2)**: Procedural numbers (5 password attempts, 3 checkout attempts, 6-digit OTP format) are captured in the frozen corpus as procedural detail but are deliberately not extracted as policy facts. They are triggered by action sequences, not by customer-facing policy parameters, and are therefore out of scope for the contradiction audit. Additional procedural triggers identified in the frozen corpus but out of scope for numeric-fact auditing: 3 distinct IP addresses for velocity detection, 5 failed OTP attempts for OTP lockout.







