# Phase 09 — Orders Specialists — PLAN (status: DRAFT)

## Approvals
- [ ] Owner approval before any code

---

## 1. Goal and how it fits the architecture

Replace the `order_tracking` and `returns` specialist stubs in the parent graph with real
LangGraph subgraphs. Each specialist is a mini-StateGraph (START → entry → action → END)
that uses `gatedExecuteTool` via `executeNodeTool`, retrieves grounded knowledge via
`retrieveKnowledge` (domain/topic scoped per REFERENCE.md), generates customer-facing
LLM responses at `temperature: 0.2`, and returns `Command({ goto: 'router' })` on handoff
or emits a `ConversationStateUpdate` to end its turn.

After this phase the system handles REFERENCE.md Scenarios 1, 2, and 9 end-to-end with
real specialists. The parent graph `buildParentGraph` is updated to swap in the two new
subgraphs; the four remaining stubs stay.

---

## 2. Dependencies satisfied / missing

**Satisfied (all checked green):**
- Phase 3: ConversationState, PostgresSaver, lifecycle service ✅
- Phase 4: All 16 tools with Zod-validated input, `executeTool`, `gatedExecuteTool` ✅
- Phase 5: `retrieveKnowledge`, `search_knowledge`, knowledge scope matrix ✅
- Phase 6: Access gate, Pattern C builder, `executeNodeTool` pattern ✅
- Phase 7: LLM client, prompt loader (5 sections), `HandoffRequest`, `buildSubgraphHarness` ✅
- Phase 8: Parent graph with `Command(goto)` dispatch, stubs, router guards/classifier ✅

**Missing / not yet built:**
- Nothing blocking. No new dependencies required.

---

## 3. Scope IN / Scope OUT

### In scope
- `src/agents/specialists/order-tracking/` — full subgraph + prompt template
- `src/agents/specialists/returns/` — full subgraph + prompt template
- `src/graphs/parent/parent-graph.ts` — swap stubs for real subgraphs (Tier 2: approved here)
- Prompt template files:
  - `src/agents/specialists/order-tracking/order-tracking.prompt.txt`
  - `src/agents/specialists/returns/returns.prompt.txt`
- Unit tests (MemorySaver, mocked LLM) for each specialist node
- Integration tests (real DB, mocked LLM embeddings) for end-to-end routes through parent
- Doc updates: STATUS.md, DECISIONS.md, OPEN-DECISIONS.md, ROADMAP.md

### Out of scope
- Payment, Refund, Profile, Account Access specialists (Phases 10-11)
- Schema changes (no new tables)
- Scenario 3-14 coverage (Phases 10-12)
- Real Gemini API calls in any test

---

## 4. Open decisions this phase must resolve

### OD-4a: Order Tracking specialist design — scope, phased workflow, handoff triggers

**Options:**
- A) Single `orderTrackingNode` that always reads state, calls tools, generates response, ends.
- B) Multi-node subgraph: `entryNode` (gather args from state) → `toolNode` (call tools) → `responseNode` (generate LLM response).

**Recommendation: B**, with 3 nodes. Each node is independently testable with `buildSingleNodeHarness`. The entry node resolves the orderId from state/messages; tool node calls `get_order` + `get_shipment_status` via `gatedExecuteTool`; response node generates a customer-facing reply grounded in retrieved knowledge.

**Scope in:**
- `get_order`, `get_shipment_status` (LIGHT verification required per REFERENCE.md)
- `search_knowledge` (domains: `['orders']`, topics: `['shipping']`)
- Scenario 1: simple status query
- Scenario 2: ambiguous order ref → `WAITING_FOR_USER_INPUT`

**Scope out:**
- Modifying orders (not in tool matrix for this specialist)
- Payments, returns

**Phased workflow:**
1. Entry: extract orderId from latest user message / state; if ambiguous → emit `workflowStatus: 'WAITING_FOR_USER_INPUT'` with clarification message → END.
2. Tool call: `get_order` → if NOT_FOUND escalate; then `get_shipment_status`.
3. Response: retrieve policy knowledge, generate LLM response with order status + shipment context.

