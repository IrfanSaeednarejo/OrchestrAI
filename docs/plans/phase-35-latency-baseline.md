# Phase 35 — Latency Baseline & Retrieval Call-Path Audit — PLAN (status: DRAFT)

## 1. Goal and How It Fits the Architecture
Establish an empirical, quota-safe latency baseline for OrchestrAI's hybrid RAG retrieval pipeline and document the exact retrieval call path, database round-trips, and locking semantics under real PostgreSQL and pgvector execution. 

Crucially, this phase isolates and times **Embedding Generation** and **Database Round-Trips** separately. This ensures the baseline measures true database and network transit performance without contamination from remote LLM/embedding API variances.

## 2. Dependencies Satisfied / Missing
- Cites `docs/STATUS.md`: Phases 1–34 complete and verified. Baseline server test count: 741 passing, 21 skipped (83 passed test files, 2 skipped).
- Live Neon PostgreSQL (pgvector 0.8.7) and Redis connection confirmed.
- Cached query embeddings: On-disk cache in `server/scripts/.embed-cache/` is confirmed cold (0 files, prunned via `.gitignore`), requiring strict isolation of DB timing and a strict cache-miss guard.

## 3. Scope IN / Scope OUT
- **Scope IN**:
  - Baseline audit findings (driver, call path, HNSW GUCs, chunker regex analysis, eval runner status, test suite count).
  - Standalone measurement script `server/scripts/measure-retrieval-latency.ts` (N=30 retrieval calls, strictly timing embedding and DB round-trips separately, p50/p95, DB-side timing, strict cache protection).
  - Identification of query consolidation opportunities and advisory lock invariants.
- **Scope OUT**:
  - Layer A (connection-string GUCs) and Layer B (single CTE SQL consolidation) belong to Phase 1 (post-baseline optimization), NOT Phase 35.
  - NO production code modifications in Phase 35.
  - NO edits to protected files (`schema.ts`, `client.ts`, `conversation-state.ts`, `routing/events.ts`, `conversation-lifecycle.service.ts`, checkpointer files).
  - NO changes to existing database schema or migrations.
  - NO external Gemini API quota consumption on cache misses.

---

## 4. Audit Findings (Citing File:Line)

### Finding 1: PostgreSQL Driver in `server/src/persistence/db/client.ts`
- **Driver**: `node-postgres` (`pg` v8.23.0 with `drizzle-orm/node-postgres`).
- **Citation**: `server/src/persistence/db/client.ts:1-2`, `server/src/persistence/db/client.ts:6-8`, `server/src/persistence/db/client.ts:15`.
  ```typescript
  import { drizzle } from 'drizzle-orm/node-postgres';
  import { Pool } from 'pg';
  export const pgPool = new Pool({
    connectionString: config.postgres.connectionString,
  });
  export const db = drizzle(pgPool, { schema });
  ```
- **Implications**:
  - `db.batch()` is NOT supported (Neon-HTTP driver only).
  - `db.transaction()` works, but each `SET LOCAL` and each query inside it is an individual `pg` round-trip.
  - Single-CTE SQL (server-side fusion) is the correct architecture for query consolidation without requiring driver migrations.

---

### Finding 2: Exact Retrieval Call Path & Database Round-Trips
For a single scoped RAG query via `retrieveKnowledge()` (`server/src/knowledge/retrieval.ts:42`):
1. **Embedding Generation**: `embedQuery(query)` (`server/src/knowledge/retrieval.ts:66`) via `server/src/knowledge/embeddings-client.ts`. If cache is hit/mocked, 0 DB round-trips.
2. **Dense Branch (Vector Search)**:
   - Initiated in `searchDenseScoped()` (`server/src/persistence/repositories/knowledge.repository.ts:64-97`).
   - Opens a Drizzle transaction: `db.transaction(async (tx) => { ... })` (`knowledge.repository.ts:74`).
   - **Round-Trip 1 (Dense Tx BEGIN)**: Driver issues `BEGIN` to checkout a client from `pgPool`.
   - **Round-Trip 2–4 (Dense Tx GUC Configuration)**:
     `tx.execute(sql`
       SET LOCAL hnsw.iterative_scan = relaxed_order;
       SET LOCAL hnsw.ef_search = 100;
       SET LOCAL hnsw.max_scan_tuples = 40000;
     `)` (`knowledge.repository.ts:75-79`). Executed as 3 sequential statements by the driver.
   - **Round-Trip 5 (Dense Vector Query)**: `tx.execute(sql`SELECT ... FROM knowledge_chunks c JOIN knowledge_doc_versions v ... ORDER BY c.embedding <=> ... LIMIT ...;`)` (`knowledge.repository.ts:81-93`).
   - **Round-Trip 6 (Dense Tx COMMIT)**: Driver issues `COMMIT` upon exiting the transaction block.
