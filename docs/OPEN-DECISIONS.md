# OPEN DECISIONS
Process: the agent writes a proposal (options, tradeoffs, recommendation, impact, tests that would prove it), then WAITS for approval.
Approved items move to DECISIONS.md. Items marked [CONFLICT] are inconsistencies in earlier notes that need a ruling, not a design.

1. [CONFLICT] Pattern A is undefined, and roadmap scenario numbers for Phases 9-11 contradict the locked 14-scenario list.
   Working inference (unapproved): Pattern A = router selects a specialist, it resolves with no handoff.
   Proposed remap (unapproved): P9 -> 1,2,9; P10 -> 3,4,8; P11 -> 13,14 + block halves of 5,6,7; P12 -> all 14 live; P13 -> 10,11,12.
   Scenarios 5-7 need Account Access, which is built last; consider ordering Account Access earlier.
2. Router design: LLM classifier vs rules vs hybrid; intent taxonomy; default max-handoff and loop thresholds.
   Recommendation to evaluate: deterministic guards first (handoff cap, loop detection, resume when activeWorkflow.returnTo set) then an LLM structured-output classifier.
   Starting threshold to evaluate: escalate when handoffCount exceeds 3.
3. [RESOLVED 2026-11-05] Agent LLM: `gemini-2.5-flash`, `temperature: 0.0` for routing/tool decisions, `temperature: 0.2` for customer-facing generation, `responseMimeType: 'application/json'` + Zod `responseSchema` for structured output, mockable client interface in Vitest. Recorded in DECISIONS.md under Phase 7.
4. Specialist designs, one block per specialist: scope in/out, phased workflow (entry/action/branch/exit), handoff triggers, escalation conditions, success/failure criteria.
5. Handoff and resume semantics: contents of `resumeContext`; who clears `activeWorkflow`/stale `blockedBy` after a resume.
   Proposal to evaluate: resumeContext = pending tool + validated args + resolved IDs; parent router clears blockedBy when routing back; resumed specialist clears the object on completion.
6. [RESOLVED 2026-11-05] HandoffRequest payload shape (sourceAgent, handoffReason, detectedIntent, recommendedDomain, relevantContext, attemptedActions, confidence) and Zod validation. Recorded in DECISIONS.md under Phase 7.
7. Backend API framework (Phase 16): leaning Next.js API routes/Server Actions over a separate Express/Fastify service.
8. Refund specialist has no get_payment in the locked matrix; it must receive paymentId via handoff context (Scenarios 3 and 8). Confirm.
9. Original Stage 1/2 requirements doc is not available. Functional/non-functional requirements should be consolidated into docs/REQUIREMENTS.md during Phase 7 planning from DECISIONS + REFERENCE.
10. [RESOLVED] Phase 6 Step 6a and Step 6b signed off; Phase 6 closed.
