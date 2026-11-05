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
3. Agent LLM: provider, model, temperature, structured-output approach for routers and specialists. Only the embedding model is decided (gemini-embedding-2, 768).
   `@google/genai` and GEMINI_API_KEY already exist. Blocks Phase 7. Verify current model names before proposing.
4. Specialist designs, one block per specialist: scope in/out, phased workflow (entry/action/branch/exit), handoff triggers, escalation conditions, success/failure criteria.
5. Handoff and resume semantics: contents of `resumeContext`; who clears `activeWorkflow`/stale `blockedBy` after a resume.
   Proposal to evaluate: resumeContext = pending tool + validated args + resolved IDs; parent router clears blockedBy when routing back; resumed specialist clears the object on completion.
6. HandoffRequest payload final shape (sourceAgent, handoffReason, detectedIntent, recommendedDomain, relevantContext, attemptedActions, confidence) and validation.
7. Backend API framework (Phase 16): leaning Next.js API routes/Server Actions over a separate Express/Fastify service.
8. Refund specialist has no get_payment in the locked matrix; it must receive paymentId via handoff context (Scenarios 3 and 8). Confirm.
9. Original Stage 1/2 requirements doc is not available. Functional/non-functional requirements should be consolidated into docs/REQUIREMENTS.md during Phase 7 planning from DECISIONS + REFERENCE.
10. Review verdicts owed: Phase 6 Step 6a sign-off.
