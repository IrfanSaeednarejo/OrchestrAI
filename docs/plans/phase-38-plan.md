# Phase 38 — Retrieval Evaluation, Ablation & Abstention Calibration (v3 Corpus) — PLAN (status: DONE)

## 1. Goal and how it fits the architecture
Re-run the full 263-query retrieval evaluation (`run-retrieval-eval.ts`) and 5-variant ablation (`run-retrieval-ablation.ts`) against the scaled 42-doc / 516-chunk `v3` corpus (`eval/knowledge-golden-dataset.v3.json`), re-warm the on-disk query embedding cache (`server/scripts/.embed-cache`), calibrate abstention/similarity thresholds for the larger corpus, and expand evaluation coverage with real-human queries.

## 2. Dependencies satisfied / missing
- **Satisfied**: Phase 37 complete on `phase/37-corpus-scale` (`516` active chunks in Postgres, HNSW + GIN indexes rebuilt, `eval/seed-labels-resolved.v3.json` 96/96, `eval/knowledge-golden-dataset.v3.json` 249 active + 14 negatives, 10-query smoke eval `Hit@3 = 90%`).
- **Missing**: Owner merge & tag `phase-37-done` on `main`, and new branch `phase/38-eval-calibration`.

## 3. Scope IN / scope OUT
- **IN**:
  - Re-warm `.embed-cache` for `v3` queries (up to 302 `embedQuery` calls, paced for 100 RPM Free Tier).
  - Run full `run-retrieval-eval.ts` (scoped vs unscoped, 263 active queries) on `v3`.
  - Run `run-retrieval-ablation.ts` on `v3` and compare against `v2` (66-chunk) baseline.
  - Calibrate abstention / negative-rejection thresholds on the 516-chunk corpus.
  - Collect/add real-human evaluation queries if approved.
- **OUT**:
  - No schema changes, no chunker/ingest changes, no UI changes.

## 4. Open decisions this phase must resolve
1. **Abstention threshold calibration**: Whether `retrieval.ts` RRF/similarity cutoffs need adjustment for 516 chunks vs 66 chunks (to be decided after observing `v3` eval + negative false-positive rate).
2. **Real-human query set**: Whether to add a separate `eval/human-queries.v1.json` or append to `v3` (recommended: separate file to preserve `v2`↔`v3` apples-to-apples comparison).

## 5. Steps (small, ordered)
1. **Branch**: Owner merges `phase/37-corpus-scale` → `main` (`phase-37-done`), then create `phase/38-eval-calibration`.
2. **Cache re-warm & full `v3` eval**: Run `run-retrieval-eval.ts` with RPM pacing; record `Hit@1`, `Hit@3`, `MRR`, and negative rejection rate.
3. **Full `v3` ablation**: Run `run-retrieval-ablation.ts` across the 5 variants; record `v2` vs `v3` delta.
4. **Abstention calibration**: Analyze any false positives on the 14 negatives and `Hit@1` misses; propose threshold tuning if needed.
5. **Docs & closeout**: Update `STATUS.md`, `DECISIONS.md`, and benchmark results.

## 6. Functional requirements
- `run-retrieval-eval.ts` and `run-retrieval-ablation.ts` complete with 0 unhandled 429s and 100% cache hit on subsequent runs.

## 7. Non-functional requirements
- Respect Gemini Free Tier 100 RPM limit during cache warming (`>= 700ms` pacing).
- No protected files modified.

## 8. Acceptance criteria
- Full `v3` eval report saved in `benchmarks/results/`.
- `npm run lint`, `npm run typecheck`, and `npm test` pass cleanly.

## 9. Risks and what would make you stop and ask
- Gemini daily quota or RPM 429s during cache warming.
- Significant `Hit@3` or negative-rejection regression on 516 chunks requiring a retrieval/threshold change.

## 10. Docs to update on completion
- `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`.

STOP here and request approval.
