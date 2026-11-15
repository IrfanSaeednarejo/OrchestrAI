# Phase 11 — Account Specialists — PLAN (status: DONE)

## Approvals
- 2026-11-05: Plan approved by owner (chat: "continue"). OD-4e (Profile single-node) and OD-4f (Account Access two-mode) approved.

---

## 1. Goal and how it fits the architecture

Phase 11 replaces the two remaining stub specialists — **Profile** and **Account Access** — with real, fully-tested subgraph implementations. These are the last two specialists needed before Phase 12 (Cross-Domain Integration Validation) can run all 14 scenarios against real code.

Account Access has two distinct operational modes that together satisfy Pattern C (blocked-workflow resume):
1. **Password Reset mode** — stateless acknowledgment via `initiate_password_reset`; *never* mutates `identity`.
2. **Verification-for-Resume mode** — calls `start_identity_verification` → `verify_identity`; on success calls `buildIdentityUpdate()` from `state/identity-update.ts` (the ONLY file allowed to do so) and returns control to the router's `checkResumePreconditions` guard, which routes back to `activeWorkflow.returnTo`.

Profile is simpler: single-node, FULL-gated `get_profile` / `update_profile`, no RAG.

---

## 2. Dependencies satisfied / missing

- **Satisfied**: Phases 1–10 complete (370/370 tests). Pattern C blocked-workflow builder, identity-update helper, `gatedExecuteTool`, allowlists, subgraph harness, `buildParentGraph` wiring stubs in place.
- **Missing**: None — all infrastructure is ready.
- **Branch**: `phase/11-account-specialists` created off `phase/10-payments-specialists` tip (Phase 10 not yet merged to main by owner; acceptable since working tree is clean).

---

## 3. Scope IN / scope OUT

**IN**:
- `server/src/agents/specialists/profile/profile.ts` — Profile specialist node + subgraph factory
- `server/src/agents/specialists/profile/profile.prompt.txt` — 5-section prompt
- `server/src/agents/specialists/profile/profile.test.ts` — unit tests
- `server/src/agents/specialists/account-access/account-access.ts` — Account Access specialist node + subgraph factory
- `server/src/agents/specialists/account-access/account-access.prompt.txt` — 5-section prompt
- `server/src/agents/specialists/account-access/account-access.test.ts` — unit tests
- `server/src/graphs/parent/parent-graph.ts` — wire `profileSpecialistNode` and `accountAccessSpecialistNode` (replace stub defaults)
- `server/src/graphs/parent/parent-graph-account.integration.test.ts` — Scenarios 5, 6, 7, 13, 14
- `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`, `docs/plans/phase-11-plan.md`

**OUT**:
- No schema changes, no new tables, no new npm packages
- No changes to protected files (`conversation-state.ts`, `routing/events.ts`, `services/conversation-lifecycle.service.ts`, `persistence/db/client.ts`, `persistence/checkpointer/**`)
- No changes to `permissions.ts` — the allowlists for `profile` and `account_access` are already locked and correct per REFERENCE.md
- No changes to `eslint.config.js` — the boundary exemption for `account-access/**` is already in place
- Phase 12 (all 14 live scenarios) starts after this phase

---

## 4. Open decisions this phase must resolve

### OD-4e: Profile specialist design

**Context**: Profile allowlist is `['get_profile', 'update_profile']`; both are FULL-gated. No RAG access (locked in DECISIONS.md). `update_profile` changes only `name` and `defaultAddress` (never email). The node must not block the user mid-turn if `get_profile` is FULL-blocked; it should emit a Pattern C `activeWorkflow` to route to Account Access.

**Options**:

| Option | Description | Tradeoff |
|---|---|---|
| A (recommended) | Single-node. Classify intent (view vs update). Call `get_profile` or `update_profile` via `gatedExecuteTool`. On FULL block → Pattern C update pointing `returnTo: { agent: 'account_access', workflowStep: 'get_profile' \| 'update_profile' }`, router routes to Account Access. On DENIED → FAILED. | Simple; consistent with Phase 9/10 single-node pattern. |
| B | Two-node (extract-then-act). Overkill — fields are simple and no ambiguity possible. | Unnecessary complexity. |