**Handoff triggers:** None for this specialist (order tracking never hands off in Scenarios 1 and 2). May add later.

---

### OD-4b: Returns specialist design — scope, phased workflow, handoff triggers

**Scope in:**
- `get_order`, `get_shipment_status`, `check_return_eligibility`, `create_return`, `get_return_status`, `get_return_by_order` (LIGHT for read, FULL for create_return)
- `search_knowledge` (domains: `['orders']`, topics: `['returns']`)
- Scenario 9: ineligible return → RAG explanation → hard decline

**Scope out:**
- Scenario 4 (refund inquiry with no return) — requires Refund specialist
- Scenario 6 (Account Access for FULL verification) — requires Account Access specialist

**Phased workflow:**
1. Entry: resolve orderId; determine intent (status check vs creation request vs eligibility check).
2. Tool: `check_return_eligibility` → if ineligible → RAG explanation → END (Scenario 9).
3. Tool: for creation intent: `create_return` via FULL-gated `gatedExecuteTool` → BLOCKED → Pattern C (emit `activeWorkflow`) → route to Account Access when implemented; for now → `WAITING_FOR_USER_INPUT`.
4. Response: generate LLM response grounded in retrieved returns policy.

**Handoff triggers:** Pattern C (FULL verification block) → stores `activeWorkflow.returnTo = { domain: 'returns', agent: 'returns', workflowStep: 'create_return' }`.

---

> [!IMPORTANT]
> OD-4a and OD-4b are sub-items of OPEN-DECISIONS #4. Approval of this plan resolves them for Order Tracking and Returns only. The remaining 4 specialists are deferred to Phases 10-11.

---

## 5. Steps

### Step 0 — Plan committed
- File: `docs/plans/phase-09-plan.md`
- Commit: `phase 09 step 0: plan approved`

---

### Step 1 — Order Tracking specialist subgraph
**New files:**
- `src/agents/specialists/order-tracking/order-tracking.prompt.txt` — 5-section prompt
- `src/agents/specialists/order-tracking/order-tracking.ts` — 3-node subgraph: `entryNode`, `toolNode`, `responseNode`; exports `buildOrderTrackingSubgraph(checkpointer?)`
- `src/agents/specialists/order-tracking/order-tracking.test.ts` — unit tests with `buildSingleNodeHarness` + mocked `@google/genai`

**Protected files affected:** None.

**State ownership:**
- Nodes emit `ConversationStateUpdate` only.
- `workflowStatus` transitions: `'ACTIVE'` → `'WAITING_FOR_USER_INPUT'` (ambiguous) | `'COMPLETED'` (success) | `'FAILED'` (order not found).
- `messages` appends via LangGraph reducer (array index never used).

**Key implementation constraints:**
- All tool calls via `executeNodeTool` (wraps `gatedExecuteTool`).
- Knowledge retrieval: `retrieveKnowledge({ domains: ['orders'], topics: ['shipping'], ... })`.
- LLM for entry-argument extraction: `temperature: 0.0`; for customer-facing response: `temperature: 0.2`.
- No real Gemini API calls: mock `@google/genai` in tests.

**Failure cases:**
- Order not found (NOT_FOUND) → apologetic message, `workflowStatus: 'FAILED'`.
- LIGHT verification blocked → `buildBlockedWorkflowUpdate` → `WAITING_FOR_USER_INPUT`.
- LLM call fails → fallback plain-text message, still `COMPLETED` (graceful degradation).

**Commit:** `phase 09 step 1: order tracking specialist subgraph`

---

### Step 2 — Returns specialist subgraph
**New files:**
- `src/agents/specialists/returns/returns.prompt.txt`
- `src/agents/specialists/returns/returns.ts` — 3-node subgraph: `entryNode`, `eligibilityNode`, `returnActionNode`; exports `buildReturnsSubgraph(checkpointer?)`
- `src/agents/specialists/returns/returns.test.ts`

**Protected files affected:** None.

