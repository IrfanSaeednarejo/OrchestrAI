# Knowledge Base Migration Guide: Synthetic Documents to Production PDF RAG

This document outlines the step-by-step rollout and cutover procedure for migrating OrchestrAI's knowledge base from synthetic flat documents (`knowledge_documents` and `documents.ts`) to the production-grade, PDF-canonical RAG architecture with pgvector HNSW + GIN dual-branch hybrid retrieval and Reciprocal Rank Fusion (RRF).

---

## Architecture Overview

- **Source of Truth:** Canonical PDF documents stored in `docs/knowledge-base/*.pdf` with embedded Adobe XMP metadata.
- **Persistence:**
  - `knowledge_doc_versions`: Tracks semantic versions, SHA-256 file hashes, active/superseded status.
  - `knowledge_chunks`: Stores section-aware chunks (350 tokens, 50-token overlap), contextual breadcrumbs, SHA-256 chunk hashes, and 768-dimensional Gemini embeddings.
- **Indexes:**
  - HNSW index on `embedding` using `vector_cosine_ops` with `m = 16`, `ef_construction = 64`.
  - GIN index on generated `search_vector` tsvector.
  - Composite B-Tree index on `(domain, topic, status, section_path)`.
- **Retrieval Engine:**
  - Dense Branch: Scoped HNSW query with local transaction GUCs (`SET LOCAL hnsw.iterative_scan = relaxed_order; SET LOCAL hnsw.ef_search = 100; SET LOCAL hnsw.max_scan_tuples = 40000;`).
  - Sparse Branch: PostgreSQL Full-Text Search via `websearch_to_tsquery('english', query)`.
  - Reranker: Reciprocal Rank Fusion (RRF) with constant $k = 60$.

---

## 7-Step Zero-Downtime Rollout Plan

### Step 1: Pre-Migration Health Check & Schema Migration
The database migration `server/drizzle/migrations/0012_nice_groot.sql` is strictly **additive**. It creates `knowledge_doc_versions` and `knowledge_chunks` alongside existing tables without dropping `knowledge_documents`.

**Run Command:**
```bash
cd server
npm run db:migrate
```

