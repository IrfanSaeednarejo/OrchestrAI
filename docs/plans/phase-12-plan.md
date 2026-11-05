# Phase 12 — Cross-Domain Integration Validation — PLAN (status: DONE)

## Approvals
- 2026-11-06: Approved by owner in chat ("Approved Continue"). OD-1 resolution (Pattern A definition and 14-scenario matrix) approved.

---

## 1. Goal and how it fits the architecture

Validate all 14 evaluation scenarios from `docs/REFERENCE.md` live end-to-end against the master parent graph (`buildParentGraph(checkpointer)`) containing all 6 concrete domain specialist subgraphs (`order_tracking`, `returns`, `payment`, `refund`, `profile`, `account_access`), backed by real PostgreSQL, pgvector, Redis verification service, and the official `PostgresSaver` checkpointer.

This phase is the pivotal quality milestone proving that the entire multi-agent orchestration architecture — stateful routing, intent taxonomy classification, deterministic guards (handoff cap, loop detection, resume preconditions), Pattern A (direct resolution), Pattern B (lateral re-route via parent), and Pattern C (verification-for-resume) — functions correctly across cross-domain customer support journeys with zero reliance on specialist stubs.

---

## 2. Dependencies satisfied / missing

**Satisfied:**
- Phase 1–11 complete and signed off: 400/400 tests passing across 52 files.
- All 6 concrete specialist subgraphs implemented, tested, and wired as defaults into `buildParentGraph`.
- Real PostgreSQL, pgvector, and Redis running and operational in Docker/WSL2.
- Master parent graph, router guards, event logging, and PostgresSaver checkpointing operational.

**Missing:**
- None.

**Branch**: `phase/12-cross-domain-validation` created off `phase/11-account-specialists` tip.

---

## 3. Scope IN / scope OUT

**IN**:
- `server/src/graphs/parent/parent-graph-cross-domain.integration.test.ts` — Comprehensive cross-domain integration test suite covering:
  - **Scenario 1**: Simple order status, single order, LIGHT (Order Tracking direct resolution).
  - **Scenario 2**: Ambiguous order reference -> WAITING_FOR_USER_INPUT -> resolved with user clarification (Order Tracking multi-turn).
  - **Scenario 3**: Duplicate charge confirmed -> Payment -> Refund (Pattern B lateral re-route).
  - **Scenario 4**: Refund inquiry with no linked return -> Refund -> Returns (Pattern B lateral re-route).
  - **Scenario 5**: Payment inquiry while unverified -> Account Access FULL -> resume Payment (Pattern C full cycle).
  - **Scenario 6**: Return creation with only LIGHT -> Account Access FULL -> resume Returns (Pattern C full cycle).
  - **Scenario 7**: Login / verification issue mid-Returns flow -> Account Access -> resume Returns.
  - **Scenario 8**: Return approved, refund not yet created -> structured check -> create_refund (Refund direct resolution, not RAG).
  - **Scenario 9**: Ineligible return -> RAG policy explanation -> hard decline (Returns direct resolution).
  - **Scenario 10**: Routing loop A -> Parent -> B -> Parent -> A -> fallback/escalate (Loop detection guard escalation).
  - **Scenario 11**: Tool failure (e.g. repository/database error) -> error handling -> escalation/failure.
  - **Scenario 12**: Max handoff count exceeded -> escalate (Handoff cap guard).
  - **Scenario 13**: Identity mutation attempted by non-Account-Access agent -> rejected/impossible by design.
  - **Scenario 14**: Password reset does NOT change identity.status -> separate re-verification required.
- Any bug fixes or guard refinements identified during full cross-domain scenario validation.
- Updates to `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`, and `docs/plans/phase-12-plan.md`.

**OUT**:
- Phase 13 (Failure Handling & Loop Prevention hardening — systematic retry policies and general fallback recovery) is the next phase.
- Phase 14 (LangSmith Observability & Tracing).
- Phase 15 (Eval Framework expansion to 30–50 scenarios).
- No schema changes, no new tables, no new external dependencies.

---

## 4. Open decisions this phase must resolve

