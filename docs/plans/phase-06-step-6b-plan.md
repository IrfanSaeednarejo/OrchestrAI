# Phase 6 Step 6b — Close-Out & Type Alignment — PLAN (status: DONE)

## 1. Goal and How It Fits the Architecture
Phase 6 established authorization and access control: pure tool gates, per-specialist allowlists, identity update boundaries, Pattern C blocked-workflow updates, and scoped knowledge retrieval. Step 6b closes out Phase 6 by eliminating type duplication (`SpecialistName` vs. `SpecialistId`), removing an unnecessary type cast in test fixtures, performing a strict verification audit against `docs/DECISIONS.md` and `docs/REFERENCE.md`, and preparing the codebase for Phase 7 (Agent Foundation).

## 2. Dependencies Satisfied / Missing
- **Satisfied**:
  - Phase 1-5 signed off (persistence, conversation state, deterministic tools, knowledge ingestion & retrieval).
  - Phase 6 Steps 0-5 signed off (gate, gated-execution, blocked-workflow, identity-update, specialist-scope).
  - Phase 6 Step 6a proof-of-concept graph and integration test suite completed in commit `7e88e90` on `main` (3 scenarios passing).
- **Missing**:
  - Phase 6 Step 6a formal sign-off.
  - Step 6b execution and Phase 6 sign-off.

## 3. Scope IN / Scope OUT
- **Scope IN**:
  - (a) Unify `SpecialistName` (`server/src/knowledge/specialist-scope.ts`) onto `SpecialistId` (`server/src/tools/permissions.ts`), updating `specialist-scope.ts`, `scoped-retrieval.ts`, and `specialist-scope.test.ts`. Retain `export type SpecialistName = SpecialistId;` as a deprecated alias to avoid breaking external callers.
  - (b) Remove the unnecessary `as ToolMetadata` cast in `server/src/state/blocked-workflow.test.ts` (line 135) by using `createReturnMetadata` or a typed constant.
  - (c) Close-out verification audit of all Phase 6 deliverables against `docs/DECISIONS.md` and `docs/REFERENCE.md`.
  - (d) Documentation updates: `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/OPEN-DECISIONS.md`.
- **Scope OUT**:
  - Any changes to protected files (`server/src/state/conversation-state.ts`, `server/src/routing/events.ts`, etc.).
  - Implementing Phase 7 agent nodes, routers, or prompt loaders.
  - Altering gate evaluation semantics, tool allowlists, or verification levels.

## 4. Open Decisions This Phase Must Resolve
- None for Step 6b. OPEN-DECISIONS #3 (Agent LLM) and #1 (Scenario alignment) pertain to Phases 7, 8, and beyond. Step 6a sign-off (OPEN-DECISIONS #10) is addressed as part of this close-out.

## 5. Steps (Small, Ordered)

### Step 1: Unify Specialist Identifiers
- **Files touched**:
  - `server/src/knowledge/specialist-scope.ts`
  - `server/src/knowledge/scoped-retrieval.ts`
  - `server/src/knowledge/specialist-scope.test.ts`
- **Protected files affected**: None.
- **State ownership and changes**: None (compile-time type unification).
- **Details**: Import `SpecialistId` from `../tools/permissions.js` in `specialist-scope.ts`. Replace `SpecialistName` with `SpecialistId` across mapping definitions and signatures. Provide `export type SpecialistName = SpecialistId;` for compatibility.
- **Failure cases**: TypeScript compiler errors in retrieval consumers or scope tests.

### Step 2: Remove Type Cast in `blocked-workflow.test.ts`
- **Files touched**:
  - `server/src/state/blocked-workflow.test.ts`
- **Protected files affected**: None.
- **State ownership and changes**: None.
- **Details**: In `server/src/state/blocked-workflow.test.ts` line 135, replace `{ name: 'create_return', requiredVerification: 'FULL' } as ToolMetadata` with `createReturnMetadata` (imported from `../tools/mutations/return.tools.js`) or a strictly typed `const tool: ToolMetadata = ...`.
- **Failure cases**: Typecheck or lint errors.

### Step 3: Phase 6 Audit & Documentation Close-Out
- **Files touched**:
  - `docs/STATUS.md`
  - `docs/ROADMAP.md`
  - `docs/OPEN-DECISIONS.md`
- **Protected files affected**: None.
- **State ownership and changes**: None.
- **Details**: Run full validation (`npm run lint`, `npm run typecheck`, `npm test`). Verify that test count remains >= 239. Update `docs/STATUS.md` to mark Phase 6 closed, check Phase 6 in `docs/ROADMAP.md`, and resolve item 10 in `docs/OPEN-DECISIONS.md`.

## 6. Functional Requirements
- Unification must preserve the exact 6 specialists: `'order_tracking' | 'returns' | 'payment' | 'refund' | 'profile' | 'account_access'`.
- All scoped retrieval queries and gate checks must continue to behave identically.
- No `as ToolMetadata` casts remain in `blocked-workflow.test.ts`.

## 7. Non-Functional Requirements
- **Zero Type Weakening**: No `any`, no `as`, no `@ts-ignore` added.
- **Documentation Integrity**: All paths relative to `server/` per `AGENTS.md`.
- **Test Integrity**: Test count must stay >= 239.

## 8. Acceptance Criteria
- Commands executed from `server/` must pass cleanly:
  - `npm run typecheck` (0 errors)
  - `npm run lint` (0 errors, 0 warnings)
  - `npm test` (all 35 files, >= 239 tests passing)
- Specifically, the following test suites must pass:
  - `src/knowledge/specialist-scope.test.ts` (7 tests)
  - `src/knowledge/scoped-retrieval.test.ts` (11 tests)
  - `src/state/blocked-workflow.test.ts` (13 tests)
  - `src/graphs/poc/phase6-gate-graph.integration.test.ts` (3 tests)
- `git diff` shows no edits to protected files.

## 9. Risks and What Would Make You Stop and Ask
- Any circular dependency between `server/src/tools/permissions.ts` and `server/src/knowledge/specialist-scope.ts`.
- Any requirement to modify `server/src/state/conversation-state.ts` or other protected files.
- Test failure or test count regression below 239.

## 10. Docs to Update on Completion
- `docs/STATUS.md`: Record Step 6b completion, Phase 6 closed, record final test count.
- `docs/ROADMAP.md`: Check `[x] 6 Access Control / Verification Gate`.
- `docs/OPEN-DECISIONS.md`: Resolve item 10.

