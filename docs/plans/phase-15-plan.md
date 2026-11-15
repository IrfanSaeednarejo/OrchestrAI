# Phase 15 — Evaluation Framework — PLAN (status: DONE)

## Approvals
- 2026-11-06: Approved by owner in chat ("approved continue."). OD-15 approved.
- 2026-11-06: Steps 0-5 executed and completed with all 475 tests passing. Phase 15 signed off.

---

## 1. Goal and how it fits the architecture

Build a portfolio-grade, rigorous Evaluation Framework for OrchestrAI that scales benchmark validation from the initial 14 integration scenarios to a comprehensive 30-scenario test suite.

The framework implements the 8 canonical binary evaluators (`ROUTING_CORRECT`, `HANDOFF_CORRECT`, `SPECIALIST_SCOPE_CORRECT`, `TOOL_SELECTION_CORRECT`, `STATE_PRESERVED`, `KNOWLEDGE_GROUNDED`, `WORKFLOW_COMPLETED`, `RESOLUTION_CORRECT`), supports multi-turn conversational thread evaluation, assesses trajectory state and tool executions deterministically, and provides dual-mode execution (Vitest CI regression suite + standalone CLI evaluation runner with scorecard generation). It also validates and locks the calibrated `MIN_SIMILARITY` threshold.

---

## 2. Dependencies satisfied / missing

- **Dependencies satisfied**:
  - Phase 12 (Cross-Domain Integration Validation): All 14 reference scenarios verified live across all 6 real domain specialists.
  - Phase 13 (Failure Handling & Loop Prevention): Resilient error handling, tool retries, loop prevention, and terminal `ESCALATED` state lock.
  - Phase 14 (Observability & Tracing): RunnableConfig tracing metadata, tags, and callback integration available to inspect evaluation trajectories.
- **Dependencies missing**: None.

---

## 3. Scope IN / scope OUT

- **Scope IN**:
  - `server/src/evaluation/dataset/types.ts`: Zod schema and TypeScript interfaces for evaluation scenarios (single-turn and multi-turn).
  - `server/src/evaluation/dataset/scenarios.ts`: 30 structured evaluation scenarios expanding REFERENCE.md 1-14 with 16 new edge, boundary, multi-turn, security, and failure scenarios.
  - `server/src/evaluation/evaluators/types.ts`: Type contracts for evaluation inputs, evaluator results, and benchmark metrics.
  - `server/src/evaluation/evaluators/binary-evaluators.ts`: Implementations of all 8 binary evaluators.
  - `server/src/evaluation/runner/eval-runner.ts`: Multi-turn conversational evaluation execution engine with trajectory evaluation.
  - `server/src/evaluation/cli/run-eval.ts`: Standalone CLI script generating markdown scorecard reports.
  - `server/src/evaluation/evaluation.test.ts`: Automated Vitest test suite executing the evaluation suite with zero external network dependencies.
  - Recalibrate `MIN_SIMILARITY`: Confirm 0.60 threshold efficacy across knowledge search queries and lock decision in OD-15.
  - Add `npm run eval` script to `package.json`.
- **Scope OUT**:
  - No web-based UI dashboards (deferred to Phase 18 Platform/Ops UI).
  - No external paid LLM judge API calls in automated Vitest tests (mocked or deterministic programmatic evaluation).
  - No database migration or new tables (scenarios and benchmarks remain version-controlled in source code).

---

## 4. Open decisions this phase must resolve

### OD-15: Evaluation Framework Architecture & Scenario Expansion
- **Context**: Phase 15 requires expanding from 14 to 30-50 scenarios, implementing 8 binary evaluators, multi-turn thread evaluation, dual-mode runner execution, and confirming `MIN_SIMILARITY`.
- **Option A (Recommended)**:
  - Strongly typed code-first dataset in `server/src/evaluation/dataset/scenarios.ts` (30 structured scenarios).
  - Deterministic programmatic evaluators for state, routing, tools, scope, and groundedness, with optional LLM-judge for text resolution.
  - Dual-mode runner: executed via Vitest for zero-regression CI and runnable as standalone CLI script (`npm run eval`).
  - Maintain `MIN_SIMILARITY = 0.60` (validated against embedding cosine distance distributions).
- **Option B**: Pure LLM-as-a-judge for all evaluators (higher latency, API cost, non-deterministic CI).
- **Option C**: Database-backed scenarios table in PostgreSQL (requires schema migrations and seed scripts).
- **Recommendation**: Adopt Option A.

---

## 5. Steps (small, ordered)

### Step 0: Plan Approval & OD-15 Registration
- Commit phase plan (`docs/plans/phase-15-plan.md`) and register OD-15 proposal in `docs/OPEN-DECISIONS.md`.
- Wait for owner approval before writing production code.

