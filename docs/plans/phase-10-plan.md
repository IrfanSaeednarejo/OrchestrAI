# Phase 10 — Payments Specialists (Payment, Refund; Pattern B Re-route) — PLAN (status: APPROVED)

## Approvals
- [x] Owner approval on 2026-11-05 ("Approved COntinue")

---

## 1. Goal and how it fits the architecture

Implement the concrete **Payment** and **Refund** specialist subgraphs in `server/src/agents/specialists/` and wire them into the parent graph, replacing their Phase 8 stubs. This phase introduces the platform's first production **Pattern B lateral handoff and parent re-route** (duplicate charge confirmed by Payment specialist → hands back to parent router → parent router re-routes to Refund specialist to issue a refund).

After this phase, the platform handles REFERENCE.md **Scenarios 3, 4, and 8** end-to-end with real specialist subgraphs:
- **Scenario 3**: Duplicate charge confirmed → Payment → Refund (Pattern B lateral re-route).
- **Scenario 4**: Refund inquiry with no linked return → Refund → Returns (Pattern B lateral re-route).
- **Scenario 8**: Return approved, refund not yet created → structured check → create_refund (not RAG).

---

## 2. Dependencies satisfied / missing

**Satisfied (all verified green):**
- Phase 3: ConversationState, PostgresSaver, lifecycle service ✅
- Phase 4: All 16 tools with Zod schemas, `executeTool`, `gatedExecuteTool`, `detectDuplicateCharge`, `createRefund`, `getPayment`, `getRefundStatus` ✅
- Phase 5: Domain/topic-scoped RAG (`payments/payments`, `payments/refunds`), `retrieveKnowledge` ✅
- Phase 6: Access gate allowlists, `satisfiesVerification`, Pattern C builder ✅
- Phase 7: LLM client wrapper, 5-section prompt template loader, `HandoffRequest` contract and validation, `buildSubgraphHarness` ✅
- Phase 8: Parent graph with stateful `routerNode`, `Command({ goto })` dispatch, safety guards (handoff cap, loop detection, resume preconditions) ✅
- Phase 9: Order Tracking and Returns specialist subgraphs and parent graph integration ✅
- Baseline test count: **350/350 passing (46 test files)** ✅

**Missing / not yet built:**
- No blocking dependencies. Real Postgres, pgvector, and Redis are running via Docker in WSL2.

---

## 3. Scope IN / Scope OUT

### In scope
- `server/src/agents/specialists/payment/`:
  - `payment.ts` — single-node subgraph architecture with phased workflow (argument extraction, `get_payment`, `detect_duplicate_charge`, Pattern B handoff, RAG policy explanation).
  - `payment.prompt.txt` — 5 standard prompt sections (`Identity`, `Objective`, `Scope`, `Phased-Workflow`, `Guidelines`).
  - `payment.test.ts` — unit test suite using `buildSubgraphHarness` with MemorySaver, mocked LLM and tools.
- `server/src/agents/specialists/refund/`:
  - `refund.ts` — single-node subgraph architecture with phased workflow (handoff ingestion from `resumeContext`, `get_return_by_order`, `get_refund_status`, `create_refund`, Pattern B handoff on unlinked returns, RAG policy explanation).
  - `refund.prompt.txt` — 5 standard prompt sections.
  - `refund.test.ts` — unit test suite using `buildSubgraphHarness`.
- `server/src/graphs/parent/parent-graph.ts`:
  - Wire real `paymentSpecialistNode` and `refundSpecialistNode` into `buildParentGraph`, retaining stub fallback overrides via `ParentGraphOptions.specialists` and `configurable.stubBehaviors`.
- Integration test suite:
  - `server/src/graphs/parent/parent-graph-payments.integration.test.ts` — covers Scenarios 3, 4, and 8 against real Postgres/Redis with mocked LLM.
