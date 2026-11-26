# Phase 37 — Corpus Scale, Chunker Fix & Re-Labeling — PLAN (status: APPROVED — 2026-11-25)

## Approvals
- **2026-11-25**: Owner approved Phase 37 plan with amendments AM1–AM5, OD-37a (Option A), OD-37b (Option B), and OD-37c.

## 1. Goal and how it fits the architecture
Phase 37 scales the OrchestrAI knowledge base from **12 documents / 66 chunks** to **42 documents / ~516 chunks** (12 frozen existing docs + 30 new policy/FAQ docs, 10 per domain) while closing a confirmed content-loss defect in `server/src/knowledge/chunker.ts`, auditing existing production chunks for truncation against PDF-extracted text, hardening idempotent ingestion with a `chunk_key` column, and deterministically re-labeling all 96 seed snippets (`eval/seed-labels.json`) and 263 golden queries (`eval/knowledge-golden-dataset.v3.json`) against the new corpus.

Phase 37 is strictly scoped to corpus scaling, chunker correctness, ingestion hardening, and golden dataset migration; embedding cache re-warming (302 calls), abstention calibration, real-human query collection, and full eval/ablation re-runs are deferred to **Phase 38**.

### Architectural Invariants Reconfirmed
- **`retrieval-client.ts` (unpooled pool) is unchanged.** Ingest writes go through the main `client.ts` pool; retrieval reads go through `retrieval-client.ts`.
- **`search_vector` population**: Verified in `server/drizzle/migrations/0012_nice_groot.sql:12` that `knowledge_chunks.search_vector` is a Postgres `tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("section_path", '') || ' ' || "content")) STORED` column. Postgres automatically recomputes it on every `INSERT` and `UPDATE` of `section_path` or `content`; the `OD-37b` migration preserves this generated column untouched.

---

## 2. Dependencies satisfied / missing
- **Satisfied**:
  - Phase 29 PDF RAG pipeline (`pdf-parser.ts`, `text-cleaner.ts`, `ingest.ts`, `generate-policy-pdfs.ts`, `inject-pdf-xmp.ts`) is complete and verified (`docs/STATUS.md`).
  - Phase 36 Retrieval Latency Optimization is **COMPLETE** on `main` (`phase-36-done`), with single-CTE hybrid retrieval (`searchHybridScopedCTE`) verified at **21.42ms p50 / 22.23ms p95** in production (`Railway us-east4 -> Neon us-east-2`) and `hnsw.ef_search=100` / `iterative_scan=relaxed_order` active on `retrievalDb`.
  - Baseline corpus (`12` markdown sources in `docs/knowledge-base/src/*.md`, `96` seed snippets in `eval/seed-labels.json`, `263` golden queries in `eval/knowledge-golden-dataset.v2.json`) is committed and intact.
  - Current test suite baseline: **752 passed | 21 skipped**.
- **Missing / External Prerequisites**:
  - Formal owner approval of **OD-37b** in `docs/OPEN-DECISIONS.md` (before any `schema.ts` edit or Drizzle migration).
  - Gemini embedding daily quota verification at **37b.1** (must confirm ≥ 510–522 embedding calls available; if capped at 500/day, owner approves multi-day split or quota upgrade before `37b` proceeds).
  - Owner approval at all four gates: Plan approval, Scope Map (37b.1), Contradiction Audit (37b.5), Resolver output (37c.1), and Final Verification (37c.4).

---

## 3. Scope IN / Scope OUT

