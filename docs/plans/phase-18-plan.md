# Phase 18 — Frontend: Platform/Ops UI & Observability Dashboard — PLAN (status: APPROVED)

## 1. Goal and How It Fits the Architecture
Phase 18 builds the internal Platform / Ops UI and observability inspection console in `client/` paired with dev-gated read endpoints in `server/`.
In OrchestrAI, complex agent behaviors (multi-agent lateral handoffs, parent router resume decisions, tool execution retries, and verification gates) are persisted as structured event logs (`routing_history`, `agent_executions`, `tool_executions`). Phase 18 surfaces these durable traces to developers and operators through an interactive, readable console, alongside the Phase 15 30-scenario benchmark evaluation dashboard.

## 2. Dependencies Satisfied / Missing
- **Phase 15 (Evaluation Framework)**: Complete (30 canonical scenarios, 8 deterministic binary evaluators, `runBenchmark`, `eval-results.md`).
- **Phase 16 (Backend API Layer)**: Complete (`GET /api/conversations/:id/traces`, AppError hierarchy, dev-routes pattern).
- **Phase 17 (Frontend Foundation & Customer Chat)**: Complete (Next.js 14 App Router, Tailwind CSS, Lucide icons, Vitest, RTL, `scripts/verify.ps1`).
- **Current Baseline Test Count**: Server: 548 passing (64 files); Client: 66 passing (11 files). Total: 614 tests.

## 3. Scope IN / Scope OUT
### Scope IN:
1. **Server Ops Endpoints (dev/demo gated)**:
   - `GET /api/ops/conversations`: paginated list of all system conversations enriched with user details, status, latest active specialist, and turn count.
   - `GET /api/ops/conversations/:id/traces`: ops-privileged trace endpoint (bypasses per-user ownership check when dev mode is enabled).
   - `GET /api/ops/eval-results`: serves cached or executed benchmark evaluation scorecard (`BenchmarkReport` JSON + markdown summary).
2. **Client Ops UI (`client/src/app/ops/`)**:
   - Shared Ops Layout with top-level toggle between "Customer Chat" (`/`) and "Platform Ops" (`/ops`).
   - `/ops`: Conversation Explorer table with search, status filters (active, archived, escalated), and specialist filter.
   - `/ops/traces/[id]`: Interactive Trace Viewer & Handoff Inspector featuring:
     - Visual handoff breadcrumb trail (e.g. `Router ➔ Payment ➔ Refund`).
     - Chronological timeline with color-coded event nodes (Routing, Agent, Tool).
     - Collapsible tool execution cards with status, duration (ms), and error details.
   - `/ops/evals`: Evaluation Benchmark Scorecard displaying domain breakdowns, evaluator pass rates, and individual scenario results.
3. **Automated Testing & Runbook**:
   - Unit and integration tests for backend ops endpoints and client ops components.
   - Cross-workspace verification via `scripts/verify.ps1`.
   - Manual verification runbook in `docs/manual-tests/phase-18-verification.md`.

### Scope OUT:
- Real-time WebSocket trace streaming (traces update on page load/refresh or turn completion; SSE message stream is customer-facing).
- Multi-tenant enterprise RBAC / OAuth (dev/demo flag gated).
- Production cloud deployment infrastructure (deferred to Phase 19).

## 4. Open Decisions This Phase Must Resolve
### OD-18: Platform/Ops API Architecture & Access Control
- **Options**:
  - *Option A (Recommended)*: Dev-gated `/api/ops/*` endpoints mounted behind existing `requireDemoEnabled` middleware; client gated by `NEXT_PUBLIC_ENABLE_OPS_UI=true`. Allows local and portfolio inspection without database manipulation.
  - *Option B*: Simulate admin authorization headers on existing customer endpoints (`x-admin-token`).
- **Tradeoffs**: Option A cleanly separates customer-facing API contracts from operator telemetry without polluting conversation ownership semantics.
- **Recommendation**: Adopt Option A. Record in `DECISIONS.md`.

## 5. Ordered Steps

### Step 1: Server Ops Endpoints & Repository Queries
- **Files touched**:
  - `server/src/api/routes/ops.routes.ts` (new)
  - `server/src/api/controllers/ops.controller.ts` (new)
  - `server/src/persistence/repositories/orchestration.repository.ts` (add `listAllConversationsWithOpsMetadata`)
  - `server/src/api/app.ts` (mount `/api/ops` routes behind `requireDemoEnabled`)
  - `server/src/api/ops.test.ts` (new)
- **Protected files affected**: None.
- **State ownership & changes**: Read-only queries over existing tables.
- **Failure cases**: Flag disabled returns 404; conversation not found returns 404; invalid query params return 400.