- Documentation updates:
  - Update `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, and `docs/OPEN-DECISIONS.md`.

### Out of scope
- Profile and Account Access specialists (deferred to Phase 11).
- Database migrations or table schema changes (all tables and repositories exist).
- Live Gemini API calls in automated tests (mocked `@google/genai` per DECISIONS.md).

---

## 4. Open decisions this phase must resolve

### OD-4c: Payment specialist design — scope, phased workflow, handoff triggers
- **Specialist ID:** `payment`
- **Allowed Tools:** `get_order`, `get_payment`, `detect_duplicate_charge`, `search_knowledge`
- **Verification Levels:** `get_order` (LIGHT), `get_payment` (FULL), `detect_duplicate_charge` (FULL), `search_knowledge` (NONE)
- **RAG Scope:** `domains: ['payments']`, `topics: ['payments']`
- **Scope IN:**
  - Order payment lookup and status inquiries.
  - Duplicate charge detection via `detect_duplicate_charge`.
  - Pattern B handoff initiation when duplicate charge is confirmed (`potentialDuplicate: true`).
  - Pattern C workflow blocking when identity status lacks FULL verification.
- **Scope OUT:**
  - Issuing refunds (handled exclusively by Refund specialist).
  - Order modifications, returns, profile changes.
- **Phased Workflow:**
  1. **Phase A (Entry & Arg Extraction):** Extract `orderId` or `paymentId` from message / context using LLM (`temperature: 0.0`). If missing/ambiguous, emit `WAITING_FOR_USER_INPUT` asking the customer for their order ID.
  2. **Phase B (Tool Execution & Verification):** Call `get_payment({ orderId })` via `gatedExecuteTool`. If gate returns `BLOCKED` (identity not FULL), emit Pattern C `activeWorkflow` update with `workflowStatus: 'WAITING_FOR_USER_INPUT'`.
  3. **Phase C (Duplicate Detection & Pattern B Branch):** If customer inquiry involves duplicate charges:
     - Call `detect_duplicate_charge({ paymentId: payment.id })`.
     - If `potentialDuplicate: true`: emit Pattern B handoff:
       ```ts
       new Command({
         goto: 'router',
         update: {
           currentIntent: 'REFUND_ACTION_REQUIRED',
           currentDomain: 'refund',
           activeWorkflow: {
             workflowId: `handoff-dup-${payment.id}`,
             originatingIntent: 'DUPLICATE_CHARGE',
             currentStep: 'REFUND_ACTION_REQUIRED',
             blockedBy: null, // Not blocked by verification!
             returnTo: { domain: 'refund', agent: 'refund', workflowStep: 'create_refund' },
             resumeContext: {
               orderId: payment.orderId,
               paymentId: payment.id,
               duplicatePaymentId: result.data.duplicatePaymentId,
               amount: payment.amount,
               returnId: null,
             },
           },
           routing: {
             previousAgent: 'payment',
             handoffCount: 1, // Delta
           },
         },
       })
       ```
     - If `potentialDuplicate: false`: retrieve knowledge (`payments/payments`), generate reassuring customer response at `temperature: 0.2`, set `workflowStatus: 'COMPLETED'`.
  4. **Phase D (Standard Inquiry):** For non-duplicate payment inquiries, retrieve knowledge and generate customer-facing explanation of payment status, set `workflowStatus: 'COMPLETED'`.

---

### OD-4d: Refund specialist design — scope, phased workflow, handoff triggers
- **Specialist ID:** `refund`
- **Allowed Tools:** `get_order`, `get_return_status`, `get_return_by_order`, `create_refund`, `get_refund_status`, `search_knowledge`
- **Verification Levels:** `get_order` (LIGHT), `get_return_status` (LIGHT), `get_return_by_order` (LIGHT), `create_refund` (FULL), `get_refund_status` (FULL), `search_knowledge` (NONE)
- **RAG Scope:** `domains: ['payments']`, `topics: ['refunds']`
- **Scope IN:**
  - Checking refund status (`get_refund_status`).
  - Executing refund creation (`create_refund`) for confirmed duplicate charges (via handoff `resumeContext` with `returnId: null`).
  - Checking linked returns for refund requests (`get_return_by_order`).
  - Pattern B handoff initiation when refund is requested without a linked return (Scenario 4 → hands off to `returns`).
  - Structured check and refund creation for approved returns without refunds (Scenario 8).
  - Clearing `activeWorkflow: overwrite(null)` upon completion.
- **Scope OUT:**
  - Authorizing or assessing returns (handled exclusively by Returns specialist).
  - Investigating payment gateway details directly (handled by Payment specialist).
- **Phased Workflow:**
  1. **Phase A (Entry & Context Ingestion):**
     - Check if arriving via lateral handoff in `state.activeWorkflow?.resumeContext`.
     - If `resumeContext` contains `{ paymentId, amount, returnId: null }` (Scenario 3 Duplicate Charge path): proceed directly to Phase C (Refund Creation).
     - Otherwise, extract `orderId` or `refundId` from customer message using LLM (`temperature: 0.0`). If missing/ambiguous, emit `WAITING_FOR_USER_INPUT`.
  2. **Phase B (Linked Return Evaluation — Scenario 4 & 8):**
     - Call `get_return_by_order({ orderId })`.
     - **Branch B1 (Scenario 4 — No Linked Return):** If no returns exist for the order, a merchandise refund cannot proceed without a return. Emit Pattern B handoff to `returns` specialist:
       ```ts
       new Command({
         goto: 'router',
         update: {
           currentIntent: 'RETURN_REQUEST',
           currentDomain: 'returns',
           activeWorkflow: {
             workflowId: `handoff-ret-req-${orderId}`,
             originatingIntent: 'REFUND_REQUEST',
             currentStep: 'RETURN_REQUIRED',
             blockedBy: null,
             returnTo: { domain: 'returns', agent: 'returns', workflowStep: 'check_return_eligibility' },
             resumeContext: { orderId },
           },
           routing: {
             previousAgent: 'refund',
             handoffCount: 1,
           },
         },
       })
       ```
     - **Branch B2 (Scenario 8 — Return Approved, No Refund Created):** If return exists with `status === 'approved'`:
       - Verify whether refund already exists for the return.
       - If no refund exists: proceed to Phase C to execute `create_refund`.
     - **Branch B3 (Return not approved):** If return exists but is `rejected`, `requested`, or `in_transit`: retrieve RAG policy knowledge (`payments/refunds`) and explain refund timeline and prerequisites to customer, set `workflowStatus: 'COMPLETED'`.
  3. **Phase C (Refund Creation):**
     - Call `create_refund({ paymentId, returnId, amount })` via `gatedExecuteTool`.
     - If gate returns `BLOCKED` (identity not FULL), emit Pattern C `activeWorkflow` update with `workflowStatus: 'WAITING_FOR_USER_INPUT'`.
     - On successful creation, generate customer-facing confirmation at `temperature: 0.2`, clear `activeWorkflow: overwrite(null)`, set `workflowStatus: 'COMPLETED'`.

---

### OD-8: Refund specialist payment identification (Scenario 8)

**Background:**
In REFERENCE.md, `create_refund` requires `{ paymentId, returnId, amount }`. In the locked tool allowlist:
- `payment` has `get_payment`
- `refund` has `create_refund`, but does **not** have `get_payment`
In Scenario 3 (duplicate charge), `paymentId` and `amount` are cleanly delivered to `refund` via `state.activeWorkflow.resumeContext` from Payment's handoff.
In Scenario 8, the customer contacts support about an approved return ("Where is my refund for order X?").

**Options:**
- **Option A (Recommended proposal):** Add `get_payment` to the `refund` specialist allowlist in `server/src/tools/permissions.ts` and `REFERENCE.md`.
  - *Tradeoffs:* Requires updating the allowlist to permit `refund` to read payments (`get_payment` is read-only and gated at FULL verification). This allows Refund specialist to perform the exact "structured check -> create_refund" sequence self-contained for Scenario 8 without awkward multi-agent ping-pong.
- **Option B (Alternative without allowlist change):** Keep `get_payment` exclusive to Payment. In Scenario 8, if `paymentId` is not already in `resumeContext`, Refund specialist emits a Pattern B handoff to `payment` to look up the payment, which then hands back to `refund`.
  - *Tradeoffs:* Strictly preserves the existing permission matrix, but adds an extra lateral handoff hop (eating 2 of the 3 handoff budget limit) just to read payment ID for an order.
- **Recommendation:** **Option A**. Adding `get_payment` to `refund` is clean, safe (read-only, gated at FULL verification), and enables Scenario 8 to run as specified in REFERENCE.md.

---

### OD-11: Pattern B Lateral Re-route Mechanism in Parent Router

**Options:**
- **Option A (Recommended):** Leverage existing `activeWorkflow` with `blockedBy: null`.
  - In `guards.ts`, `checkResumePreconditions` already implements:
    ```ts
    if (!blockedBy) {
      return returnTo;
    }
    ```
  - When a specialist initiates Pattern B handoff, it sets `activeWorkflow.blockedBy = null` and `activeWorkflow.returnTo = { domain: target, agent: target, workflowStep: step }`, with `resumeContext`.
  - The router's pre-classification resume guard detects this deterministically before calling the LLM, logs a `RoutingEvent` with `decisionType: 'RE_ROUTE'`, and dispatches `Command({ goto: targetSpecialist })`.
  - The target specialist reads `state.activeWorkflow?.resumeContext`, performs the action, and clears `activeWorkflow: overwrite(null)`.
  - *Tradeoffs:* Uses existing, battle-tested state and guard infrastructure without modifying `ConversationStateAnnotation` (which is a protected file). Zero risk of regression.
- **Option B:** Introduce a separate `state.handoffRequest` field in `ConversationState`.
  - *Tradeoffs:* Requires altering `ConversationStateAnnotation` (protected file), updating reducers, checkpointers, and all existing tests. Unnecessary given Option A works cleanly today.
- **Recommendation:** **Option A**.

---

## 5. Execution Steps

### Step 0: Plan approval (STOP and wait)
- Review plan, obtain user sign-off.
- Branch: `phase/10-payments-specialists`.

### Step 1: Payment Specialist Subgraph
- Implement `server/src/agents/specialists/payment/payment.prompt.txt`
- Implement `server/src/agents/specialists/payment/payment.ts`
- Implement `server/src/agents/specialists/payment/payment.test.ts`
- Verify with `npm test`, `npm run lint`, `npm run typecheck`.
- Commit: `phase 10 step 1: payment specialist subgraph`.

### Step 2: Refund Specialist Subgraph
- Update `server/src/tools/permissions.ts` (add `get_payment` to `refund` allowlist per OD-8 Option A approval) and its test.
- Implement `server/src/agents/specialists/refund/refund.prompt.txt`
- Implement `server/src/agents/specialists/refund/refund.ts`
- Implement `server/src/agents/specialists/refund/refund.test.ts`
- Verify with `npm test`, `npm run lint`, `npm run typecheck`.
- Commit: `phase 10 step 2: refund specialist subgraph`.

### Step 3: Wire Payment and Refund into Parent Graph
- Update `server/src/graphs/parent/parent-graph.ts` to wire real `paymentSpecialistNode` and `refundSpecialistNode` with configurable stub fallbacks.
- Update `server/src/graphs/parent/parent-graph.test.ts` if needed.
- Verify existing 350 tests continue to pass.
- Commit: `phase 10 step 3: wire payment and refund into parent graph`.

### Step 4: Parent Integration Tests for Scenarios 3, 4, and 8
- Implement `server/src/graphs/parent/parent-graph-payments.integration.test.ts`:
  - Scenario 3: Duplicate charge confirmed → Payment → Refund (Pattern B lateral re-route, refund created with `returnId: null`).
  - Scenario 4: Refund inquiry with no linked return → Refund → Returns (Pattern B lateral re-route).
  - Scenario 8: Return approved, refund not yet created → structured check → `create_refund` (not RAG).
- Verify with real Postgres DB / Redis fixtures and mocked `@google/genai`.
- Commit: `phase 10 step 4: payments specialists integration tests`.

### Step 5: Docs & Close-out
- Update `docs/STATUS.md` (new test count baseline).
- Update `docs/ROADMAP.md` (tick Phase 10 box).
- Update `docs/DECISIONS.md` (record approved OD-4c, OD-4d, OD-8, OD-11 decisions).
- Update `docs/OPEN-DECISIONS.md` (move resolved items).
- Commit: `phase 10 step 5: update docs for phase 10 close-out`.
- Provide unabridged step report and await phase sign-off.

---

## 6. Functional Requirements
- **FR-1:** Payment specialist extracts `orderId` or `paymentId` and queries `get_payment`. Missing input yields `WAITING_FOR_USER_INPUT`.
- **FR-2:** Insufficient verification on FULL-gated tools (`get_payment`, `detect_duplicate_charge`, `create_refund`, `get_refund_status`) triggers Pattern C block with `workflowStatus: 'WAITING_FOR_USER_INPUT'`.
- **FR-3:** When duplicate charge is detected (`potentialDuplicate: true`), Payment specialist triggers Pattern B handoff to Refund specialist with complete payment context.
- **FR-4:** When refund is requested without a linked return, Refund specialist triggers Pattern B handoff to Returns specialist.
- **FR-5:** In Scenario 8, Refund specialist checks for approved return, confirms no existing refund, and creates refund via `create_refund` without falling back to ungrounded RAG.
- **FR-6:** Every specialist node records an `agent_executions` row for foreign-key compliance with `tool_executions`.
- **FR-7:** Resumed/completed specialists clear `activeWorkflow` (`activeWorkflow: overwrite(null)`).

---

## 7. Non-Functional Requirements
- **Consistency:** Both specialists follow the identical single-node subgraph architecture established in Phase 9 (`order-tracking.ts`, `returns.ts`).
- **Telemetry & Tracing:** All routing decisions write `routing_history` rows; all specialist runs record `agent_executions`; all tool calls record `tool_executions`.
- **Safety & Containment:** Temperature 0.0 for deterministic classification and argument extraction; temperature 0.2 for customer response generation. Plain-text fallback on LLM failure.
- **Performance:** Fast in-memory unit tests with `MemorySaver`; integration tests clean up their scoped fixture data.

---

## 8. Acceptance Criteria
- Unit tests for Payment specialist covering: argument extraction, payment inquiry response, duplicate charge detection, Pattern B handoff return, Pattern C block on UNVERIFIED.
- Unit tests for Refund specialist covering: argument extraction, duplicate refund creation from `resumeContext`, Scenario 4 unlinked return handoff, Scenario 8 structured check and refund creation, Pattern C block.
- Integration tests in parent graph verifying end-to-end execution of Scenarios 3, 4, and 8 against real Postgres DB.
- Baseline test count increases from 350 to ≥ 375 tests.
- `npm run lint`, `npm run typecheck`, and `npm test` all exit code 0.

---

## 9. Risks and what would make you stop and ask
1. If the owner rejects OD-8 Option A (adding `get_payment` to `refund` allowlist), stop and align on the exact multi-agent hop mechanism for Scenario 8.
2. Any modification required to protected files (`schema.ts`, `conversation-state.ts`, `client.ts`).
3. Any unexpected test failure in the baseline 350 tests.

---

## 10. Docs to update on completion
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/OPEN-DECISIONS.md`

