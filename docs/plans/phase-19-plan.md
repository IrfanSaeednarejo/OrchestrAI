# Phase 19 — Testing, Hardening & Portfolio Documentation — PLAN (status: APPROVED)

## 1. Goal and How It Fits the Architecture
Phase 19 is the final capstone phase of OrchestrAI. Deployment to cloud infrastructure is intentionally skipped per user instruction, but the entire system is brought to hardened production grade. This phase closes remaining runtime edge cases (recursive tool PII redaction, state reducer null-safety), hardens the Express API (payload caps, production stack sanitization, deep PostgreSQL/Redis health readiness checks), adds Next.js App Router error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx`), provides a one-command local startup script (`scripts/run-local.ps1`), and delivers a portfolio-grade root `README.md` with Mermaid architecture diagrams, state machine lifecycle explanations, and interview walkthroughs.

## 2. Dependencies Satisfied / Missing
- **Phase 1-18**: All complete and verified.
- **Current Baseline Test Count**: Server: 556 passing (65 files); Client: 93 passing (19 files). Total: 649 tests.

## 3. Scope IN / Scope OUT
### Scope IN:
1. **Core Runtime Hardening (`server/`)**:
   - `executeTool` `redact()`: recursive array and nested object PII/credential masking.
   - `user` field reducer in `conversation-state.ts`: null-safe assignment allowing explicit null updates (`update !== undefined ? update : state`).
2. **API Production Hardening (`server/`)**:
   - Payload size limits in Express (`express.json({ limit: '100kb' })`).
   - Production error sanitization (suppress stack traces and raw error messages in production).
   - Deep health / readiness check in `/health?deep=true` verifying live PostgreSQL query (`SELECT 1`) and Redis `ping()`.
3. **Frontend Resilience (`client/`)**:
   - Next.js error boundary (`client/src/app/error.tsx`).
   - Next.js not-found boundary (`client/src/app/not-found.tsx`).
   - Next.js global error boundary (`client/src/app/global-error.tsx`).
4. **Developer Experience & Local Run**:
   - `scripts/run-local.ps1`: one-command local startup script checking Docker, verifying DB/Redis connectivity, running seeds if needed, and launching both workspaces.
5. **Portfolio-Grade System Documentation**:
   - Root `README.md` featuring Mermaid architecture diagrams, LangGraph routing mechanics, stateful Patterns A/B/C, and interview talking points.
6. **Cross-Workspace Verification**:
   - Complete verification run via `scripts/verify.ps1`.

### Scope OUT:
- Cloud hosting deployment (AWS / GCP / Vercel) — skipped per user instruction.
- External production observability stacks (Datadog, Sentry, NewRelic).

## 4. Open Decisions This Phase Must Resolve
### OD-19: Production Error Sanitization & Deep Health Probes
- **Options**:
  - *Option A (Recommended)*: Enhance `/health` with a `?deep=true` query check testing real database and Redis ping, while maintaining `200 { status: 'healthy' }` for basic liveness probes. Error middleware checks `NODE_ENV === 'production'` to redact stack traces.
  - *Option B*: Separate `/health/ready` endpoint.
- **Recommendation**: Adopt Option A. Keeps endpoints clean and backward-compatible with existing Phase 16 health tests.

## 5. Ordered Steps

### Step 1: Core Runtime Hardening (Tool Redaction & State Reducer)
- **Files touched**:
  - `server/src/tools/execution.ts`: recursive array redaction in `redact()`.
  - `server/src/state/conversation-state.ts`: allow explicit `null` in `user` field reducer.
  - `server/src/tools/execution.test.ts`: test recursive array and nested object redaction.
  - `server/src/state/conversation-state.test.ts`: test explicit `null` user update.
- **Protected files affected**: `server/src/state/conversation-state.ts` (protected file rule: approved via this plan).
- **Failure cases**: Non-object/primitive outputs pass through without error.

### Step 2: API Security & Production Hardening (`server/`)
- **Files touched**:
  - `server/src/api/app.ts`: configure `express.json({ limit: '100kb' })`.
  - `server/src/api/middleware/error.middleware.ts`: sanitize 500 error outputs in production.
  - `server/src/api/controllers/health.controller.ts`: deep health probe pinging Postgres (`SELECT 1`) and Redis (`ping()`).
  - `server/src/api/health.test.ts`: add tests for deep health checks and payload limits.
- **Protected files affected**: None.

### Step 3: Frontend Resilience & Error Boundaries (`client/`)
- **Files touched**:
  - `client/src/app/error.tsx` (new: Next.js error boundary)
  - `client/src/app/not-found.tsx` (new: Next.js 404 page)
  - `client/src/app/global-error.tsx` (new: root error boundary)
  - `client/src/app/error.test.tsx` (new: tests for error boundary)
- **Protected files affected**: None.

### Step 4: Local Run Automation Script
- **Files touched**:
  - `scripts/run-local.ps1` (new: automated health check, migration/seed verification, and concurrent launcher)
- **Protected files affected**: None.

### Step 5: Portfolio-Grade System Documentation
- **Files touched**:
  - `README.md` (root: comprehensive multi-agent architecture, state flow, Patterns A/B/C, evaluator benchmarks, interview walkthrough)
  - `docs/STATUS.md` (record Phase 19 closeout and final test counts)
  - `docs/ROADMAP.md` (check off Phase 19)
  - `docs/DECISIONS.md` (record Phase 19 hardening decisions)

### Step 6: Final Verification & Phase Close-Out
- Run `powershell -ExecutionPolicy Bypass -File scripts/verify.ps1`.
- Verify server tests (baseline >= 556) and client tests (baseline >= 93).

## 6. Functional Requirements
1. Deep health check `/health?deep=true` returns 200 with `{ status: 'healthy', services: { postgres: 'connected', redis: 'connected' } }` when healthy, or 503 if either service is unreachable.
2. In production, unhandled 500 errors must never leak internal stack traces or internal query strings to clients.
3. Requests exceeding 100kb payload must be rejected with 413 Payload Too Large.
4. Tool logs must redact sensitive keys in nested arrays of objects.
5. Next.js App Router must gracefully render error boundaries and 404 views with recovery options.

## 7. Non-Functional Requirements
- **Consistency**: All code passes strict linting, typechecking, and tests.
- **Test Integrity**: Test counts must strictly increase from baseline (Server >= 556, Client >= 93).
- **Portfolio Readiness**: README must be interview-grade, clear, well-structured, with professional Mermaid diagrams.

## 8. Acceptance Criteria
1. Server tests all pass (>= 556 tests).
2. Client tests all pass (>= 93 tests).
3. `scripts/verify.ps1` runs clean across the entire repository.
4. Root `README.md` provides accurate, up-to-date documentation matching the real implementation.

## 9. Risks and Stop Conditions
- Unplanned modifications to protected files outside `conversation-state.ts`.
- Breaking backward compatibility with existing tests.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`