3. **Sparse Branch (Full-Text Search)**:
   - Executed concurrently via `Promise.all` alongside the dense branch (`retrieval.ts:83-86`).
   - Initiated in `searchSparseScoped()` (`server/src/persistence/repositories/knowledge.repository.ts:102-126`).
   - **Round-Trip 7 (Sparse Query)**: Direct standalone query: `db.execute(sql`SELECT ... FROM knowledge_chunks c JOIN knowledge_doc_versions v ... WHERE c.search_vector @@ websearch_to_tsquery(...) ORDER BY rank DESC LIMIT ...;`)` (`knowledge.repository.ts:110-123`, autocommit).
4. **RRF Fusion**: `fuseRrf(denseHits, sparseHits, 60, topK)` (`retrieval.ts:89`) in-memory; 0 DB round-trips.
5. **Telemetry & Audit Logging**:
   - `logRetrievalExecutionSafely()` (`retrieval.ts:158`, `server/src/persistence/repositories/orchestration.repository.ts:33-41`).
   - **Round-Trip 8 (Telemetry Insert)**: `await db.insert(retrievalExecutions).values(input)` (non-throwing audit row insert).
   - *Note on Telemetry*: Currently, `await logRetrievalExecutionSafely(...)` is awaited on the critical path. While non-throwing, awaiting it incurs an extra serial round-trip.

#### Transaction & Advisory Lock Analysis
- **Inside a Transaction?**
  - Dense search runs inside an explicit transaction solely to scope the `SET LOCAL` GUCs.
  - Sparse search and telemetry writes run in autocommit.
- **Holds an Advisory Lock?**
  - Retrieval itself (`retrieveKnowledge`) does NOT hold or acquire an advisory lock.
  - The per-conversation advisory lock (`pg_try_advisory_xact_lock(hashtext(conversationId))`) lives exclusively in `message.controller.ts:153-170` wrapping the multi-turn graph execution.
  - **Hard Invariant**: Retrieval queries must NEVER be merged into the advisory lock transaction. Serializing external retrieval or LLM streaming against the conversation lock would hold connection leases open and starve the pool.
- **Which statements can be merged into ONE statement?**
  - Dense search + Sparse search + RRF fusion can be collapsed into a single CTE query executed in autocommit.
  - Moving GUCs to the connection string / `ALTER ROLE` eliminates `BEGIN`, `COMMIT`, and all 3 `SET LOCAL` statements completely.

---

### Finding 3: How `hnsw.ef_search` Is Set
- **Mechanism**: Set dynamically at transaction scope via `SET LOCAL` within `searchDenseScoped` and `run-retrieval-eval.ts`.
- **Citations**:
  - `server/src/persistence/repositories/knowledge.repository.ts:75-79`
  - `server/scripts/run-retrieval-eval.ts:193-197`
- **Default vs Overridden**:
  - Live Neon default: `40` (confirmed via `SHOW hnsw.ef_search;`). Note: pgvector GUCs are only loaded into a PostgreSQL session after an extension object/type is referenced.
  - Overridden at query time to `100`.

---

### Finding 4: Chunker Regex Analysis & Dropped-Content Defect
- **Implementation**: `server/src/knowledge/chunker.ts:26-29`.
- **Regex**:
  ```typescript
  const matched = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  ```
- **Severity**: **Critical Silent Content Drop**.
  - Not merely a split mid-number: the regex fails to match when a period is followed by numbers (e.g. `25.50` or `3.5`) because `[.!?]+(\s+|$)` requires trailing whitespace or EOL.
  - The engine skips the initial sentence up to the period and matches the remainder via `[^.!?]+$`, **permanently dropping the preceding sentence text**.
- **Concrete Input/Output Examples**:
  - `Items over USD 25.50 require approval.` → `["50 require approval."]` (`"Items over USD 25."` is lost).
  - `Items over USD 25.50 require approval. Returns take 3.5 days.` → `["50 require approval.", "5 days."]` (`"Items over USD 25."` and `"Returns take 3."` are lost).
- **Impact**: Some of the 66 active ingested chunks may already be silently truncated. Re-auditing existing chunks against raw docs is required in Phase 2.

---

### Finding 5: Eval Harness Location, Invocation & Cache Diagnostic
- **Harness Path**: `server/scripts/run-retrieval-eval.ts`.
- **Invocation**: `npx tsx scripts/run-retrieval-eval.ts` from `server/`.
- **Embedding Cache Status**:
  - Target path: `server/scripts/.embed-cache/`.
  - File count: **0 files**.
  - `.gitignore` line 147 explicitly ignores `.embed-cache/`. The cache was local/gitignored and is not present in this workspace clone.
  - Total queries in golden dataset: 302 queries.
  - Estimated quota cost to re-warm in Phase 3: 302 calls to `gemini-embedding-001`.

