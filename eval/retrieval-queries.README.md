# Legacy Artifact — Do Not Use

`retrieval-queries.json` is a Phase 13 synthetic-corpus eval set, superseded by
`eval/knowledge-golden-dataset.json` (6 queries, PDF-native).

It is referenced only by development scripts:
- `server/scripts/run-retrieval-eval.ts`
- `server/scripts/run-retrieval-eval-scratch.ts`
- `server/scripts/generate-seed-corpus.ts`
- `server/scripts/check-lexical-overlap.ts`

It is **not** referenced by `server/src/` or `.github/workflows/`.
Do not add it back to CI.

The authoritative golden dataset is `eval/knowledge-golden-dataset.json`.
