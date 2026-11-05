# OPEN DECISIONS
Process: the agent writes a proposal (options, tradeoffs, recommendation, impact, tests that would prove it), then WAITS for approval.
Approved items move to DECISIONS.md. Items marked [CONFLICT] are inconsistencies in earlier notes that need a ruling, not a design.

1. [CONFLICT] Pattern A is undefined, and roadmap scenario numbers for Phases 9-11 contradict the locked 14-scenario list.
   Working inference (unapproved): Pattern A = router selects a specialist, it resolves with no handoff.
   Proposed remap (unapproved): P9 -> 1,2,9; P10 -> 3,4,8; P11 -> 13,14 + block halves of 5,6,7; P12 -> all 14 live; P13 -> 10,11,12.
   Scenarios 5-7 need Account Access, which is built last; consider ordering Account Access earlier.
2. [RESOLVED 2026-11-05] Router design: hybrid guard+LLM classifier; `DEFAULT_MAX_HANDOFFS = 3`; `Command({ goto })` dispatch; loop = same specialist ≥ 2 consecutive visits. Recorded in DECISIONS.md under Phase 8.
3. [RESOLVED 2026-11-05] Agent LLM: `gemini-2.5-flash`, `temperature: 0.0` for routing/tool decisions, `temperature: 0.2` for customer-facing generation, `responseMimeType: 'application/json'` + Zod `responseSchema` for structured output, mockable client interface in Vitest. Recorded in DECISIONS.md under Phase 7.
4. Specialist designs, one block per specialist: scope in/out, phased workflow (entry/action/branch/exit), handoff triggers, escalation conditions, success/failure criteria.
   OD-4a [RESOLVED 2026-11-05]: Order Tracking — single-node phased subgraph. Tools: get_order, get_shipment_status (LIGHT). RAG: orders/shipping. Ambiguous orderId → WAITING_FOR_USER_INPUT. Recorded in DECISIONS.md under Phase 9.
   OD-4b [RESOLVED 2026-11-05]: Returns — single-node phased subgraph. Tools: check_return_eligibility, create_return (FULL-gated), get_return_status, get_return_by_order. RAG: orders/returns. Ineligible → RAG explain → COMPLETED. FULL block → Pattern C → WAITING_FOR_USER_INPUT. Recorded in DECISIONS.md under Phase 9.
   OD-4c [PROPOSAL Phase 10]: Payment specialist — single-node subgraph. Tools: get_order, get_payment, detect_duplicate_charge, search_knowledge (payments/payments). Flow: arg extraction → get_payment (FULL gate) → detect_duplicate_charge (FULL gate). If duplicate confirmed, emit Pattern B handoff with relevantContext to router → refund.
   OD-4d [PROPOSAL Phase 10]: Refund specialist — single-node subgraph. Tools: get_order, get_return_status, get_return_by_order, create_refund, get_refund_status, search_knowledge (payments/refunds), plus proposed get_payment (see OD-8). Flow: ingest handoff resumeContext or extract orderId → evaluate return status. If no return, Pattern B handoff to returns. If return approved and no refund, create_refund.
   Remaining: Profile, Account Access to be designed in Phase 11.
5. [RESOLVED 2026-11-05] Handoff and resume semantics: `resumeContext` = pending tool + validated args + resolved IDs; parent router writes `RE_ROUTE` event and routes to `activeWorkflow.returnTo`; resumed specialist clears `activeWorkflow` on COMPLETED. Recorded in DECISIONS.md under Phase 8.
6. [RESOLVED 2026-11-05] HandoffRequest payload shape (sourceAgent, handoffReason, detectedIntent, recommendedDomain, relevantContext, attemptedActions, confidence) and Zod validation. Recorded in DECISIONS.md under Phase 7.
7. Backend API framework (Phase 16): leaning Next.js API routes/Server Actions over a separate Express/Fastify service.
8. [PROPOSAL Phase 10] Refund specialist payment identification (Scenario 8):
   Option A (Recommended): Add `get_payment` (FULL gated) to `refund` specialist in `TOOL_ALLOWLIST` and `REFERENCE.md`. Allows Refund specialist to perform the self-contained structured check in Scenario 8 (`get_return_by_order` -> `get_payment` -> `create_refund`) without requiring extra inter-agent ping-pong hops.
   Option B: Keep `get_payment` exclusive to Payment specialist. In Scenario 8, Refund must hand off to Payment to fetch payment data, which hands back to Refund.
9. Original Stage 1/2 requirements doc is not available. Functional/non-functional requirements should be consolidated into docs/REQUIREMENTS.md during Phase 7 planning from DECISIONS + REFERENCE.
10. [RESOLVED] Phase 6 Step 6a and Step 6b signed off; Phase 6 closed.
11. [PROPOSAL Phase 10] Pattern B lateral re-route mechanism in Parent Router:
    Option A (Recommended): Use existing `activeWorkflow` with `blockedBy: null`. Router guard `checkResumePreconditions` already resumes automatically when `blockedBy` is falsy, emitting a `RE_ROUTE` routing event and dispatching `Command({ goto: targetSpecialist })`. Target specialist reads `resumeContext` and clears `activeWorkflow: overwrite(null)`.
    Option B: Add a new `handoffRequest` annotation to `ConversationState` (requires modifying protected file `conversation-state.ts`).