**State ownership:**
- Same `ConversationStateUpdate` contract.
- `create_return` is FULL-gated; on BLOCKED: Pattern C builder → `WAITING_FOR_USER_INPUT`, `activeWorkflow.returnTo` = `{ domain: 'returns', agent: 'returns', workflowStep: 'create_return' }`.

**Key implementation constraints:**
- Eligibility check (`check_return_eligibility`) → if ineligible reasons: `ORDER_NOT_DELIVERED`, `RETURN_WINDOW_EXPIRED`, `RETURN_ALREADY_EXISTS` → RAG lookup for policy explanation → hard decline message → `COMPLETED` (the conversation concluded, not an error).
- `create_return` input: `{ orderId, reason }` — both resolved from state/message context.

**Failure cases:**
- Order not found → `FAILED`.
- Ineligible → RAG explanation → `COMPLETED`.
- FULL verification block → Pattern C → `WAITING_FOR_USER_INPUT`.
- LLM failure → fallback message.

**Commit:** `phase 09 step 2: returns specialist subgraph`

---

### Step 3 — Wire subgraphs into parent graph
**Modified file:**
- `src/graphs/parent/parent-graph.ts` — replace `SPECIALIST_STUBS.order_tracking` and `SPECIALIST_STUBS.returns` with `buildOrderTrackingSubgraph()` and `buildReturnsSubgraph()` nodes. All other 4 nodes remain stubs.

> [!WARNING]
> `parent-graph.ts` is NOT in the protected files list (only `services/conversation-lifecycle.service.ts` is). Modifying it is Tier 1 — proceed and list in report. However this plan makes it explicit to track the change.

**Modified file:**
- `src/graphs/parent/parent-graph.integration.test.ts` — add 2 new integration test cases for Scenario 1 (order status) and Scenario 9 (ineligible return) through the full parent graph with real DB.

**Protected files affected:** None.

**Commit:** `phase 09 step 3: wire order-tracking and returns into parent graph`

---

### Step 4 — Full test suite + doc updates
- Run `npm run lint && npm run typecheck && npm test` — all must pass, count ≥ 331 + new tests.
- Update `docs/STATUS.md`.
- Update `docs/DECISIONS.md` — specialist design decisions.
- Update `docs/OPEN-DECISIONS.md` — mark OD-4 partially resolved (order-tracking + returns).
- Update `docs/ROADMAP.md` — tick Phase 9.

**Commit:** `phase 09 step 4: update decisions, status, and roadmap docs`

---

## 6. Functional requirements

| # | Requirement |
|---|---|
| F1 | Order Tracking resolves orderId from latest user message via LLM argument extraction (temperature 0.0). |
| F2 | Ambiguous order reference (no orderId extractable) → `workflowStatus: 'WAITING_FOR_USER_INPUT'`, clarifying message. |
| F3 | Successful order lookup → LLM-generated response grounded in `retrieveKnowledge` output (temperature 0.2). |
| F4 | Returns checks eligibility before attempting `create_return`. Ineligible → RAG policy explanation → hard decline, `COMPLETED`. |
| F5 | `create_return` is FULL-gated; BLOCKED outcome → Pattern C `activeWorkflow` stored, `WAITING_FOR_USER_INPUT`. |
| F6 | All tool calls go through `executeNodeTool` (never `executeTool` directly). |
| F7 | Knowledge retrieval is scoped: Order Tracking = `domains: ['orders'], topics: ['shipping']`; Returns = `domains: ['orders'], topics: ['returns']`. |
| F8 | No model memory answers policy questions when retrieval returns nothing (empty retrieval → no policy claim). |
| F9 | Each specialist exports a `buildXxxSubgraph(checkpointer?: BaseCheckpointSaver)` factory. |
| F10 | Parent graph uses the two real subgraphs; 4 other specialists remain stubs. |

---

## 7. Non-functional requirements

