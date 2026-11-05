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
   OD-4c [RESOLVED 2026-11-05]: Payment specialist — single-node subgraph. Tools: get_order, get_payment (FULL), detect_duplicate_charge (FULL), search_knowledge (payments/payments). If duplicate confirmed, emits Pattern B handoff to Refund. Recorded in DECISIONS.md under Phase 10.
   OD-4d [RESOLVED 2026-11-05]: Refund specialist — single-node subgraph. Tools: get_order, get_payment (FULL), get_return_status, get_return_by_order, create_refund (FULL), get_refund_status (FULL), search_knowledge (payments/refunds). Duplicate charges processed via handoff resumeContext; unlinked returns hand off to Returns; approved returns trigger structured create_refund. Recorded in DECISIONS.md under Phase 10.
   Remaining: Profile, Account Access to be designed in Phase 11.
5. [RESOLVED 2026-11-05] Handoff and resume semantics: `resumeContext` = pending tool + validated args + resolved IDs; parent router writes `RE_ROUTE` event and routes to `activeWorkflow.returnTo`; resumed specialist clears `activeWorkflow` on COMPLETED. Recorded in DECISIONS.md under Phase 8.
6. [RESOLVED 2026-11-05] HandoffRequest payload shape (sourceAgent, handoffReason, detectedIntent, recommendedDomain, relevantContext, attemptedActions, confidence) and Zod validation. Recorded in DECISIONS.md under Phase 7.
7. Backend API framework (Phase 16): leaning Next.js API routes/Server Actions over a separate Express/Fastify service.
8. [RESOLVED 2026-11-05] Refund specialist payment identification (Scenario 8): Option A adopted — `get_payment` (FULL gated) added to `refund` specialist allowlist in `server/src/tools/permissions.ts` and `REFERENCE.md`. Enables self-contained structured check in Scenario 8. Recorded in DECISIONS.md under Phase 10.
9. Original Stage 1/2 requirements doc is not available. Functional/non-functional requirements should be consolidated into docs/REQUIREMENTS.md during Phase 7 planning from DECISIONS + REFERENCE.
10. [RESOLVED] Phase 6 Step 6a and Step 6b signed off; Phase 6 closed.
11. [RESOLVED 2026-11-05] Pattern B lateral re-route mechanism in Parent Router: Option A adopted — existing `activeWorkflow` with `blockedBy: null` triggers `checkResumePreconditions` in router, emitting `decisionType: 'RE_ROUTE'` and dispatching `Command({ goto: targetSpecialist })`. Zero schema or state changes required. Recorded in DECISIONS.md under Phase 10.