### Scope IN
- **37a**: Fix sentence-splitting content-loss defect in `server/src/knowledge/chunker.ts` + adversarial unit tests (`chunker.test.ts`); run read-only production chunk-truncation audit against `knowledge_chunks` comparing against **PDF-extracted text (`pdf-parser.ts` + `text-cleaner.ts`)** and markdown; stage re-chunking of the 12 frozen existing docs into `server/scripts/.chunk-staging.json` (gitignored).
- **37b**: Pre-check Gemini embedding quota before generating briefs; produce Scope Map for 30 new docs (10 per domain across existing `(domain, topic)` pairs); extract immutable numeric Policy Fact Sheet from the 12 frozen docs; generate 30 brief files in `docs/knowledge-base/briefs/{doc_id}.md`; draft 30 markdown docs in `docs/knowledge-base/src/{domain}-{topic}-{subtopic}.md` via resumable generator; run automated Contradiction Audit across all 42 docs; generate & XMP-inject PDFs for the 30 new docs.
- **37c**:
  - **37c.1' (Pre-Ingest Resolver — Gate 4)**: Resolve all 96 seed snippets verbatim to `(doc_id, chunk_key)` against `server/scripts/.chunk-staging.json` (`eval/seed-labels-resolved.v3-preingest.json`), surfacing `no-match`, `multi-match`, and the 4 documented soft matches (`s-exchanges-004`, `s-exchanges-006`, `s-notifications-002`, `s-notifications-007`) for owner review before spending embedding calls.
  - **37c.2 (`OD-37a` / `OD-37b` Migration + Ingest)**: Implement `OD-37a` (`docId`-scoped superseding + regression test) and `OD-37b` (`chunk_key` column, partial unique index, same-version content-hash guard, coexistence test); run pre-flight dry-run validation; ingest with ≤100 batching + post-load HNSW rebuild (assigning `defaultRandom()` UUIDs in Postgres).
  - **37c.2.5 (Post-Ingest UUID Lookup — Gate 5)**: Query Postgres `knowledge_chunks` for each `(doc_id, chunk_key)` to produce `eval/seed-labels-resolved.v3.json` (`seed_id → real_uuid`).
  - **37c.3 (Golden Dataset Migration `v3`)**: Migrate golden dataset to `eval/knowledge-golden-dataset.v3.json` using real post-ingest UUIDs with strict `v2`/`v3` equivalence checks and update eval/ablation runners to load `v3`.
  - **37c.4 (Verification + Smoke Eval — Final Gate)**: Execute verification checklist + 10-query inline smoke eval.

### Scope OUT
- Editing the text of the 12 existing markdown docs in `docs/knowledge-base/src/*.md` (STRICTLY FROZEN).
- Modifying protected files (`persistence/db/client.ts`, `persistence/checkpointer/{client,setup}.ts`, `state/conversation-state.ts`, `routing/events.ts`, `services/conversation-lifecycle.service.ts`) or `retrieval-client.ts`.
- Adding new npm dependencies, infrastructure, or observability stacks.
- Using `eval/retrieval-queries.json` (deprecated Phase 13 legacy artifact).
- Re-warming the 302-query eval embedding cache, abstention calibration, real-human query collection, or running full Phase 38 eval/ablation benchmarks.

---

## 4. Open decisions & rulings

### OD-37a: `upsertKnowledgeVersion` Superseding Scope — **APPROVED (Option A)**
- **Ruling**: Scope version superseding in `upsertKnowledgeVersion` by `docId` (`eq(knowledgeDocVersions.docId, versionMeta.docId)`) and demote `knowledgeChunks` by `versionId` of superseded `docId` versions, instead of `(domain, topic)`.
- **Required Regression Test**:
  - `upsertKnowledgeVersion(docB)` when `docA` and `docB` share `(domain='orders', topic='returns')`.
  - Assert `docA`'s active version remains `status='active'`, and only `docB`'s prior versions are demoted to `'superseded'`.
- **DECISIONS.md Note**: Explicitly record the semantic shift: `topic` transitions from *"the single document for a topic"* to *"a retrieval bucket containing N documents about that topic"*, while specialist-to-topic scope remains 1:1.

### OD-37b: Idempotent Chunk Upsert Key (`chunk_key` Column + Migration) — **PROPOSED (Option B, formal entry in `docs/OPEN-DECISIONS.md`)**
- **Ruling**: Rejected Option A (UUIDv5). Approved **Option B** in principle; written up in `docs/OPEN-DECISIONS.md` for formal approval prior to any `schema.ts` edit or Drizzle migration.
- **Migration Spec**:
  ```sql
  ALTER TABLE knowledge_chunks ADD COLUMN chunk_key text NOT NULL DEFAULT '';
  UPDATE knowledge_chunks SET chunk_key = chunk_index::text WHERE chunk_key = '';
  ALTER TABLE knowledge_chunks ALTER COLUMN chunk_key DROP DEFAULT;
  CREATE UNIQUE INDEX knowledge_chunks_version_chunk_key_active_unique
    ON knowledge_chunks (version_id, chunk_key) WHERE status = 'active';
  ```