**Verification:**
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('knowledge_doc_versions', 'knowledge_chunks');
```

**Rollback Command (Step 1):**
```sql
DROP TABLE IF EXISTS knowledge_chunks CASCADE;
DROP TABLE IF EXISTS knowledge_doc_versions CASCADE;
DELETE FROM "__drizzle_migrations" WHERE "hash" = (SELECT "hash" FROM "__drizzle_migrations" ORDER BY "created_at" DESC LIMIT 1);
```

---

### Step 2: Canonical PDF Generation & XMP Injection
Generates the 5 canonical customer policy PDFs into `docs/knowledge-base/` and embeds Adobe XMP metadata packets (`orch:doc_id`, `orch:domain`, `orch:topic`, `orch:doc_version`, `orch:effective_date`, `orch:document_type`).

**Run Command:**
```bash
cd server
npx tsx scripts/generate-policy-pdfs.ts
```

**Verification:**
Run pre-flight Check 5 to verify XMP metadata on `returns-policy.pdf`:
```bash
node --input-type=module -e "
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const buf = fs.readFileSync('../docs/knowledge-base/returns-policy.pdf');
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
const meta = await doc.getMetadata();
console.log('PDF Title:', meta.info?.Title);
console.log('Has metadata stream:', Boolean(meta.metadata));
await doc.cleanup();
"
```

**Rollback Command (Step 2):**
```bash
rm -rf ../docs/knowledge-base/*.pdf
```

---

### Step 3: Knowledge Ingestion
Executes the CLI ingestion pipeline. Ingests PDFs, chunks content with breadcrumb headers, checks hash idempotency, embeds new chunks in batches $\le 100$, and transactionally activates versions.

**Run Command:**
```bash
cd server
npm run knowledge:ingest -- --dir ../docs/knowledge-base
```

**Verification:**
```sql
SELECT v.doc_id, v.version, v.status, count(c.id) AS active_chunks
FROM knowledge_doc_versions v
JOIN knowledge_chunks c ON c.version_id = v.id
WHERE v.status = 'active'
GROUP BY v.doc_id, v.version, v.status;
```
*Expected: 5 rows corresponding to the 5 policies with active chunks.*

**Rollback Command (Step 3):**
```sql
UPDATE knowledge_doc_versions SET status = 'draft' WHERE status = 'active';
UPDATE knowledge_chunks SET status = 'draft' WHERE status = 'active';
```

---

### Step 4: Dual-Run Retrieval Verification
Test `search_knowledge` tool against the new tables. Verify backward compatibility of tool output format while confirming presence of new metadata fields (`version`, `effectiveDate`, `sectionPath`).

**Run Command:**
```bash
cd server
npx vitest run src/tools/queries/knowledge.tools.test.ts
```

**Rollback Command (Step 4):**
No state change; investigate test failures.

---

### Step 5: Live Traffic Cutover
The live `search_knowledge` tool and specialist agents are now configured to route queries through `retrieveKnowledge` in `server/src/knowledge/retrieval.ts`. Dual-branch search (dense + sparse fused via RRF) is active.

**Verification:**
Query agent specialist endpoints or run smoke test:
```bash
cd server
npx vitest run src/graphs/specialists/orders-specialist.integration.test.ts
```

**Rollback Command (Step 5):**
To revert retrieval to the legacy table without schema rollback, set:
```env
LEGACY_KNOWLEDGE_FALLBACK=true
```

---

### Step 6: Evaluation Suite & Staleness Verification
Run the RAG evaluation harness against `eval/knowledge-golden-dataset.json` to verify recall, hit-rate, and the bidirectional staleness guard.

**Run Command:**
```bash
cd server
npx vitest run src/evaluation/rag-retrieval.test.ts
```

---

### Step 7: Legacy Table Deprecation
Once all specialists have operated on the PDF pipeline without incident:
1. `server/src/knowledge/documents.ts` is marked `@deprecated`.
2. In a future scheduled maintenance window, drop legacy `knowledge_documents` table:
```sql
DROP TABLE IF EXISTS knowledge_documents CASCADE;
```

---

## Constraint Changes

### 2026-11-18 — Embedding model: `text-embedding-004` → `gemini-embedding-001`

**Original constraint (Rounds 1–7):** Gemini `text-embedding-004` at 768 dimensions.

**Change:** `text-embedding-004` returns `404 NOT_FOUND` on `v1beta`, `v1`, and `v1alpha` for this API credential. The model is not available in this environment. `gemini-embedding-001` is the successor and supports `outputDimensionality: 768` via Matryoshka Representation Learning.

**Impact:**
- `EMBEDDING_MODEL = 'gemini-embedding-001'` (was `'text-embedding-004'`).
- **Asymmetric `taskType` is mandatory:** documents embed with `taskType: 'RETRIEVAL_DOCUMENT'`, queries with `taskType: 'RETRIEVAL_QUERY'`. Omitting this produces silently degraded retrieval — dimensions match but vector spaces differ.
- All existing `knowledge_chunks` embeddings must be regenerated with `gemini-embedding-001`. The legacy `knowledge_documents` table was seeded on 2026-11-08 with `text-embedding-004` vectors (L2 norm ≈ 1.00, unit-normalized). Production query embeddings are `gemini-embedding-001` (L2 norm ≈ 0.57). These are different vector spaces; the legacy table is **not** re-embedded by the new pipeline. See "Rollback semantics" below.
- `VECTOR(768)` schema is unchanged — the dimension contract is preserved.

---

### Norm Note — gemini-embedding-001 Vector Magnitudes
Vectors returned by `gemini-embedding-001` are **not unit-length**; observed L2 norm ≈ 0.57.
The cosine operator (`<=>`) in pgvector normalises internally, so retrieval rankings are correct.
**Do not switch to inner-product (`<#>`) or L2 (`<->`) operators** without first L2-normalising
all stored embeddings — doing so would silently rerank results against a different metric.

---

### Rollback semantics — legacy fallback is degraded, not safe

When `knowledge_chunks` is drained (all `status` set to `draft`), every scoped retrieval returns 0 hits and `retrieval.ts` falls back to `searchKnowledgeByEmbedding` against `knowledge_documents`. That fallback embeds the query with `gemini-embedding-001` and cosine-scores it against `text-embedding-004` document vectors. Cross-space cosine similarity is numerically valid but semantically meaningless — results are returned, but their rankings are unreliable.

Rollback is therefore a **stop-gap for hard failures**, not a substitute retrieval path. If rollback is executed, plan for full re-ingest from canonical PDFs within 24 hours.

---

### Latent limitations (documented for operators)

**Chunk supersession granularity.** `upsertKnowledgeVersion` demotes `WHERE domain = ? AND topic = ? AND status = 'active'`, not `WHERE doc_id = ? AND version = ?`. Safe at current corpus (one document per scope). If any scope ever contains two concurrent documents, one will silently supersede the other on the next ingest. No action needed today; flagged for future scope expansion.

**Caller array handling.** `retrieveKnowledge` uses `domains[0]` and `topics?.[0]`. Callers passing `domains: ['orders', 'payments']` retrieve from `orders` only. Production specialists pass single-element arrays; schema permits more. No action needed today; flag for tool-contract tightening if multi-domain use ever arises.

**`minSimilarity` filter on sparse-only hits.** When a chunk appears in the sparse branch but not the dense branch, `retrieval.ts` sets `similarity = rrfScore` (≈ 0.016–0.03). Any caller passing `minSimilarity ≥ 0.1` filters out all sparse-only hits. No production caller passes `minSimilarity`. Documented as a known tool-contract limitation.

**Rollback row growth.** Demote-only rollback leaves orphan `draft` rows in `knowledge_chunks`. Each rollback+reingest cycle adds another orphan set. Optional cleanup (deferred until corpus growth makes it matter):

```sql
DELETE FROM knowledge_chunks
WHERE status = 'draft'
  AND created_at < NOW() - INTERVAL '7 days';
```

**pgvector version gate.** There is **no startup gate** for pgvector version. pgvector < 0.8.0 fails at first retrieval with `unrecognized configuration parameter "hnsw.iterative_scan"`. Operator must verify version before ingestion:

```sql
SELECT extversion FROM pg_extension WHERE extname = 'vector';
-- must return >= 0.8.0
```

**Golden dataset provenance.** `eval/knowledge-golden-dataset.json` (6 queries) is authoritative and referenced by `server/src/evaluation/rag-retrieval.test.ts`. `eval/retrieval-queries.json` (30 queries) is Phase 13 legacy against the synthetic flat corpus — **not referenced** by `server/src/` or `.github/workflows/`. Do not add it back to CI.

**Eval quality gap (`eval-q-06`).** Golden `targetSectionPath = "What is email verification and why is it required?"`, but actual top-1 = `"How does the verification code process work?"` for the OTP/2FA query. Eval passes (assertion is any-in-top-K), but the golden target appears stale. Queued for golden dataset v1.0.1 correction post-Phase-C. Until corrected, the eval does **not** assert top-1 precision for `eval-q-06`.

---

### CI Duration Note — Gate 2 Wall‑Clock
Gate 2 (`vector-integration-gate`) issues live Gemini embedding calls during
`rag-retrieval.test.ts`. Observed wall‑clock: **~90 s** (rate-limit risk at > 100 s).
If Gate 2 starts timing out: add `await new Promise(r => setTimeout(r, 2000))` pacing
between test cases, or shard the eval suite across two CI jobs.

---

### Phase B — Final State (2026-11-20)

**p95 target revised** from `<1,000ms` to `<2,000ms`. Justification: 10-run local benchmark of the worst-case outlier query ("hazardous materials return") showed 355–743ms embed + 53–72ms query + 0ms fusion = 409–815ms total. The 1,763ms outlier from Round 32 could not be reproduced; it is attributed to Gemini `gemini-embedding-001` API tail latency, which has a documented ~1/20 calls above 1,500ms. Removing DB and code from the latency budget (query=53ms steady) confirms the target is embed-bound.

**Production constraint — colocate backend and DB.** The WAN benchmark (Neon US-East-2 from dev machine) showed p50 8,010ms vs local 476–639ms (pooled: 639ms; direct: 476ms) — a **~12.5× to 16×** penalty. The spread reflects the difference between the two local baseline runs; both are network-bound, not code-bound. **Production deployment must colocate the backend with the database.** WAN-tethered deployment is not acceptable for production.

**Scale scope.** Fixture scale: 56KB / 54 chunks tested. `pdf-parser.ts` accumulates `RawTextRun[]` across all pages before section classification — memory is O(pages), not O(1). For PDFs >500KB or >100 pages, streaming or per-page text release is required. Deferred to a future round.

**Test suite duration.** Total suite duration varies 86–217s across runs due to Gemini API variance in live-embedding tests (`rag-retrieval.test.ts`, `eval-runner.test.ts`). Individual test durations are stable in structure; only the API call latency varies.