- **No new npm dependencies** — use only existing `server/package.json`.
- **No `any`, no `as` casts, no `@ts-ignore`** in any new file.
- **Zero real Gemini API calls in tests** — `@google/genai` mocked everywhere.
- **No schema changes** — no `db:generate` or `db:migrate` needed.
- **Modular** — each specialist is a self-contained directory; parent graph only imports the factory function.
- **Lint + typecheck clean** after every step commit.

---

## 8. Acceptance criteria (executable)

```bash
# From server/
npm run lint          # 0 errors
npm run typecheck     # 0 errors
npm test              # all pass, count >= 331 + new Phase 9 tests
```

**Named tests that must exist and pass:**

**Order Tracking unit (`order-tracking.test.ts`):**
- `entryNode: extracts orderId from user message`
- `entryNode: emits WAITING_FOR_USER_INPUT when no orderId resolvable`
- `toolNode: calls get_order and get_shipment_status`
- `toolNode: returns FAILED when order not found`
- `toolNode: returns WAITING_FOR_USER_INPUT when LIGHT gate blocks`
- `responseNode: generates grounded customer-facing response`

**Returns unit (`returns.test.ts`):**
- `eligibilityNode: returns COMPLETED with RAG explanation for ineligible return`
- `eligibilityNode: advances to returnActionNode when eligible`
- `returnActionNode: returns WAITING_FOR_USER_INPUT when create_return is FULL-blocked`
- `returnActionNode: returns COMPLETED on successful create_return`

**Integration (new cases in `parent-graph.integration.test.ts`):**
- `Scenario 1: order status query routes to order_tracking and resolves`
- `Scenario 9: ineligible return query routes to returns, retrieves policy, declines`

**Scenarios covered after this phase:** 1, 2 (partial — ambiguous), 9.

---

## 9. Risks and what would make me stop and ask

| Risk | Action |
|---|---|
| LangGraph subgraph cannot be used as a node in the parent graph directly (typing mismatch) | Stop: write up options, wait for approval. Fallback: wrap subgraph invoke in an adapter function. |
| `retrieveKnowledge` returns empty in tests (no real knowledge_documents) | Expected — mock the embeddings client (already done in Phase 7 tests). |
| `get_order` orderId extraction requires a new LLM structured output schema → architectural decision | Stop: proposal in OPEN-DECISIONS, wait for approval. |
| The parent graph integration test requires new DB fixtures (users, orders, shipments) for Scenario 1 | Tier 1 — proceed, list in report. Distinct `p9_` fixture prefix. |
| Any edit touches a protected file unexpectedly | Stop immediately, report what and why. |

---

## 10. Docs to update on completion

- `docs/STATUS.md` — new test count, Phase 9 COMPLETE
- `docs/DECISIONS.md` — Order Tracking and Returns specialist designs
- `docs/OPEN-DECISIONS.md` — OD-4 partially resolved (order-tracking + returns)
- `docs/ROADMAP.md` — tick `[x]` on Phase 9

---

## Files touched summary

| File | Action | Protected? |
|---|---|---|
| `src/agents/specialists/order-tracking/order-tracking.prompt.txt` | CREATE | No |
| `src/agents/specialists/order-tracking/order-tracking.ts` | CREATE | No |
| `src/agents/specialists/order-tracking/order-tracking.test.ts` | CREATE | No |
| `src/agents/specialists/returns/returns.prompt.txt` | CREATE | No |
| `src/agents/specialists/returns/returns.ts` | CREATE | No |
| `src/agents/specialists/returns/returns.test.ts` | CREATE | No |
| `src/graphs/parent/parent-graph.ts` | MODIFY (swap 2 stubs) | No |
| `src/graphs/parent/parent-graph.integration.test.ts` | MODIFY (add 2 test cases) | No |
| `docs/plans/phase-09-plan.md` | CREATE | No |
| `docs/STATUS.md` | UPDATE | No |
| `docs/DECISIONS.md` | UPDATE | No |
| `docs/OPEN-DECISIONS.md` | UPDATE | No |
| `docs/ROADMAP.md` | UPDATE | No |

**Protected files touched: 0.**

---

STOP — awaiting `APPROVED: phase 9 plan` before writing any production code.
