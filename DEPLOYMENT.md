# OrchestrAI RAG Pipeline — Deployment Guide

## Prerequisites
- Docker + WSL2 running (`wsl docker compose ps` should show `postgres` and `redis` healthy)
- `GEMINI_API_KEY` set in `server/.env`
- `npm ci` run in `server/`

## CI Gates
| Gate | Job | Trigger | Pass Criteria |
|------|-----|---------|---------------|
| 1 | `pr-unit-gate` | Every PR touching `server/src/knowledge/**` | Lint, typecheck, chunker + RRF unit tests pass |
| 2 | `vector-integration-gate` | Same PR trigger | `rag-retrieval.test.ts` 127/127 pass against ephemeral Postgres |
| 3 | `nightly-smoke-gate` | `schedule: 02:00 UTC` | Live `gemini-embedding-001` endpoint returns 768-dim vector |

> **Note:** Gate 2 wall-clock ≈ 90 s. See `MIGRATION.md` CI Duration Note for rate-limit guidance.

## Deployment Steps (manual, operator-executed)

### Step 1 — Run migrations
```bash
cd server
npm run db:migrate
```
Verify `page_number` column was added:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'knowledge_chunks' AND column_name = 'page_number';
```
Expected: `page_number | integer | 0`

### Step 2 — Generate PDFs (if markdown sources changed)
```bash
cd server
npx tsx scripts/generate-policy-pdfs.ts
```

### Step 3 — Ingest knowledge base
```bash
cd server
NODE_ENV=production npm run knowledge:ingest -- --dir ../docs/knowledge-base
```
Expected: 5 PDFs, 14 chunks, `Embeddings Reused: 14` on re-run (idempotent).

Optional dry-run first to estimate cost:
```bash
npm run knowledge:ingest -- --dir ../docs/knowledge-base --dry-run
```

### Step 4 — Smoke retrieval
```bash
cd server
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({ query: 'return window', domains: ['orders'], topics: ['returns'] });
console.log('success:', r.success, 'hits:', r.success ? r.data.length : 0);
if (r.success && r.data[0]) console.log('top section:', r.data[0].sectionPath);
"
```
Expected: `success: true  hits: 3  top section: Return Eligibility` (or similar H2 heading).

### Step 5 — Cross-domain scope guard (expect 0 hits)
```bash
cd server
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({ query: 'return window', domains: ['payments'], topics: ['returns'] });
console.log('cross-domain hits:', r.success ? r.data.length : 'error');
"
```
Expected: `cross-domain hits: 0`

## Legacy Table Drop — Migration Plan (DO NOT EXECUTE YET)

Migration file `server/drizzle/migrations/0014_drop_knowledge_documents.sql` is **authored but not applied**.

Apply only after completing the following checklist:
1. All specialists operate on the PDF pipeline for ≥ 1 full week without incident.
2. `knowledge_documents` query count drops to 0:
   ```sql
   SELECT seq_scan, idx_scan FROM pg_stat_user_tables WHERE relname = 'knowledge_documents';
   ```
3. Backup taken:
   ```bash
   pg_dump -t knowledge_documents orchestrai_prod > kb_docs_backup_$(date +%Y%m%d).sql
   ```
4. Apply migration:
   ```bash
   cd server && npm run db:migrate
   ```
5. Rollback if needed:
   ```bash
   psql orchestrai_prod < kb_docs_backup_YYYYMMDD.sql
   ```

See `MIGRATION.md` Step 7 for the full deprecation rationale.

## Large-Document Benchmark (optional)

Generate a synthetic large-doc fixture and run the benchmark:
```bash
cd server
npx tsx scripts/generate-large-doc-pdf.ts
LOG_EMBEDDING_CALLS=1 LOG_PEAK_RSS=1 npx tsx scripts/benchmark-large-pdf.ts
```

Targets (informational, not gates):
| Metric | Target |
|--------|--------|
| Ingest wall-time | < 60 s |
| Peak RSS | < 500 MB |
| Chunk count | > 30 |
| p50 retrieval latency | < 500 ms |
| p95 retrieval latency | < 1000 ms |