- **Chunk-key format**: Zero-padded 2-digit position (`'01'`, `'02'`, ..., `'14'`), so lexicographic order matches numeric section order and stays stable across heading edits.
- **Same-version content-hash guard**: Before upsert, if `existing.version === incoming.version && existing.content_hash !== incoming.content_hash`, **throw / HALT** (prevents silent policy overwrite without a version bump).
- **Required Test**: Verify active/superseded coexistence: `INSERT active (v1, '01')` → `UPDATE status='superseded'` → `INSERT active (v1, '01')` succeeds.

### OD-37c: Topic Naming Convention — **APPROVED**
- Strictly match existing codebase and frontmatter topic strings using underscores (`account_security`, `data_deletion`).

---

## 5. Steps (ordered, gated across 37a, 37b, 37c)

> **Branch rule**: Create and work on `phase/37-corpus-scale` from `main` (never commit to `main`).

### Sub-Phase 37a — Chunker Fix + Production Chunk-Truncation Audit (GATE 1 after 37a)
1. **Step 37a.1 — Fix `chunker.ts` & Add Adversarial Unit Tests**:
   - **Files**: `server/src/knowledge/chunker.ts`, `server/src/knowledge/chunker.test.ts`.
   - **Work**: Replace the destructive `splitIntoSentences` regex (`/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g`) with a non-destructive sentence splitter (protecting decimals like `25.50`, version numbers like `3.2` / `1.0.0`, and abbreviations like `No.`, `e.g.`, `i.e.`). Assert the load-bearing invariant: concatenating split segments with their separators reproduces the input verbatim. Include all 11+ adversarial unit test cases specified in P37a.
2. **Step 37a.2 — Production Chunk-Truncation Audit (READ-ONLY, AM1)**:
   - **Files**: `server/scripts/audit-chunk-truncation.ts`.
   - **Work**: First verify the current ingest path by re-extracting one PDF (`pdf-parser.ts` + `text-cleaner.ts`) and diffing against one existing chunk. Then audit all 66 active rows in production `knowledge_chunks`, reporting **both**:
     - (a) chunk vs **PDF-extracted text** (`pdf-parser.ts` + `text-cleaner.ts` on the source PDF) — the true baseline for Phase 29 chunks, and
     - (b) chunk vs raw markdown (`docs/knowledge-base/src/*.md`), explaining any divergence.
   - Report truncated chunk count, affected `chunk_id` UUIDs + `doc_id`, and estimated lost characters per affected chunk.
3. **Step 37a.3 — Stage Re-Chunking of 12 Frozen Docs**:
   - **Files**: `server/scripts/stage-existing-chunks.ts`, `server/scripts/.chunk-staging.json` (verify gitignored).
   - **Work**: Parse and re-chunk only the 12 existing PDFs with the fixed chunker into `server/scripts/.chunk-staging.json`. No DB writes.
   - **GATE 1 (STOP)**: Report truncation count, affected chunks, unit test results, and staging summary. Wait for owner approval to proceed to 37b.

### Sub-Phase 37b — 30 New Docs, Consistency-Audited (GATES 2 & 3)
4. **Step 37b.1 — Scope Map & Pre-Generation Quota Check (GATE 2, AM2)**:
   - **Files**: `docs/knowledge-base/scope-map.md`.
   - **Work**:
     - **Quota Check (AM2)**: Before generating any briefs, report current Gemini embedding quota remaining and total chunk embedding requirement (~60–72 from 12 frozen docs + ~450 from 30 new docs = ~510–522 total). If quota < required, propose a multi-day split or quota upgrade for owner approval.
     - **Scope Map**: Produce the 30-row Scope Map (10 docs per domain: `orders`, `payments`, `account`) across existing topics only (`account_security`, `data_deletion`, etc.), resolving `owning_specialist` from `server/src/knowledge/specialist-scope.ts`, with `doc_id`, `domain`, `topic`, `owning_specialist`, `filename`, `section_count` (14–16), and one-line subtopic description.
   - **GATE 2 (STOP)**: Wait for owner approval of Quota Plan + Scope Map before generating any fact sheet, briefs, or docs.