**Recommendation**: Option A. Profile is the simplest specialist; extraction is a 2-way enum. No ambiguity loop possible (there is always a `user.id` in state).

**Tests that prove it**: unit tests for `view_profile` intent with FULL identity → allowed path, BLOCKED path → `activeWorkflow` set with correct `returnTo`; `update_profile` path similarly; DENIED → FAILED.

---

### OD-4f: Account Access specialist design (two-mode operation)

**Context**: Account Access must (a) handle password reset without touching `identity` and (b) complete verification-for-resume by calling `buildIdentityUpdate` from `state/identity-update.ts` — the only specialist legally allowed to do so.

**Mode Detection**: Check `state.activeWorkflow?.blockedBy` — if non-null it means another specialist was blocked waiting for verification; this is *Verification-for-Resume mode*. Otherwise, classify user intent to determine *Password Reset mode* vs *standalone Verification mode*.

**Two modes in detail**:

**Mode 1 — Password Reset** (Scenario 14):
- Extract `userId` from `state.user.id` (always present if graph has a user)
- Call `gatedExecuteTool(initiatePasswordReset, initiatePasswordResetMetadata, { userId }, ...)` (NONE-gated, always ALLOWED)
- Respond with acknowledgement message
- Emit `workflowStatus: 'COMPLETED'`, **no** `identity` update
- Key invariant: `identity.status` remains unchanged before and after

**Mode 2 — Verification for Resume** (Scenarios 5, 6, 7):
- Entered when `state.activeWorkflow?.blockedBy` is `'VERIFICATION_LIGHT'` or `'VERIFICATION_FULL'`
- Step A: Call `gatedExecuteTool(startIdentityVerification, ..., { userId }, ...)` → issues code
- Respond: "A verification code has been sent. Please enter it to continue."
- Emit `workflowStatus: 'WAITING_FOR_USER_INPUT'` (wait for next turn with the code)
- Step B (next turn, code in message): Call `gatedExecuteTool(verifyIdentity, ..., { userId, code }, ...)`
- On success: emit `buildIdentityUpdate({ status: 'VERIFIED', verificationMethod: 'otp', verifiedAt: new Date().toISOString() })` merged with `activeWorkflow: null` and `workflowStatus: 'COMPLETED'`
- The router's `checkResumePreconditions` guard fires on next turn (since `activeWorkflow` was set by the original specialist and is now cleared by Account Access's `COMPLETED`), routes to `returnTo.agent`

> **Wait** — there is a subtle correctness issue here. When Account Access emits `workflowStatus: 'COMPLETED'` and `activeWorkflow: null`, it clears the resume context. The router's `checkResumePreconditions` guard fires based on `activeWorkflow?.returnTo` being set. If Account Access clears `activeWorkflow`, the guard won't fire and the original specialist won't be resumed.

**Resolution**: Account Access must NOT clear `activeWorkflow` on completing verification. Instead it should:
1. Update `identity` via `buildIdentityUpdate(...)` to `'VERIFIED'`
2. Leave `activeWorkflow` **intact** (do not emit `activeWorkflow: null`)
3. Emit `workflowStatus: 'COMPLETED'`

The router guard `checkResumePreconditions` sees `activeWorkflow.returnTo` set and `blockedBy` non-null (wait — `blockedBy` is used to distinguish Pattern B from Pattern C). Let me re-examine the guard logic:

Looking at `routing/guards.ts`: `checkResumePreconditions` fires when `activeWorkflow?.returnTo` exists. If `blockedBy` is `null`, it's a Pattern B re-route. If `blockedBy` is `'VERIFICATION_LIGHT'` or `'VERIFICATION_FULL'` (non-null), it should still trigger a resume to `returnTo.agent` AFTER verification succeeds.

**Correct Account Access behavior**:
- After verification success: emit `identity` update (VERIFIED) + set `activeWorkflow.blockedBy = null` (to signal "unblocked") while keeping `returnTo` and `resumeContext` intact. This triggers Pattern B–like re-route in the router guard. The resumed specialist reads `resumeContext` and clears `activeWorkflow: null` on completion.

