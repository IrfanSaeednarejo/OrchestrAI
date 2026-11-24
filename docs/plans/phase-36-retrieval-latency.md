# Phase 36 — Retrieval Latency Optimization & Database Call-Path Consolidation — PLAN (status: DRAFT)

## 1. Goal and How It Fits the Architecture
Optimize the hybrid RAG retrieval pipeline from the empirical baseline of **p50 1,223.20ms / p95 3,316.02ms** down to single-round-trip performance (~225ms over WAN, ~15ms when co-located in region). This is achieved by:
1. Moving audit telemetry off the critical path (recovering ~222ms p50 instantly).
2. Verifying and migrating HNSW configuration parameters to connection-level GUCs (Layer A: eliminating transaction `BEGIN`/`COMMIT` and 3 `SET LOCAL` statements).
3. Consolidating dense vector search, sparse full-text search, and reciprocal rank fusion (RRF k=60) into a single server-side CTE query (Layer B: collapsing all database round-trips into exactly 1 statement).

## 2. Dependencies Satisfied / Missing
- Cites `docs/STATUS.md` and `docs/plans/phase-35-latency-baseline.md`: Phase 35 baseline locked at **1,223.20ms p50 / 3,316.02ms p95** across N=30 calls, with a measured single round-trip WAN floor of ~225ms.
- Current live environment: Remote Neon PostgreSQL pooler in AWS `us-east-2`.
- Fresh-connection `SHOW hnsw.ef_search;` currently defaults to `40`. Layer A verification script (`scripts/check-gucs.ts`) must confirm `100` before Step 3 code changes occur.
- Test suite baseline: 741 passed | 21 skipped (83 passed files, 2 skipped).

## 3. Scope IN / Scope OUT
- **Scope IN**:
  - Step 1: Telemetry conversion to non-blocking fire-and-forget in `server/src/knowledge/retrieval.ts`.
  - Step 2: Verification script `server/scripts/check-gucs.ts` inspecting fresh pool connections for `hnsw.ef_search=100`, `hnsw.iterative_scan=relaxed_order`, `hnsw.max_scan_tuples=40000`, and `vector >= 0.7.0`.
  - Step 3: Layer A code cleanup removing `db.transaction()` and 3x `SET LOCAL` from `searchDenseScoped` in `server/src/persistence/repositories/knowledge.repository.ts`.
  - Step 4: Layer B single-CTE retrieval query consolidating Dense + Sparse + RRF fusion in SQL, with deterministic tie-breaking (executed only if Step 3 co-located p50 > 20ms).
  - Regression and equivalence testing ensuring identical top-K chunk IDs and order on a fixed 30-query test fixture.
- **Scope OUT**:
  - NO changes to per-turn advisory lock semantics in `message.controller.ts:153-170`.
  - NO edits to protected files (`client.ts`, `checkpointer/{client,setup}.ts`, `conversation-state.ts`, `routing/events.ts`, `conversation-lifecycle.service.ts`, `schema.ts`).
  - NO new npm dependencies.
  - NO changes to specialist domain+topic scoping rules (locked in `REFERENCE.md`).
  - NO un-mocked Gemini API calls in test suites.

---

## 4. Open Decisions & Invariants

### OD-36a: Telemetry Fire-and-Forget Architecture
- In `server/src/knowledge/retrieval.ts:158`, `await logRetrievalExecutionSafely(...)` currently blocks returning the search response to the caller.
- Because `logRetrievalExecutionSafely` already wraps DB inserts in a `try/catch` block that suppresses errors, it is safe to execute asynchronously via `void logRetrievalExecutionSafely(...)`.
- A failing or slow telemetry insert will not impact the returned `ToolResult<KnowledgeHit[]>`.

### OD-36b: Layer A GUC Strategy (Connection Options vs ALTER ROLE)
- Target GUC values:
  - `hnsw.ef_search = 100`
  - `hnsw.iterative_scan = relaxed_order`
  - `hnsw.max_scan_tuples = 40000`