5. **Step 37b.2 — Numeric Policy Fact-Sheet Extraction**:
   - **Files**: `server/scripts/extract-policy-facts.ts`, `docs/knowledge-base/fact-sheet.json`.
   - **Work**: Extract every numeric policy fact from the 12 frozen docs (`concept`, `value`, `source_doc`, `source_section`) as an immutable constraint for all 30 new docs.
6. **Step 37b.3 — Fact-Subtopic-Relevance Matrix (37b.3a) + 30 Brief Files (37b.3b)**:
   - **Files**: `docs/knowledge-base/fact-subtopic-relevance.md` (37b.3a), `server/scripts/generate-briefs.ts`, `docs/knowledge-base/briefs/{doc_id}.md` (30 files).
   - **Work**: First produce and obtain owner approval of the 30-row Fact-Subtopic-Relevance Matrix (`37b.3a`). Then generate 30 brief files from the approved Scope Map + Fact Sheet + Relevance Matrix, each receiving its exact approved row of in-scope concepts verbatim.
7. **Step 37b.4 — Resumable Doc Generator**:
   - **Files**: `server/scripts/generate-policy-docs.ts`, `docs/knowledge-base/src/{domain}-{topic}-{subtopic}.md` (30 new files).
   - **Work**: Draft each new doc using the existing Gemini LLM client, resumable by brief SHA-256 hash, logging `doc_id`, `chars`, `sections`, `timestamp`. Never run inside Vitest. Never touch the 12 frozen docs.
8. **Step 37b.5 — Contradiction Audit (GATE 3)**:
   - **Files**: `server/scripts/audit-contradictions.ts`, `docs/knowledge-base/contradiction-audit.md`.
   - **Work**: Re-parse all 42 docs, re-extract all numeric policy facts, group by concept, and cross-check every new doc against the immutable Fact Sheet (plus verify docs only cite concepts from their approved relevance-matrix row). Range concepts (`bnpl_klarna_order_range`, `fx_issuer_fee_range`) require both min and max present whenever the concept is mentioned (absent-or-both rule). Any divergence is a hard fail.
   - **GATE 3 (STOP)**: Report full contradiction audit table. Zero contradictions required before proceeding.
9. **Step 37b.6 — PDF Generation & XMP Injection**:
   - **Files**: `docs/knowledge-base/*.pdf` (30 new PDFs, reusing `generate-policy-pdfs.ts` and `inject-pdf-xmp.ts`).
   - **Work**: Render and XMP-inject the 30 new markdown sources; verify every PDF opens, has expected page count, and carries valid XMP metadata.

### Sub-Phase 37c — Re-Label, Re-Ingest, Verify (GATE 4 before DB writes, GATE 5 after UUID assignment)
10. **Step 37c.1' — Pre-Ingest Seed Snippet Resolver (GATE 4)**:
    - **Files**: `server/scripts/resolve-seed-labels-v3.ts`, `eval/seed-labels-resolved.v3-preingest.json`.
    - **Work**: Resolve all 96 seed snippets in `eval/seed-labels.json` verbatim against the 66 re-chunked frozen chunks in `server/scripts/.chunk-staging.json` to `(doc_id, chunk_key)` only (UUIDs do not exist before ingest because `id` is `defaultRandom()` per `OD-37b`).
    - **HALT / Owner Review**: Halt immediately on any `no-match` or `multi-match`. Surface the 4 documented soft matches (`s-exchanges-004`, `s-exchanges-006`, `s-notifications-002`, `s-notifications-007`) for owner review without auto-resolving.
    - **GATE 4 (STOP)**: Wait for owner review of pre-ingest resolver output before any DB writes or embedding calls.