**Updated Mode 2 terminal state**:
```ts
{
  ...buildIdentityUpdate({ status: 'VERIFIED', verificationMethod: 'otp', verifiedAt: now }),
  activeWorkflow: {        // overwrite: unblock but keep returnTo + resumeContext
    ...state.activeWorkflow,
    blockedBy: null,       // signals "unblocked" to the router guard
  },
  workflowStatus: 'COMPLETED',
}
```

**Options for multi-turn handling inside Account Access**:

| Option | Description | Tradeoff |
|---|---|---|
| A (recommended) | Single-node. Mode detection at top. If code not yet provided (Step A), issue code and return `WAITING_FOR_USER_INPUT`. If code present in message (Step B), verify and emit identity update. Use `state.activeWorkflow?.currentStep === 'verify_identity'` to detect Step B. | Simple, consistent with other specialists. |
| B | Two-node subgraph with explicit edges. Heavier; overkill for 2 steps. | Unnecessary complexity. |

**Recommendation**: Option A (single-node). Step detection: after issuing code in Step A, emit `activeWorkflow.currentStep = 'verify_identity'` to flag the pending code-check state. On next invocation, if `currentStep === 'verify_identity'`, extract code from user message and proceed to Step B.

**Tests that prove it**:
- Password reset: `identity.status` is unchanged; `{acknowledged: true}` in response
- Verification step A: `workflowStatus: 'WAITING_FOR_USER_INPUT'`, code sent
- Verification step B success: `identity.status === 'VERIFIED'`, `activeWorkflow.blockedBy === null`, `returnTo` preserved
- Verification step B failure (wrong code): responds with error, re-prompts, `identity` unchanged
- Scenario 13 boundary: importing `identity-update.ts` from non-account-access path is rejected by ESLint + boundary test

---

## 5. Steps

### Step 0: Plan + branch (this document). **STOP, await approval.**

**Commit**: `phase 11 step 0: plan approved`

---

### Step 1: Profile Specialist

**Files**:
- `server/src/agents/specialists/profile/profile.ts` — new
- `server/src/agents/specialists/profile/profile.prompt.txt` — new
- `server/src/agents/specialists/profile/profile.test.ts` — new

**Design**:
- Extract intent (`view_profile` | `update_profile`) + fields to update via LLM at `temperature: 0.0`
- `userId` always from `state.user.id` (no extraction needed)
- `get_profile` path: FULL-gated; on BLOCKED → Pattern C `activeWorkflow` with `returnTo: { domain: 'profile', agent: 'account_access', workflowStep: 'get_profile' }`
- `update_profile` path: FULL-gated; extract `name` and/or `defaultAddress` from message; on BLOCKED → Pattern C `activeWorkflow`
- No `search_knowledge` call (Profile has NO_KNOWLEDGE_ACCESS)
- Response generation at `temperature: 0.2`
- Subgraph factory `buildProfileSubgraph` following established pattern

**Protected files affected**: none

**State changes**: `workflowStatus`, `messages`, `activeWorkflow` (on BLOCK only)

**Failure cases**:
- No `state.user` → FAILED with message (should not happen if graph is initialized correctly)
- Tool DENIED → FAILED (allowlist violation)
- LLM extraction failure → fallback to `view_profile` intent

**After step**: `npm run lint`, `npm run typecheck`, `npm test` — commit `phase 11 step 1: profile specialist subgraph`

---

### Step 2: Account Access Specialist

**Files**:
- `server/src/agents/specialists/account-access/account-access.ts` — new
- `server/src/agents/specialists/account-access/account-access.prompt.txt` — new
- `server/src/agents/specialists/account-access/account-access.test.ts` — new

**Design** (from OD-4f above):
- **Mode detection**: `state.activeWorkflow?.blockedBy` non-null → Verification-for-Resume mode; else classify intent
- **Password Reset mode**: call `initiatePasswordReset`, respond, `COMPLETED`, **NO identity update**
- **Verification Step A**: call `startIdentityVerification`, respond with "code sent", set `activeWorkflow.currentStep = 'verify_identity'`, `WAITING_FOR_USER_INPUT`
- **Verification Step B**: detect via `state.activeWorkflow?.currentStep === 'verify_identity'`; extract 6-digit code from user message via LLM/regex; call `verifyIdentity`; on success emit `buildIdentityUpdate(...)` + `activeWorkflow: { ...state.activeWorkflow, blockedBy: null }` + `COMPLETED`; on failure re-prompt
- Import `buildIdentityUpdate` from `../../../state/identity-update.js` — the ONLY specialist allowed to do this
- `search_knowledge` with `account/account_security` scope for policy questions