### Step 1: Scenario Dataset Schema & Definitions
- Create `server/src/evaluation/dataset/types.ts` with Zod schemas for `EvaluationScenario`, `ExpectedTrajectory`, `ScenarioTurn`, and `EvaluatorExpectations`.
- Create `server/src/evaluation/dataset/scenarios.ts` with 30 comprehensive evaluation scenarios (14 reference scenarios + 16 new scenarios covering ambiguous order lookups, invalid OTP lockouts, unauthorized profile mutations, duplicate charge lateral handoffs, expired returns, shipping exceptions, and loop escalations).
- Protected files affected: None.
- Verification: `npm run lint`, `npm run typecheck`.

### Step 2: The 8 Binary Evaluators
- Create `server/src/evaluation/evaluators/types.ts`.
- Create `server/src/evaluation/evaluators/binary-evaluators.ts` implementing:
  1. `evalRoutingCorrect`
  2. `evalHandoffCorrect`
  3. `evalSpecialistScopeCorrect`
  4. `evalToolSelectionCorrect`
  5. `evalStatePreserved`
  6. `evalKnowledgeGrounded`
  7. `evalWorkflowCompleted`
  8. `evalResolutionCorrect`
- Create `server/src/evaluation/evaluators/binary-evaluators.test.ts` verifying all 8 evaluators against positive and negative test cases.
- Protected files affected: None.
- Verification: `npm run lint`, `npm run typecheck`, `npm test -- src/evaluation/evaluators/`.

### Step 3: Multi-Turn Evaluation Runner
- Create `server/src/evaluation/runner/eval-runner.ts`: runs single-turn or multi-turn conversational scenarios against the parent graph and checkpointer, feeds actual outputs into the 8 evaluators, calculates aggregate pass rates, and returns structured `BenchmarkReport`.
- Create `server/src/evaluation/runner/eval-runner.test.ts` verifying scenario execution and score aggregation.
- Protected files affected: None.
- Verification: `npm run lint`, `npm run typecheck`, `npm test -- src/evaluation/runner/`.

### Step 4: Standalone CLI Script & Integration Test Suite
- Create `server/src/evaluation/cli/run-eval.ts` generating terminal tables and markdown scorecard output.
- Add `"eval": "tsx src/evaluation/cli/run-eval.ts"` to `server/package.json`.
- Create `server/src/evaluation/evaluation.test.ts` running the 30-scenario benchmark suite against real Postgres, Redis, and checkpointer (mocking Gemini with zero external network calls).
- Protected files affected: None.
- Verification: `npm run lint`, `npm run typecheck`, `npm test` (baseline >= 444 tests).

### Step 5: Docs Close-Out & Sign-Off
- Update `docs/STATUS.md`, `docs/ROADMAP.md` (tick box 15), `docs/DECISIONS.md` (record OD-15 approval), `docs/OPEN-DECISIONS.md` (resolve OD-15), and `docs/plans/phase-15-plan.md` (set status to DONE).
- Verification: Full suite verification `npm run lint && npm run typecheck && npm test`.

---

## 6. Functional requirements

1. Scenario dataset defines 30 distinct scenarios spanning all 6 domain specialists with expected routing decisions, tools, workflow statuses, and response criteria.
2. All 8 binary evaluators return typed `{ evaluator: string, passed: boolean, score: 0 | 1, reasoning: string }`.
3. Evaluation runner evaluates full multi-turn conversations turn-by-turn with preserved checkpointer thread state.
4. CLI runner outputs benchmark metrics: Pass rate per evaluator, pass rate per domain, overall scenario success rate.
5. Automated test suite runs completely offline with zero real Gemini or LangSmith API calls.

---

## 7. Non-functional requirements

- **Determinism**: Programmatic evaluator evaluations are 100% reproducible across test runs.
- **Performance**: Benchmark evaluation of all 30 scenarios runs in under 30 seconds against the local test database.
- **Safety**: No PII, passwords, or raw verification codes appear in evaluation output reports.

---

## 8. Acceptance criteria

1. Unit tests in `binary-evaluators.test.ts` verify all 8 evaluators pass on valid trajectories and fail with explanatory reasoning on invalid trajectories.
2. Unit tests in `eval-runner.test.ts` verify multi-turn execution and score aggregation.
3. Integration suite in `evaluation.test.ts` runs 30 scenarios against the parent graph with 100% pass rate.
4. Total test suite count increases from baseline 444 to >= 465+ passing tests.
5. `npm run lint`, `npm run typecheck`, and `npm test` pass with 0 errors.

---

## 9. Risks and what would make you stop and ask

- Any requirement to call real external LLMs in the automated test suite (Tier 2 approval required).
- Touching protected files (`schema.ts`, `state/conversation-state.ts`, `services/conversation-lifecycle.service.ts`).

---

## 10. Docs to update on completion

- `docs/STATUS.md` — update baseline test count; mark Phase 15 COMPLETE.
- `docs/ROADMAP.md` — tick box 15.
- `docs/DECISIONS.md` — record OD-15 approval.
- `docs/OPEN-DECISIONS.md` — mark OD-15 resolved.
- `docs/plans/phase-15-plan.md` — update status to DONE.

---

STOP here and request approval.

