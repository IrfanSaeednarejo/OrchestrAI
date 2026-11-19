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
- All existing `knowledge_chunks` embeddings must be regenerated (prior rows were produced under the `gemini-embedding-2` fallback and are in a different vector space).
- `VECTOR(768)` schema is unchanged — the dimension contract is preserved.

---

### Norm Note — gemini-embedding-001 Vector Magnitudes
Vectors returned by `gemini-embedding-001` are **not unit-length**; observed L2 norm ≈ 0.57.
The cosine operator (`<=>`) in pgvector normalises internally, so retrieval rankings are correct.
**Do not switch to inner-product (`<#>`) or L2 (`<->`) operators** without first L2-normalising
all stored embeddings — doing so would silently rerank results against a different metric.

---

### CI Duration Note — Gate 2 Wall‑Clock
Gate 2 (`vector-integration-gate`) issues live Gemini embedding calls during
`rag-retrieval.test.ts`. Observed wall‑clock: **~90 s** (rate-limit risk at > 100 s).
If Gate 2 starts timing out: add `await new Promise(r => setTimeout(r, 2000))` pacing
between test cases, or shard the eval suite across two CI jobs.

---

### Scale Hardening Scope Note
Phase 29 hardened for medium-sized PDFs (up to ~60 KB). Fixture scale: 56KB tested; >500KB unverified.
`pdf-parser.ts` accumulates runs across all pages into memory before section classification, making memory O(pages); large PDF parsing (>500KB / 100+ pages) requires streaming or per-page text release before production scale-up.
