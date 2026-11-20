# RAG Evaluation Harness

## Evaluation Approach
The harness in `src/evaluation/rag-retrieval.test.ts` measures **hit-rate** (whether the
expected section appears anywhere in the top-K results), not Rank-1 precision.

## Rank-1 Evaluation — DEFERRED
Rank-1 evaluation (asserting the expected section is the *first* result) is intentionally
deferred. At the current corpus size (5 documents, 14 chunks), RRF score gaps between
the top-2 results are too narrow (<0.003) for a deterministic Rank-1 assertion to be
stable across embedding API non-determinism. This will be re-evaluated when the corpus
grows to ≥ 50 documents.

## Golden Dataset
`eval/knowledge-golden-dataset.json` — bidirectional staleness guard verifies that
the golden set stays in sync with the ingested chunks in both directions.

## Scale Hardening Scope Note
Phase 29 hardened for medium-sized PDFs (up to ~60 KB). Large-PDF (>1 MB) memory safety unverified and deferred.