11. **Step 37c.2 — `OD-37a`/`OD-37b` Implementation, Pre-Flight Dry-Run (AM4) & Ingest**:
    - **Files**: `server/src/persistence/db/schema.ts`, Drizzle migration (`db:generate` + `db:migrate`), `server/src/persistence/repositories/knowledge.repository.ts`, `server/src/knowledge/ingest.ts`, repository/ingest tests.
    - **Work**:
      - **Atomic single-commit sequence (no deploy between migration and code)**: Edit `schema.ts`, run `db:generate`, edit `0014_*.sql` (`DEFAULT ''` + `LPAD((chunk_index + 1)::text, 2, '0')` + `DROP DEFAULT`), apply `db:migrate` + 5 verification queries, implement `OD-37a` (`docId`-scoped superseding + regression test) + `OD-37b` (`ON CONFLICT (version_id, chunk_key) DO UPDATE`, same-version content-hash guard, coexistence test) + update test fixtures, verify full `npm test` green, and commit as one atomic unit.
      - **Pre-Flight Dry-Run (AM4, zero DB writes)**: Parse + chunk all 42 docs; report per-doc and total counts and domain distribution; assert total within `516 ± 20%`, every `(domain, topic)` has ≥ 1 chunk, every `content_hash` is unique across the corpus, and every chunk has content length between 400 and 1200 chars (flagging any doc `< 10` or `> 20` chunks). Dry-run must pass before any DB write.
      - **Pre-Flight Quota Re-Check + Ingest**: Confirm quota, batch embeddings at `≤ 100`, upsert via `ON CONFLICT (version_id, chunk_key) DO UPDATE` on main `client.ts` pool (`search_vector` auto-computed by Postgres `GENERATED ALWAYS` column), assigning real `defaultRandom()` UUIDs in `knowledge_chunks`, and run `REINDEX INDEX idx_knowledge_chunks_embedding_hnsw` after bulk load.
12. **Step 37c.2.5 — Post-Ingest UUID Lookup (GATE 5)**:
    - **Files**: `eval/seed-labels-resolved.v3.json`.
    - **Work**: Query `knowledge_chunks` joined with `knowledge_doc_versions` for each `(doc_id, chunk_key)` in `eval/seed-labels-resolved.v3-preingest.json` to map `seed_id → real_uuid` (`active` status). Confirm 96/96 non-null active UUIDs.
    - **GATE 5 (STOP)**: Wait for owner confirmation of 96/96 UUID lookup before migrating golden dataset.
13. **Step 37c.3 — Golden Dataset Migration (`v3`) & Equivalence Check (AM3)**:
    - **Files**: `server/scripts/migrate-golden-v3.ts`, `eval/knowledge-golden-dataset.v3.json` (`v2` retained), `server/scripts/run-retrieval-eval.ts`, `server/scripts/run-retrieval-ablation.ts`.
    - **Work**: Map all 263 queries in `v2` to real `v3` chunk UUIDs via parent seed resolution (`eval/seed-labels-resolved.v3.json`).
    - **Equivalence Check (AM3)**: Assert `v3` has exactly **263** queries (**249** answerable with non-null `gold_chunk_id` UUIDs present in `knowledge_chunks` with `status='active'`, **14** negatives with `gold_chunk_id: null`). Compare `v2` and `v3` per seed: parent seed's `v3` chunk must equal all its paraphrase/messy variants' `v3` chunk. Any mismatch = HALT. Update eval/ablation runners to load `v3`.
14. **Step 37c.4 — Final Verification & 10-Query Inline Smoke Eval (AM5)**:
    - Verify: total chunk count (`~516 ± 20%`), balanced domain distribution, 100% valid UUIDs, 100% non-NULL embeddings, 100% non-empty `search_vector`, every `(domain, topic)` mapped in scope code, 96/96 seeds resolved in `v3`, 4/4 soft matches confirmed, full test suite passing (≥ 752 tests, 0 failures), and 3-doc retrieval smoke test.
    - **End-of-Phase Smoke Eval (AM5)**: Pick 10 stratified answerable queries from `v3` (`4` keyword, `3` paraphrase, `3` hard), run via `run-retrieval-eval.ts` in unscoped mode with inline embedding (no cache warm, reporting exactly 10 embedding calls spent). Report `hit@3` (expected `≥ 90%` / `9/10`; if `< 80%`, HALT).
    - **FINAL GATE (STOP)**: Report all verification metrics and wait for owner sign-off (owner merges and tags).