- Gate condition: If `scripts/check-gucs.ts` detects that Neon's connection pooler strips the URL `options` parameter (`SHOW hnsw.ef_search` returns `40`), Step 3 CANNOT proceed as a simple code cleanup. An `ALTER ROLE neondb_owner SET ...` migration proposal must be escalated for approval.

### OD-36c: Layer B CTE SQL & Fusion Tie-Breaking Semantics
- In-memory `fuseRrf` (`server/src/knowledge/rrf-reranker.ts:14-80`):
  - Iterates dense hits: `score = 1.0 / (60 + rank)`
  - Iterates sparse hits: adds `1.0 / (60 + rank)`
  - Sorts descending: `.sort((a, b) => b.score - a.score)`.
  - In V8 JavaScript, `sort` is stable when scores tie; ties preserve insertion order.
- In PostgreSQL CTE:
  ```sql
  WITH dense AS (
    SELECT 
      c.id, c.version_id, c.domain, c.topic, c.section_path, c.content,
      v.version, v.effective_date,
      (c.embedding <=> $1::vector) AS distance,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1::vector) AS dense_rank
    FROM knowledge_chunks c
    JOIN knowledge_doc_versions v ON c.version_id = v.id
    WHERE c.domain = $2 AND c.topic = $3 AND c.status = 'active'
    ORDER BY c.embedding <=> $1::vector
    LIMIT $4 * 3
  ),
  sparse AS (
    SELECT 
      c.id, c.version_id, c.domain, c.topic, c.section_path, c.content,
      v.version, v.effective_date,
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $5)) AS rank_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $5)) DESC) AS sparse_rank
    FROM knowledge_chunks c
    JOIN knowledge_doc_versions v ON c.version_id = v.id
    WHERE c.domain = $2 AND c.topic = $3 AND c.status = 'active'
      AND c.search_vector @@ websearch_to_tsquery('english', $5)
    ORDER BY rank_score DESC
    LIMIT $4 * 3
  ),
  combined AS (
    SELECT id, 1.0 / (60 + dense_rank) AS rrf_contrib, dense_rank, NULL::bigint AS sparse_rank, distance FROM dense
    UNION ALL
    SELECT id, 1.0 / (60 + sparse_rank) AS rrf_contrib, NULL::bigint AS dense_rank, sparse_rank, NULL::double precision AS distance FROM sparse
  ),
  fused AS (
    SELECT 
      id,
      SUM(rrf_contrib) AS rrf_score,
      MIN(dense_rank) AS dense_rank,
      MIN(sparse_rank) AS sparse_rank,
      MIN(distance) AS distance
    FROM combined
    GROUP BY id
  )
  SELECT 
    c.id, c.version_id AS "versionId", c.domain, c.topic, c.section_path AS "sectionPath", c.content,
    v.version, v.effective_date AS "effectiveDate",
    f.distance,
    f.rrf_score AS "rrfScore",
    f.dense_rank AS "denseRank",
    f.sparse_rank AS "sparseRank"
  FROM fused f
  JOIN knowledge_chunks c ON f.id = c.id
  JOIN knowledge_doc_versions v ON c.version_id = v.id
  ORDER BY f.rrf_score DESC, f.distance ASC NULLS LAST, c.id ASC
  LIMIT $4;
  ```
- **Deterministic Tie-Breaker**: When `rrf_score` ties, ordering is broken by `f.distance ASC NULLS LAST` (favoring the denser hit), followed by `c.id ASC`.

---

## 5. Ordered Steps (Execution)

### Step 1: Telemetry Off the Critical Path
- **Files touched**:
  - `server/src/knowledge/retrieval.ts`
  - `server/src/knowledge/retrieval.test.ts`
- **Actions**:
  1. In `server/src/knowledge/retrieval.ts:158`, change:
     ```typescript
     await logRetrievalExecutionSafely({ ... });
     ```
     to:
     ```typescript
     void logRetrievalExecutionSafely({ ... });
     ```
  2. Verify in `retrieval.test.ts` that:
     - `retrieveKnowledge` resolves successfully even if `logRetrievalExecutionSafely` rejects or hangs.
     - Telemetry executes asynchronously without altering return payload or status.
  3. Re-run `npx tsx scripts/measure-retrieval-latency.ts` to measure isolated recovery (expected: ~222ms p50 reduction).
  4. Run lint, typecheck, tests, and commit: `phase 36 step 1: move retrieval telemetry off critical path`.