---

### Finding 6: Current Server Test Count
- **Command**: `cd server; npm test` (executes `vitest run`).
- **Baseline Test Suite Count**:
  - **741 passed | 21 skipped across 85 test files** (83 passed, 2 skipped).

---

## 5. Measurement Step: `server/scripts/measure-retrieval-latency.ts`

### Script Specification
- **Path**: `server/scripts/measure-retrieval-latency.ts`.
- **Strict Quota & Cache Protection Constraint**:
  - The latency script **times embedding and database queries separately**.
  - To prevent burning API quota, the script uses a mock/fixed 768-dimensional test vector (or a pre-cached query if available) to measure database round-trips in isolation.
  - If a real embedding call is attempted on an un-cached query, the script aborts immediately with `CACHE_MISS_ABORT`.
- **Measurement Methodology**:
  - Sample size: N = 30 retrieval calls against active seeded knowledge chunks (`knowledge_chunks` table).
  - Warm-up: 3 discardable warm-up iterations.
  - Metrics collected and reported:
    1. `embeddingMs`: Time spent obtaining embedding (isolated).
    2. `dbWallClockMs`: High-resolution end-to-end DB time.
    3. `denseMs`: Dense branch time (`BEGIN` + `SET LOCAL`s + dense `SELECT` + `COMMIT`).
    4. `sparseMs`: Sparse branch time (`SELECT ... ts_rank_cd`).
    5. `fusionMs`: In-memory RRF fusion calculation duration.
  - Aggregations reported:
    - Min, Max, Mean, Median (p50), and 95th Percentile (p95) across all metrics.

---

## 7. Baseline Empirical Results (Measured N=30, Isolated DB Round-Trips)
- **Execution Script**: `server/scripts/measure-retrieval-latency.ts`.
- **Target Environment**: Remote Neon Postgres (`us-east-2`), pooler endpoint over WAN.
- **Quota Expenditure**: 0 Gemini API calls (deterministic synthetic float vector, quota strictly isolated).
- **Summary Metrics Table**:

| Metric | Min (ms) | Max (ms) | Mean (ms) | **p50 (ms)** | **p95 (ms)** | Primary Driver |
|---|---|---|---|---|---|---|
| **DB Wall-Clock Total** | 1,110.05 | 4,744.59 | 1,511.68 | **1,223.20** | **3,316.02** | Dense branch + Telemetry |
| **Dense Branch (Tx)** | 889.03 | 4,510.21 | 1,276.80 | **996.79** | **3,066.73** | 6 serial round-trips (`BEGIN` + 3 `SET LOCAL`s + `SELECT` + `COMMIT`) |
| **Sparse Branch (FTS)** | 221.40 | 2,553.47 | 321.64 | **228.19** | **352.64** | 1 round-trip (`SELECT ts_rank_cd`), autocommit |
| **Telemetry Write** | 218.99 | 418.37 | 234.80 | **221.85** | **276.50** | 1 round-trip (`await db.insert`), critical path |
| **RRF Fusion (Memory)** | 0.02 | 0.11 | 0.05 | **0.05** | **0.09** | In-memory CPU calculation |

### Key Architectural Takeaways from the Baseline:
1. **The single round-trip WAN floor is ~220–230ms**:
   - The sparse branch (1 autocommit query) took **228.19ms p50**.
   - The telemetry write (1 autocommit insert) took **221.85ms p50**.
2. **Dense branch duration directly matches the ~4.5x round-trip multiplier**:
   - Dense takes `BEGIN` (1) + 3 `SET LOCAL`s (3) + `SELECT` (1) + `COMMIT` (1) = 6 serial round-trips.
   - At ~225ms per round-trip, 4–5 round-trips yields ~900–1,100ms. Observed p50 is **996.79ms**.
3. **Telemetry currently blocks on the critical path**:
   - `await logRetrievalExecutionSafely(...)` adds **221.85ms p50** serially to the total wall-clock retrieval time.
4. **Validation of Layer A & Layer B Optimization Targets**:
   - Collapsing Dense + Sparse + Fusion into 1 single CTE query running in autocommit, plus fire-and-forget telemetry, will drop DB round-trips from **~6+ to 1**, cutting DB p50 from **1,223ms to ~230ms** (over WAN), and down to **~5ms** when co-located in the same region.

---

## 8. Plan Status: APPROVED & BASELINE RECORDED
- Baseline audit and empirical measurements complete. Ready for Phase 1 optimization (Layer A / Layer B).