### OD-1 (Resolution): Formalization of Pattern A and Scenario Mapping Confirmation

**Context**: In `docs/OPEN-DECISIONS.md` item 1, Pattern A was previously noted as unapproved, and roadmap scenario numbers had a proposed remap:
- Pattern A inference: router selects specialist, specialist resolves directly without lateral handoff or verification block.
- Confirmed scenario mapping across phases:
  - Scenarios 1, 2, 8, 9, 14: Pattern A (Direct resolution without handoff)
  - Scenarios 3, 4: Pattern B (Lateral handoff to parent router -> parent router re-routes to secondary specialist)
  - Scenarios 5, 6, 7: Pattern C (Specialist blocked by verification -> routed to Account Access -> resumes original specialist)
  - Scenarios 10, 11, 12: Safety & Escalation guards (Loop detection, tool failure, handoff limit cap)
  - Scenario 13: Architectural security invariant (Identity mutation boundary)

**Options**:
- **Option A (Recommended)**: Adopt the formal definition of Pattern A (Direct resolution) and lock the full 14-scenario matrix as the acceptance criteria for Phase 12. Move OD-1 to RESOLVED in `docs/DECISIONS.md`.
- **Option B**: Redefine Pattern A to require an explicit stub fallback. (Rejected: All 6 real domain specialists are now concrete; stub fallback is only a test utility).

**Recommendation**: Adopt Option A.

---

## 5. Execution Steps

### Step 0: Plan + branch (this document). **STOP, await approval.**
- Create branch `phase/12-cross-domain-validation`.
- Document plan and open decisions.
- Commit: `phase 12 step 0: plan approved`.

---

### Step 1: Scenarios 1, 2, 8, 9 (Pattern A — Direct Resolution Suite)
- Test Scenarios 1, 2, 8, 9 against real parent graph with real specialists:
  - **Scenario 1**: Order tracking single order shipping query (LIGHT).
  - **Scenario 2**: Ambiguous order reference -> Order tracking prompts for order ID -> Customer provides order ID in Turn 2 -> Resolved.
  - **Scenario 8**: Approved return lookup -> structured `create_refund` execution.
  - **Scenario 9**: Return requested 45 days after delivery -> 30-day policy retrieval -> hard polite decline.
- Verify state persistence, checkpoint round-trips, and routing history.
- Run `npm run lint`, `npm run typecheck`, `npm test`.
- Commit: `phase 12 step 1: pattern a direct resolution scenarios`.

---

### Step 2: Scenarios 3, 4 (Pattern B — Lateral Re-route Suite)
- Test Scenarios 3, 4 against real parent graph:
  - **Scenario 3**: Duplicate charges confirmed -> Payment specialist detects duplicate -> parent router re-routes to Refund specialist -> refund created.
  - **Scenario 4**: Refund inquiry without linked return -> Refund specialist inspects returns (none found) -> parent router re-routes to Returns specialist -> return guidance provided.
- Verify `RE_ROUTE` routing events in durable `routing_history`.
- Run `npm run lint`, `npm run typecheck`, `npm test`.
- Commit: `phase 12 step 2: pattern b lateral handoff scenarios`.

---

### Step 3: Scenarios 5, 6, 7 (Pattern C — Verification-for-Resume Suite)
- Test Scenarios 5, 6, 7 against real parent graph and real Redis OTP verification:
  - **Scenario 5**: Unverified customer payment inquiry -> Payment blocks -> Account Access issues Redis OTP -> Customer submits OTP -> Router resumes Payment -> Payment retrieved.
  - **Scenario 6**: Lightly verified return creation -> Returns blocks on FULL requirement -> Account Access verifies OTP -> Router resumes Returns -> Return authorized in DB.
  - **Scenario 7**: Customer encountering verification barrier mid-returns flow -> Account Access verifies OTP -> Resumes Returns.
- Verify durable checkpointing across 3 turns per scenario.
- Run `npm run lint`, `npm run typecheck`, `npm test`.
- Commit: `phase 12 step 3: pattern c verification resume scenarios`.

---

