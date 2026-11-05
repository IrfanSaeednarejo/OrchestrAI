# STATUS (update at the end of every step/phase)

Last verified suite figure reported: 239/239 passing (35 files) at Phase 6 Step 6a. Baseline test count: 239.

## Phase state
- Phases 1-5: COMPLETE and signed off.
- Phase 6 (Access Control / Verification Gate): IN PROGRESS
  - Steps 0-5: closed and signed off.
  - Step 6a (throwaway integration graph `src/graphs/poc/phase6-gate-graph.ts` + `.integration.test.ts`, 3 scenarios): completed in commit 7e88e90 on main; reported green, NOT yet signed off.
  - Step 6b (close-out audit): not started. Includes unifying the two specialist unions and removing an unnecessary `as ToolMetadata` cast in `blocked-workflow.test.ts`.
- Phases 7-19: not started. Agents (`agents/*`) and `graphs/subgraphs` are still `.gitkeep` stubs.

## Built so far
Domain data model + repositories + seed; conversation/message services; ConversationState + PostgresSaver checkpointing; routing/agent/tool event logging;
16 deterministic tools with zod schemas and verification metadata; Redis verification-code flow; `executeTool` + `gatedExecuteTool`; pure gate + per-specialist allowlist;
Pattern C blocked-workflow builder; identity-update helper with import-boundary enforcement; knowledge ingestion + domain/topic-scoped retrieval.

## Known issues (flagged, not fixed)
1. `user` field reducer uses `update ?? state`, so an explicit `user: null` update is ignored.
2. `AnyCompiledGraph` does not structurally match what `pocGraph.compile()` returns; tests use `as unknown as AnyCompiledGraph`. Revisit in Phase 8.
3. Seed fixture sets Order.status='returned' for "return approved, no refund yet", arguably premature.
4. Style inconsistency: `verificationService` is an object-namespace export; everything else uses plain named exports.
5. `executeTool` `redact()` is shallow and skips array outputs; harmless today. Revisit Phase 14/19.
6. 6a graph's ALLOWED branch does not clear `activeWorkflow`, so `blockedBy` goes stale after a successful resume (see OPEN-DECISIONS #5).
7. Two unions for the same six specialists: `SpecialistId` (`tools/permissions.ts`) and `SpecialistName` (`knowledge/specialist-scope.ts`). Unify on `SpecialistId`.

## Immediate next actions
1. Sign off Step 6a; do Step 6b; close Phase 6.
2. Then plan Phase 7 (Agent Foundation). It requires resolving OPEN-DECISIONS #3 (agent LLM) first.

## Changelog
(append: date, step, one line, test count)
