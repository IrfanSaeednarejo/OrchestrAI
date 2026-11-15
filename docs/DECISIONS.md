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

## Testing conventions
- Real DB/Redis in integration tests with scoped cleanup (never an unscoped delete); distinct fixture prefixes to avoid cross-file races.
- Raw verbatim command output in reports; always run typecheck after final edits.