### Step 2: Client Ops Types & API Client Helpers
- **Files touched**:
  - `client/src/types/ops.ts` (new: `OpsConversation`, `OpsTraceTimeline`, `BenchmarkReport`)
  - `client/src/lib/ops-client.ts` (new: `fetchOpsConversations`, `fetchOpsTrace`, `fetchOpsEvalResults`)
  - `client/src/lib/ops-client.test.ts` (new)
- **Protected files affected**: None.
- **State ownership & changes**: Client-side read helpers.

### Step 3: Shared Ops Layout & Global Top Navigation
- **Files touched**:
  - `client/src/components/navigation/top-nav.tsx` (new: header with Chat/Ops switcher and active link highlight)
  - `client/src/app/ops/layout.tsx` (new: Ops shell with sidebar/tabs)
  - `client/src/app/page.tsx` (integrate TopNav header)
  - `client/src/components/navigation/top-nav.test.tsx` (new)
- **Protected files affected**: None.

### Step 4: Conversation Explorer
- **Files touched**:
  - `client/src/app/ops/page.tsx` (Conversation Explorer page)
  - `client/src/components/ops/conversation-table.tsx` (new: searchable/filterable data table)
  - `client/src/components/ops/conversation-table.test.tsx` (new)
- **Protected files affected**: None.

### Step 5: Trace Viewer & Handoff Inspector
- **Files touched**:
  - `client/src/app/ops/traces/[id]/page.tsx` (Trace inspector page)
  - `client/src/components/ops/trace-timeline.tsx` (new: chronological event feed)
  - `client/src/components/ops/handoff-breadcrumbs.tsx` (new: multi-agent transition path)
  - `client/src/components/ops/tool-execution-card.tsx` (new: collapsible tool card)
  - `client/src/components/ops/trace-timeline.test.tsx` (new)
- **Protected files affected**: None.

### Step 6: Evaluation Benchmark Scorecard
- **Files touched**:
  - `client/src/app/ops/evals/page.tsx` (Evaluation results dashboard)
  - `client/src/components/ops/eval-scorecard.tsx` (new: domain bars, evaluator rates, scenario grid)
  - `client/src/components/ops/eval-scorecard.test.tsx` (new)
- **Protected files affected**: None.

### Step 7: Cross-Workspace Verification Script, Runbook & Docs Close-Out
- **Files touched**:
  - `scripts/verify.ps1` (verify both workspaces)
  - `docs/manual-tests/phase-18-verification.md` (new: manual test runbook)
  - `docs/STATUS.md` (record phase completion and new test baseline)
  - `docs/ROADMAP.md` (check off Phase 18)
  - `docs/DECISIONS.md` (record OD-18)

## 6. Functional Requirements
1. Operator can view all system conversations with pagination, status badge (`active`, `archived`, `escalated`), participant user, and turn count.
2. Clicking a conversation navigates to `/ops/traces/[id]` showing complete chronological execution details.
3. Trace timeline clearly distinguishes:
   - **Routing Decisions**: router pre-classification guard or classifier result, detected intent, source and target agents, and decision reasoning.
   - **Agent Executions**: duration in ms, status (`COMPLETED`, `HANDOFF`, `ESCALATED`, `FAILED`).
   - **Tool Executions**: tool name, duration, success/failure status, and error messages.
4. Handoff breadcrumbs highlight lateral transitions (Pattern B) and verification interruptions (Pattern C).
5. Evaluation dashboard presents Phase 15 benchmark statistics: overall pass rate, domain breakdown, evaluator breakdown, and scenario-level pass/fail.

## 7. Non-Functional Requirements
- **Consistency**: All Ops UI views use the same Tailwind theme and Lucide iconography as customer chat.
- **Latency**: Timeline renders without UI thread stutter for multi-turn conversations with up to 50 events.
- **Safety**: Ops endpoints are hard-off in production (`ENABLE_DEMO_ENDPOINTS=false`).
- **Testability**: Every visual ops component has component tests; server ops routes have endpoint integration tests.

## 8. Acceptance Criteria
1. `server/src/api/ops.test.ts` passes with tests for `GET /api/ops/conversations`, `GET /api/ops/conversations/:id/traces`, and `GET /api/ops/eval-results`.
2. Client tests for TopNav, ConversationTable, TraceTimeline, and EvalScorecard all pass.
3. Server test count >= 548 (current baseline); Client test count >= 66.
4. `scripts/verify.ps1` runs clean (lint, typecheck, tests in both workspaces) and exits with code 0.

## 9. Risks and Stop Conditions
- Modifying protected files (e.g. database schema or state reducers) — STOP immediately.
- Discrepancy between stored trace event models and UI rendering contracts — verify schema before implementing.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/OPEN-DECISIONS.md`

