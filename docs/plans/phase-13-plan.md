# Phase 13 — Failure Handling & Loop Prevention — PLAN (status: APPROVED)

## Approvals
- 2026-11-06: Approved by owner in chat ("COntinue: Approved"). OD-12 (tool retry policy) and OD-13 (terminal ESCALATED state guard) approved.

---

## 1. Goal and how it fits the architecture

Harden the OrchestrAI platform against operational failures, circular routing loops, handoff storms, and transient tool outages by implementing robust failure handling, deterministic loop fallback/escalation, systematic tool retries with automatic human escalation, and strict terminal state enforcement.

This phase guarantees that OrchestrAI never enters an unrecoverable crash state, never gets trapped in infinite ping-pong loops between specialists, never silently drops transient tool failures, and deterministically halts autonomous bot intervention once a conversation transitions to `ESCALATED`.

---

## 2. Dependencies satisfied / missing

**Satisfied:**
- Phase 1–12 complete and signed off: 414/414 tests passing across 53 files.
- All 6 concrete domain specialists (`order_tracking`, `returns`, `payment`, `refund`, `profile`, `account_access`) and parent router graph validated end-to-end in Phase 12.
- Deterministic router guards (`isHandoffCapExceeded`, `isRoutingLoop`, `checkResumePreconditions`) operational in `server/src/routing/guards.ts`.
- `RoutingDecisionType` in `schema.ts` and `events.ts` already includes `'ESCALATION'` and `'FALLBACK'`.
- `WorkflowStatus` in `conversation-state.ts` already includes `'ESCALATED'` and `'FAILED'`.

**Missing:**
- None.

**Branch**: `phase/13-failure-handling` created off `phase/12-cross-domain-validation` tip (`8d6d9ee`).

---

## 3. Scope IN / scope OUT

**Scope IN:**
1. **Tool Retry Policy in `executeTool`**:
   - Centralized retry mechanism with configurable `maxRetries` (default: 1 for retryable errors).
   - Retryable errors: transient exceptions, timeout simulation, `TIMEOUT`, `NETWORK_ERROR`, `DATABASE_ERROR`, `UNEXPECTED_ERROR`.
   - Non-retryable domain outcomes: `NOT_FOUND`, `INVALID_ARGUMENTS`, `ALREADY_EXISTS`, `INELIGIBLE`, `VERIFICATION_REQUIRED`, `TOOL_NOT_PERMITTED` (must fail immediately without retry).
   - Telemetry: record tool execution attempts and log retry failure in `tool_executions`.
2. **Tool Failure Escalation in Specialists**:
   - When a critical tool operation fails after retry (or returns unrecoverable infrastructure failure), the specialist sets `workflowStatus: 'ESCALATED'` and returns a polite message indicating escalation to a human specialist (satisfying Scenario 11).
3. **Loop Fallback & Escalation in Parent Router (`guards.ts` & `parent-graph.ts`)**:
   - Pre-classification guard for existing `ESCALATED` terminal state: if a conversation has reached `ESCALATED`, subsequent user messages bypass the LLM classifier and maintain `workflowStatus: 'ESCALATED'` with human support triage.
   - Loop detection hardening: when `isRoutingLoop` triggers, log routing event `decisionType: 'ESCALATION'`, set `workflowStatus: 'ESCALATED'`, and return human escalation message (Scenario 10).
   - Classifier failure fallback: when `classifyMessage` fails (LLM error / unparseable response), log routing event `decisionType: 'FALLBACK'`, route to fallback specialist or escalate safely.
4. **Max Handoff Count Hardening**:
   - When `handoffCount >= maxHandoffs` (default 3), deterministic guard logs `decisionType: 'ESCALATION'`, sets `workflowStatus: 'ESCALATED'`, and routes to human support (Scenario 12).
5. **Comprehensive Unit and Integration Test Suite**:
   - Unit tests for retry policy in `executeTool` (`execution.test.ts`).
   - Unit tests for terminal state and loop fallback in `guards.test.ts`.
   - Dedicated integration test suite `failure-handling.integration.test.ts` exercising Scenario 10 (loop escalation), Scenario 11 (transient timeout -> retry once -> escalate), Scenario 12 (max handoffs -> escalate), terminal `ESCALATED` state lock, and classifier `FALLBACK`.