---

## 6. Functional requirements
- Sentence splitting in `chunker.ts` preserves 100% of input characters without dropping fragments around decimals, versions, abbreviations, or unicode punctuation.
- All 12 existing markdown files remain byte-for-byte unchanged.
- All 30 new docs conform to existing `(domain, topic)` pairs and contain zero numeric policy contradictions against the 12 frozen docs.
- All 96 seed snippets resolve verbatim to deterministic `(version_id, chunk_key)` entries in the new corpus.
- Ingest pipeline supports idempotent re-runs (`ON CONFLICT (version_id, chunk_key) DO UPDATE`), same-version content-hash guard, `docId`-scoped superseding, ≤100 batching, and post-load HNSW index rebuild.

---

## 7. Non-functional requirements
- **Consistency**: Immutable Fact Sheet + automated Contradiction Audit prevent policy drift across 42 docs; same-version hash guard prevents silent policy overwrites.
- **Latency / Index Health**: HNSW index rebuilt after bulk ~516-chunk insert; `retrieval-client.ts` unchanged.
- **Cost / Quota Safety**: Pre-flight quota check at **37b.1** and **37c.2**; doc generator resumable by brief hash; Vitest suite never calls real Gemini APIs.
- **Testability**: Adversarial chunker tests, `OD-37a` sibling-doc regression test, `OD-37b` active/superseded coexistence test, full server suite (`≥ 752` passing), and 10-query inline smoke eval.

---

## 8. Acceptance criteria (executable)
- `npm run lint` — 0 errors.
- `npm run typecheck` — 0 errors.
- `npm test` — ≥ 752 passing, 0 failures (including adversarial `chunker.test.ts`, `OD-37a` regression test, and `OD-37b` coexistence test).
- Truncation audit report printed from `audit-chunk-truncation.ts` (PDF-extracted baseline + markdown comparison).
- Contradiction audit report confirms **0** numeric policy divergences across all 42 docs.
- Pre-flight dry-run passes (`516 ± 20%`, unique `content_hash`, 400–1200 chars).
- `eval/seed-labels-resolved.v3.json` resolves **96/96** seeds (`0` unreviewed `no-match`/`multi-match`, `4/4` soft matches owner-confirmed).
- `v3` golden dataset equivalence check passes (263 queries: 249 active UUIDs + 14 nulls; 0 parent/variant mismatches).
- End-of-phase 10-query inline smoke eval achieves `hit@3 ≥ 90%` (`≥ 80%` floor) using exactly 10 embedding calls.

---

## 9. Risks and what would make you stop and ask
- **Truncation audit returns 0**: Unexpected given Phase 35 evidence; stop and verify comparison normalization before proceeding.
- **Seed snippet `no-match` or `multi-match`**: Indicates source doc drift or boundary span; HALT and report to owner.
- **Insufficient Gemini daily embedding quota (< 510–522 remaining at 37b.1)**: Stop and propose multi-day split or quota upgrade.
- **Contradiction audit detects divergence**: Hard fail; stop and resolve before PDF generation or ingest.
- **Dry-run or `v3` equivalence check failure or smoke eval `< 80%`**: HALT before/after ingest and report.

---

## 10. Docs to update on completion
- `docs/STATUS.md` (truncation audit finding + Phase 37 completion metrics and test count)
- `docs/DECISIONS.md` (approved OD-37a + `topic` retrieval-bucket semantics, OD-37b `chunk_key` + format + migration, OD-37c, and corpus scale milestone)
- `docs/OPEN-DECISIONS.md` (mark OD-37a, OD-37b, OD-37c `[RESOLVED]`)
- `docs/ROADMAP.md` (if Phase 37 entry is tracked there)

---

**STOPPED for approval.** Please approve the amended plan and **OD-37b** in `docs/OPEN-DECISIONS.md` to begin **Sub-Phase 37a** on branch `phase/37-corpus-scale`.
