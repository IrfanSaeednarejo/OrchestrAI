# STATUS (update at the end of every step/phase)

Last verified suite figure reported: 294/294 passing (39 files) at Phase 7. Baseline test count: 294.

## Phase state
- Phases 1-7: COMPLETE and signed off.
  - Phase 6 (Access Control / Verification Gate): Steps 0-5 closed; Step 6a proof graph verified; Step 6b close-out and type unification completed.
  - Phase 7 (Agent Foundation): Steps 0-5 closed; LLM client, prompt loader, handoff contract, common node patterns, and subgraph harness verified (294 tests).
- Phases 8-19: not started. Concrete subgraphs (`graphs/subgraphs`) and domain specialists are still stubs.

## Built so far
Domain data model + repositories + seed; conversation/message services; ConversationState + PostgresSaver checkpointing; routing/agent/tool event logging;
16 deterministic tools with zod schemas and verification metadata; Redis verification-code flow; `executeTool` + `gatedExecuteTool`; pure gate + per-specialist allowlist;
Pattern C blocked-workflow builder; identity-update helper with import-boundary enforcement; knowledge ingestion + domain/topic-scoped retrieval; Phase 6 throwaway integration graph;
Gemini LLM wrapper with structured Zod output; 5-section prompt template loader; HandoffRequest contract and Zod validation; standard node execution patterns; reusable subgraph test harness.

## Known issues (flagged, not fixed)
1. `user` field reducer uses `update ?? state`, so an explicit `user: null` update is ignored.
2. `AnyCompiledGraph` does not structurally match what `pocGraph.compile()` returns; tests use `as unknown as AnyCompiledGraph`. Revisit in Phase 8.
3. Seed fixture sets Order.status='returned' for "return approved, no refund yet", arguably premature.
4. Style inconsistency: `verificationService` is an object-namespace export; everything else uses plain named exports.
5. `executeTool` `redact()` is shallow and skips array outputs; harmless today. Revisit Phase 14/19.
6. 6a graph's ALLOWED branch does not clear `activeWorkflow`, so `blockedBy` goes stale after a successful resume (see OPEN-DECISIONS #5).

## Immediate next actions
1. Plan Phase 8 (Parent Graph & Router Skeleton). Requires addressing OPEN-DECISIONS #2 (router design).

## Changelog
- 2026-11-05: Phase 6 Step 6a integration proof graph and test suite verified (239 tests).
- 2026-11-05: Phase 6 Step 6b type unification (SpecialistId), cast cleanup, and Phase 6 close-out (240 tests).
- 2026-11-05: Phase 7 Agent Foundation completed: LLM wrapper, prompt loader, handoff schema, common node patterns, subgraph harness (294 tests).