**Scope OUT:**
- External alerting infrastructure (PagerDuty, Slack webhooks) — deferred.
- Distributed circuit breakers across microservices (Kafka/Envoy) — not needed in single-service monolith.
- Schema changes or database migrations — existing schema fully supports `ESCALATION` and `FALLBACK`.

---

## 4. Open decisions this phase must resolve

### OD-12: Tool Retry & Failure Escalation Architecture
- **Options**:
  - *Option A*: Centralized single retry (`maxRetries = 1`) in `executeTool` for retryable error codes/exceptions; on retry exhaustion, specialist sets `workflowStatus: 'ESCALATED'`.
  - *Option B*: Each specialist subgraph implements its own manual retry loop around individual tool calls.
- **Tradeoffs**: Option A centralizes retry logic, avoids boilerplate across 6 specialists, and standardizes error telemetry. Option B requires repetitive error-handling loops in every specialist.
- **Recommendation**: Adopt Option A. Centralized in `executeTool` with an optional `retryConfig` parameter (`{ maxRetries?: number, retryableErrors?: string[] }`).

### OD-13: Terminal `ESCALATED` State Router Guard
- **Options**:
  - *Option A*: Add an `isEscalated` check in `evaluatePreClassificationGuards`: if `state.workflowStatus === 'ESCALATED'`, return `{ outcome: 'ESCALATE', reason: 'Conversation in terminal ESCALATED state.' }`, completely bypassing LLM classification.
  - *Option B*: Reset `workflowStatus` to `'ACTIVE'` on every turn and re-classify with the LLM.
- **Tradeoffs**: Option A respects customer support domain rules (once handed off to a human agent, the automated bot stops interrupting until de-escalated). Option B can bounce the customer back to bots while waiting for human support.
- **Recommendation**: Adopt Option A.

---

## 5. Steps (small, ordered)

### Step 1: Tool Retry Policy & Error Classification (`executeTool`)
- **Files touched**:
  - `server/src/tools/execution.ts`
  - `server/src/tools/execution.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: No conversation state changes. `tool_executions` records retry count / failure.
- **Failure cases**: Retry on non-retryable error (prevented by strict error classification allowlist).

### Step 2: Tool Failure Escalation in Specialist Subgraphs
- **Files touched**:
  - `server/src/agents/specialists/order-tracking/order-tracking.ts`
  - `server/src/agents/specialists/payment/payment.ts`
  - `server/src/agents/specialists/returns/returns.ts`
  - `server/src/agents/specialists/refund/refund.ts`
- **Protected files affected**: None.
- **State ownership & changes**: On infrastructure tool failure after retries, specialist emits `{ workflowStatus: 'ESCALATED', messages: [...] }`.
- **Failure cases**: Mistaking business decline (`NOT_FOUND`, `INELIGIBLE`) for infrastructure failure (prevented: business errors remain `COMPLETED` or `WAITING_FOR_USER_INPUT`).

### Step 3: Terminal State Guard & Loop Fallback in Router
- **Files touched**:
  - `server/src/routing/guards.ts`
  - `server/src/routing/guards.test.ts`
  - `server/src/graphs/parent/parent-graph.ts`
  - `server/src/graphs/parent/parent-graph.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: If `state.workflowStatus === 'ESCALATED'`, pre-classification guard returns `ESCALATE` immediately. If LLM classification fails, router logs `decisionType: 'FALLBACK'`.
- **Failure cases**: False positive escalation (prevented: only explicitly triggered by `workflowStatus === 'ESCALATED'`, loop guard, or handoff cap).

### Step 4: Dedicated Failure Handling Integration Test Suite
- **Files touched**:
  - `server/src/graphs/parent/parent-graph-failure-handling.integration.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Real Postgres, pgvector, Redis, PostgresSaver checkpointer.
- **Tests**:
  1. Scenario 10: Routing loop A -> Parent -> B -> Parent -> A triggers loop detection -> `ESCALATION`.
  2. Scenario 11: Tool timeout / failure -> retries once -> escalates to human agent (`ESCALATED`).
  3. Scenario 12: Max handoff count reached (`handoffCount >= 3`) -> escalates (`ESCALATED`).
  4. Terminal `ESCALATED` state lock: subsequent messages while in `ESCALATED` state do not invoke classifier or specialists.
  5. Classifier error fallback: classifier exception -> routes with `decisionType: 'FALLBACK'`.

### Step 5: Docs Close-Out & Sign-Off
- **Files touched**:
  - `docs/STATUS.md`
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md`
  - `docs/OPEN-DECISIONS.md`
  - `docs/plans/phase-13-plan.md`