### Step 4: Scenarios 10, 11, 12, 13, 14 (Safety, Failure, Escalation, Security Invariants)
- Test safety guards and boundary invariants:
  - **Scenario 10**: Routing loop A -> Parent -> B -> Parent -> A triggers loop detection guard -> `workflowStatus: 'ESCALATED'`.
  - **Scenario 11**: Specialist tool failure (e.g. simulated DB/tool failure) -> produces `workflowStatus: 'FAILED'` or escalation message without throwing uncaught exceptions.
  - **Scenario 12**: Lateral handoffs reach `DEFAULT_MAX_HANDOFFS` (3) -> router guard halts further routing and escalates (`workflowStatus: 'ESCALATED'`).
  - **Scenario 13**: Identity mutation boundary assertion (only Account Access imports `identity-update.ts`).
  - **Scenario 14**: Password reset executes `initiatePasswordReset` and strictly preserves `identity.status` unchanged.
- Run `npm run lint`, `npm run typecheck`, `npm test`.
- Commit: `phase 12 step 4: safety guards and invariants scenarios`.

---

### Step 5: Docs Close-out
- Consolidate all 14 scenarios into `server/src/graphs/parent/parent-graph-cross-domain.integration.test.ts`.
- Update `docs/STATUS.md` with new test count baseline.
- Update `docs/ROADMAP.md` (tick Phase 12 `[x]`).
- Update `docs/DECISIONS.md` (record OD-1 resolution).
- Update `docs/OPEN-DECISIONS.md` (mark OD-1 resolved).
- Update `docs/plans/phase-12-plan.md` (mark DONE).
- Commit: `phase 12 step 5: update docs for phase 12 close-out`.

---

## 6. Functional requirements

1. All 14 scenarios execute successfully against the live parent graph with real concrete specialist subgraphs.
2. Zero specialist stubs are used in the cross-domain validation suite (`parentGraph = buildParentGraph(checkpointer)`).
3. Pattern A workflows complete directly with `workflowStatus: 'COMPLETED'`.
4. Pattern B lateral re-routes emit `Command({ goto: 'router' })`, write a `RE_ROUTE` routing event, and dispatch to the target specialist.
5. Pattern C workflows emit `blockedBy: 'VERIFICATION_FULL'`, route to Account Access, complete OTP verification, and resume the originating specialist via `checkResumePreconditions`.
6. Safety guards deterministically detect loops (Scenario 10) and handoff limits (Scenario 12), escalating to human agent with `workflowStatus: 'ESCALATED'`.
7. Tool failures do not throw raw exceptions; nodes fail gracefully with `workflowStatus: 'FAILED'` (Scenario 11).
8. Password reset never mutates `identity.status` (Scenario 14).
9. Non-Account-Access agents cannot mutate `identity` (Scenario 13).

---

## 7. Non-functional requirements

- **Determinism**: Zero flaky tests; real DB fixtures use isolated IDs and scoped cleanup.
- **Hermetic tests**: Mock `@google/genai` ensures zero real API calls and zero external spend.
- **Traceability**: All routing decisions are verified in the `routing_history` table.
- **Performance**: Full 14-scenario integration suite completes in < 60 seconds against local Postgres/Redis.

---

## 8. Acceptance criteria

```
npm run lint        # exit 0
npm run typecheck   # exit 0
npm test            # all tests pass, count >= 400 (all 14 scenarios green)
```

---

## 9. Risks and mitigation

| Risk | Mitigation | Action |
|---|---|---|
| Multiple multi-turn conversations sharing DB fixtures | Generate fresh UUIDs and timestamped email prefixes per test run | Clean fixtures in `afterAll` |
| Mock state leakage across tests | Call `mockGenerateContent.mockReset()` and `mockEmbedContent.mockReset()` in `beforeEach` | Standardized in earlier phases |
| Redis verification key collisions | Use unique `userId` per test and delete keys in `afterAll` | Scoped cleanup implemented |

---

## 10. Docs to update on completion

- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/OPEN-DECISIONS.md`
- `docs/plans/phase-12-plan.md`

---

Phase 12 complete and verified across all 14 scenarios (414 tests passing).

