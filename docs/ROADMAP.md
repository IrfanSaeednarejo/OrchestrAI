# ROADMAP (19 phases). Tick boxes only when signed off.

- [x] 1 Project Foundation & Setup — repo, Docker (Postgres+pgvector, Redis), typed config, Drizzle, Vitest.
- [x] 2 Core Domain Data Model & Persistence — domain, conversation and orchestration tables, repositories, seed.
- [x] 3 Conversation & Agent State Architecture — ConversationState (= the checkpoint type), PostgresSaver, lifecycle service, event logging.
- [x] 4 Deterministic Tool Layer — 15 tools + executeTool wrapper, Redis verification flow. (search_knowledge in Phase 5 makes 16.)
- [x] 5 Knowledge Layer & RAG — knowledge_documents (pgvector 768), 5 policy docs, retrieval, search_knowledge.
- [x] 6 Access Control / Verification Gate — gate, allowlists, Pattern C builder, identity boundary, knowledge scope, Step 6a proof graph, Step 6b close-out.
- [x] 7 Agent Foundation — LLM-call/tool-call/decision-handoff node patterns (tools via the gate), LLM client wrapper, prompt template loader
      (Identity/Objective/Scope/Phased-Workflow/Guidelines), HandoffRequest type (sourceAgent, handoffReason, detectedIntent, recommendedDomain,
      relevantContext, attemptedActions, confidence), subgraph test harness. Needs: 4, 5, 6. Must first resolve OPEN-DECISIONS #3 (LLM).
- [x] 8 Meta Orchestrator & Stateful Router (skeleton) — Command(goto) routing, router reads full state, handoffCount/visitedAgents with configurable maxima,
      Command.PARENT handling, stub specialists. Needs: 3, 7. Resolves OPEN-DECISIONS #2/#4/#5/#6 as needed.
- [x] 9 Orders Specialists — Order Tracking, Returns (replace stubs, register in agent registry). Needs: 8, 5, 6.
- [x] 10 Payments Specialists — Payment, Refund; first real Pattern B re-route (duplicate charge -> REFUND_ACTION_REQUIRED handoff). Needs: 9.
- [x] 11 Account Specialists — Profile; two-mode Account Access (login recovery; subworkflow-resume with returnTo). Password reset never mutates identity.status. Needs: 10.
- [x] 12 Cross-Domain Integration Validation — all 14 scenarios live on real specialists; confirm Patterns A/B/C. Needs: 9, 10, 11.
- [x] 13 Failure Handling & Loop Prevention — loop -> fallback/escalate; tool failure -> retry once -> escalate; max handoffs -> escalate; ESCALATED terminal state. Needs: 12.
- [x] 14 Observability & Tracing — LangSmith; conversation/graph/agent/tool/routing levels; metadata. Needs: 13.
- [x] 15 Evaluation Framework — expand 14 -> 30-50 scenarios; binary evaluators (ROUTING_CORRECT, HANDOFF_CORRECT, SPECIALIST_SCOPE_CORRECT,
      TOOL_SELECTION_CORRECT, STATE_PRESERVED, KNOWLEDGE_GROUNDED, WORKFLOW_COMPLETED, RESOLUTION_CORRECT); multi-turn thread evaluation;
      recalibrate MIN_SIMILARITY. Needs: 14.
- [x] 16 Backend API Layer — resolve backend framework (Express.js REST API with CORS, Zod, custom AppError); start/send/history/trace endpoints (JSON + SSE streaming). Needs: 15.
- [ ] 17 Frontend: Customer Chat (Next.js). Needs: 16.
- [ ] 18 Frontend: Platform/Ops UI — conversation explorer, execution timeline, routing/handoff visualization, tool history, trace viewer, eval results. Needs: 16, 15.
- [ ] 19 Testing, Hardening & Deployment — edge cases, README/architecture docs, local-run guide. Needs: 17, 18.

Explicitly out of core scope: parallel safety fanout (optional post-core), production alerting, Lyft-style config-driven self-serve agent registration.

NOTE: the per-phase scenario numbers previously attached to Phases 9-11 contradicted the locked scenario list in REFERENCE.md. See OPEN-DECISIONS #1.