### Step 2: Layer A Verification Script (Env-Only, No Code Change)
- **Files touched**:
  - `server/scripts/check-gucs.ts` (new script, zero app changes).
- **Actions**:
  1. Write `server/scripts/check-gucs.ts` to query on a fresh un-configured pool connection:
     - `SHOW hnsw.ef_search;` (expected: `100`)
     - `SHOW hnsw.iterative_scan;` (expected: `relaxed_order`)
     - `SHOW hnsw.max_scan_tuples;` (expected: `40000`)
     - `SELECT extversion FROM pg_extension WHERE extname = 'vector';` (expected: `>= 0.7.0`)
  2. Execute `npx tsx scripts/check-gucs.ts`.
  3. Gate condition: If any parameter does NOT match expected, **STOP and report immediately**. Do not proceed to Step 3.
  4. Commit: `phase 36 step 2: add connection guc verification script`.

### Step 3: Layer A Code Cleanup (After Step 2 Verification Passes)
- **Files touched**:
  - `server/src/persistence/repositories/knowledge.repository.ts`
  - `server/src/knowledge/retrieval.test.ts`
  - New test/fixture: `server/src/knowledge/layer-a-equivalence.test.ts`
- **Actions**:
  1. Capture a 30-query regression fixture verifying current output chunks.
  2. In `searchDenseScoped` (`knowledge.repository.ts:74-97`), remove `db.transaction(...)` and the 3x `SET LOCAL` execution. Replace with an autocommit `db.execute(sql\`...\`)` query matching the sparse search pattern.
  3. Verify that `layer-a-equivalence.test.ts` confirms identical chunk IDs and ranking on the 30-query fixture.
  4. Re-run `npx tsx scripts/measure-retrieval-latency.ts` to document round-trip elimination (expected: Dense branch drops from ~996ms p50 to ~225ms p50).
  5. Run lint, typecheck, tests, and commit: `phase 36 step 3: remove transaction and set local from dense retrieval`.

### Step 4: Layer B — Single-CTE Retrieval (Optional / Gated)
- **Execution Condition**: Execute Step 4 only if Step 3 measured co-located p50 > 20ms (or WAN p50 > 250ms).
- **Files touched**:
  - `server/src/persistence/repositories/knowledge.repository.ts`
  - `server/src/knowledge/retrieval.ts`
  - `server/src/knowledge/layer-b-cte.test.ts`
- **Actions**:
  1. Implement single CTE query `searchHybridScopedCTE` in `knowledge.repository.ts`.
  2. Update `retrieveKnowledge` in `retrieval.ts` to invoke the unified query.
  3. Verify via `layer-b-cte.test.ts` that output rankings match the baseline 30-query fixture.
  4. Re-run `npx tsx scripts/measure-retrieval-latency.ts` to document single-statement performance.
  5. Run lint, typecheck, tests, and commit: `phase 36 step 4: consolidate hybrid retrieval into single cte`.

---

## 6. Functional & Non-Functional Requirements
- **Functional**:
  - Scoped retrieval returns identical top-3 knowledge chunks with identical domain and topic filtering.
  - Telemetry continues to write valid audit rows to `retrieval_executions`.
- **Non-Functional**:
  - **Latency**: End-to-end DB round-trip p50 reduced from 1,223ms to ≤ 250ms over WAN (and ≤ 15ms when co-located).
  - **Connection safety**: Zero un-released connections, autocommit queries avoid transaction lock retention.
  - **Failure resilience**: Failing telemetry writes must never throw or alter retrieval results.

---

## 7. Acceptance Criteria
1. `npm run lint` passes with 0 errors.
2. `npm run typecheck` passes with 0 errors.
3. `npm test` passes with all 741+ tests passing (0 failures).
4. `check-gucs.ts` prints all 4 parameters matching expected targets.
5. Equivalence test proves identical chunk IDs on 30-query fixed sample.
6. `measure-retrieval-latency.ts` confirms p50 reduction.

---

STOP here and request approval.