- **Protected files affected**: None.
- Verification: `npm run lint`, `npm run typecheck`, `npm test` (all 414+ tests green).

---

## 6. Functional requirements

1. `executeTool` retries once on retryable errors (`TIMEOUT`, `NETWORK_ERROR`, `DATABASE_ERROR`, `UNEXPECTED_ERROR`).
2. Domain outcomes (`NOT_FOUND`, `INVALID_ARGUMENTS`, `INELIGIBLE`, `ALREADY_EXISTS`) do not retry.
3. Persistent tool infrastructure failures transition workflow to `workflowStatus: 'ESCALATED'` with human escalation message.
4. Circular routing loops (same specialist visited twice with handoffs >= 2, or immediate ping-pong) trigger `decisionType: 'ESCALATION'` and `workflowStatus: 'ESCALATED'`.
5. Max handoff limit (3) triggers `decisionType: 'ESCALATION'` and `workflowStatus: 'ESCALATED'`.
6. Conversations in `workflowStatus: 'ESCALATED'` lock into human escalation mode on subsequent customer turns.
7. Unparseable/failed classifier responses trigger `decisionType: 'FALLBACK'`.

---

## 7. Non-functional requirements

- **Determinism**: Guards run before LLM; retries execute synchronously with zero external race conditions.
- **Observability**: Every retry attempt and routing escalation is recorded in Postgres (`tool_executions` and `routing_history`).
- **Performance**: Retries bounded to 1 attempt to avoid stalling conversation turns.
- **Testability**: All failure modes reproducible deterministically in Vitest.

---

## 8. Acceptance criteria

1. Unit tests in `server/src/tools/execution.test.ts` prove:
   - Successful tool executes once without retry.
   - Non-retryable error (`NOT_FOUND`) fails without retry.
   - Retryable error (`TIMEOUT`) retries once; if 2nd attempt succeeds, returns success.
   - Retryable error that fails twice returns failure with retry count recorded.
2. Unit tests in `server/src/routing/guards.test.ts` prove:
   - `evaluatePreClassificationGuards` escalates immediately when `state.workflowStatus === 'ESCALATED'`.
   - `isRoutingLoop` correctly identifies circular transitions.
   - `isHandoffCapExceeded` triggers at `handoffCount >= 3`.
3. Integration suite `parent-graph-failure-handling.integration.test.ts` proves:
   - Scenario 10 (routing loop escalation) passes against live parent graph.
   - Scenario 11 (tool failure -> retry once -> escalate) passes against live parent graph.
   - Scenario 12 (max handoff limit escalation) passes against live parent graph.
   - Terminal state lock preserves `ESCALATED` across multiple customer turns.
   - Classifier failure fallback records `decisionType: 'FALLBACK'`.
4. Overall test suite passes with test count >= 414.

---

## 9. Risks and what would make you stop and ask

- If implementing retry requires changes to `schema.ts` (currently `tool_executions` schema is sufficient; if not, Tier 2 approval required).
- If changing `conversation-state.ts` is required (it is not; existing types are sufficient).
- Any ambiguity on whether business logic errors (e.g. `RETURN_ALREADY_EXISTS`) should escalate to human (they should not; they are handled politely by specialist RAG).

---

## 10. Docs to update on completion

- `docs/STATUS.md` — baseline test count, mark Phase 13 COMPLETE.
- `docs/ROADMAP.md` — tick box 13.
- `docs/DECISIONS.md` — record OD-12 and OD-13 approvals.
- `docs/OPEN-DECISIONS.md` — mark OD-12 and OD-13 resolved.
- `docs/plans/phase-13-plan.md` — update status to DONE.

---

STOP here and request approval.