**Protected files affected**: none (ESLint `account-access/**` is already exempted)

**State changes**: `identity` (ONLY here), `activeWorkflow` (unblocking), `workflowStatus`, `messages`

**Failure cases**:
- Verification code wrong → `WAITING_FOR_USER_INPUT`, re-prompt (don't set FAILED yet; allow retry)
- Max attempts exceeded (from `verifyIdentity` error code `MAX_ATTEMPTS_EXCEEDED`) → FAILED
- `startIdentityVerification` NOT_FOUND → FAILED

**After step**: `npm run lint`, `npm run typecheck`, `npm test` — commit `phase 11 step 2: account access specialist subgraph`

---

### Step 3: Wire Profile and Account Access into Parent Graph

**Files**:
- `server/src/graphs/parent/parent-graph.ts` — add `profileSpecialistNode` and `accountAccessSpecialistNode` wrapper functions; update `buildParentGraph` defaults from stubs to real nodes

**Pattern** (identical to Phase 10 wiring for payment/refund):
```ts
export const profileSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('profile', config)) return SPECIALIST_STUBS.profile(state, config);
  return profileNode(state, config);
};
export const accountAccessSpecialistNode: SpecialistNodeAction = async (state, config) => {
  if (hasStubOverride('account_access', config)) return SPECIALIST_STUBS.account_access(state, config);
  return accountAccessNode(state, config);
};
```

**Protected files affected**: none

**State changes**: none (only wiring)

**After step**: confirm existing 370 tests still pass — commit `phase 11 step 3: wire profile and account access into parent graph`

---

### Step 4: Integration Tests (Scenarios 5, 6, 7, 13, 14)

**Files**:
- `server/src/graphs/parent/parent-graph-account.integration.test.ts` — new

**Scenario coverage**:

| Scenario | Setup | Flow | Assertion |
|---|---|---|---|
| 5 | UNVERIFIED user; captured payment | Message → router → payment (FULL block → Pattern C) → router → account_access (Step A: code) → account_access (Step B: code submit) → router (guard: RE_ROUTE) → payment (resume: `get_payment` allowed now) → COMPLETED | `workflowStatus: 'COMPLETED'`, `identity.status: 'VERIFIED'`, payment response in messages |
| 6 | LIGHTLY_VERIFIED user; eligible order | Message → router → returns (FULL block on `create_return`) → router → account_access (verify) → router (guard) → returns (resume: `create_return`) → COMPLETED | Return created, `identity.status: 'VERIFIED'` |
| 7 | UNVERIFIED user; login/account issue | Message → router → account_access (password reset intent) → `{acknowledged: true}` → COMPLETED; identity unchanged | `workflowStatus: 'COMPLETED'`, `identity.status` same as input |
| 13 | Any non-account-access specialist file | Static: boundary test checks no `.ts` file outside allowed list imports `identity-update.js` | Existing `identity-update-boundary.test.ts` already covers; confirm it still passes |
| 14 | LIGHTLY_VERIFIED user; password reset | Message → router → account_access (password reset) → `initiatePasswordReset` called → COMPLETED; `identity.status` still `'LIGHTLY_VERIFIED'` | `identity.status` unchanged |

**Fixtures**: real Postgres/Redis; distinct prefix `p11-` for emails; scoped cleanup

**After step**: `npm run lint`, `npm run typecheck`, `npm test` — commit `phase 11 step 4: account specialists integration tests`

---

### Step 5: Docs & Close-out

**Files**:
- `docs/STATUS.md` — new test count baseline
- `docs/ROADMAP.md` — tick Phase 11 `[x]`
- `docs/DECISIONS.md` — record OD-4e (Profile) and OD-4f (Account Access)
- `docs/OPEN-DECISIONS.md` — mark OD-4e, OD-4f resolved; OD-1 scenario remap confirmed (P11 covers 5, 6, 7, 13, 14)
- `docs/plans/phase-11-plan.md` — mark DONE

**Commit**: `phase 11 step 5: update docs for phase 11 close-out`

---

## 6. Functional requirements

1. Profile specialist resolves `view_profile` and `update_profile` intents; FULL-blocks with correct Pattern C `activeWorkflow`.
2. Account Access password reset calls `initiatePasswordReset` only; `identity.status` is identical before and after the interaction.
3. Account Access verification flow (Mode 2): two-turn interaction (code issue → code submit); on success `identity.status` becomes `'VERIFIED'`.
4. After Account Access completes verification, the router guard (`checkResumePreconditions`) re-routes to `activeWorkflow.returnTo.agent` without LLM classifier call.
5. The resumed specialist (Payment, Returns) successfully executes its FULL-gated tool with the now-VERIFIED identity.
6. Only `src/agents/specialists/account-access/account-access.ts` imports `state/identity-update.ts` (enforced by ESLint + boundary test).
7. No specialist other than Account Access emits an `identity` state update.

---

## 7. Non-functional requirements

- **Consistency**: single-node pattern; same LLM temperatures (`0.0` for decisions, `0.2` for responses); same `gatedExecuteTool` path as all other specialists.
- **Testability**: `MemorySaver` unit tests via `buildSingleNodeHarness`; real Postgres/Redis for integration tests with scoped cleanup.
- **Security**: `code` from `startIdentityVerification` is in `sensitiveOutputFields` — redacted from tool_executions logs; raw code never logged (enforced by existing `executeTool` redaction).
- **Observability**: `recordAgentExecution` called in both specialists for `agent_executions` FK constraint on `tool_executions`.
- **Latency**: single-node means one LLM call per turn max; no nested LLM chains.

---

## 8. Acceptance criteria

```
npm run lint        # exit 0
npm run typecheck   # exit 0
npm test            # all tests pass, count ≥ 370 (expect ~390-400 with new tests)
```

Named tests that must pass:
- `profile.test.ts`: view profile (ALLOWED), view profile (BLOCKED → Pattern C), update profile name, update profile (BLOCKED), no user in state (FAILED)
- `account-access.test.ts`: password reset does not change identity, verification step A (code issued), verification step B success (VERIFIED), verification step B wrong code (re-prompt), verification step B max attempts (FAILED)
- `parent-graph-account.integration.test.ts`: Scenarios 5, 6, 7, 14
- `identity-update-boundary.test.ts`: still passes (≥2 legitimate importers, no illegal importers)

---

## 9. Risks and what would make me stop and ask

| Risk | Mitigation | Stop? |
|---|---|---|
| Account Access multi-turn state threading — `activeWorkflow.currentStep` might be cleared between turns | Test explicitly; verify state persists via MemorySaver checkpoint | Stop if LangGraph state doesn't persist `activeWorkflow` between turns correctly |
| `checkResumePreconditions` guard fires on `blockedBy: null` but requires `returnTo` non-null — after Account Access sets `blockedBy: null`, guard should fire | Verified in Phase 10 (Pattern B uses same mechanism); identical guard path | No stop needed |
| Boundary test `foundLegitimateImporters >= 2` — adding `account-access.ts` importer satisfies this | Confirmed: boundary test expects `account-access/**` to be a legitimate importer | No stop needed |
| Integration Scenario 5 is 3+ turns — may need careful mock reset between turns | Use `mockReset` pattern from Phase 10 integration tests | Stop if mock state bleeds |
| `activeWorkflow` overwrite reducer: emitting `{ ...state.activeWorkflow, blockedBy: null }` requires spreading the CURRENT state value — this is a full-object overwrite, not a partial merge | Confirmed in DECISIONS.md: `activeWorkflow` is full-object overwrite. Spread is correct pattern. | No stop needed |

---

## 10. Docs to update on completion

- `docs/STATUS.md` — new test count
- `docs/ROADMAP.md` — Phase 11 checkbox
- `docs/DECISIONS.md` — OD-4e, OD-4f entries
- `docs/OPEN-DECISIONS.md` — OD-4e, OD-4f resolved; OD-1 scenario remap confirmed
- `docs/plans/phase-11-plan.md` — mark DONE
- `docs/REFERENCE.md` — no changes needed (tool matrix already correct)

---

STOP here and request approval.

