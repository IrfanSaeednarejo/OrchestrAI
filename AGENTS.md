# OrchestrAI — Agent Operating Guide

Read this file first, every session, then `PERMISSIONS.md` (what needs the owner's approval). It is short on purpose; details live in `docs/`.

## What this project is
OrchestrAI is a portfolio-grade, stateful multi-agent orchestration platform for autonomous e-commerce customer support
(TypeScript, LangGraph.js, Postgres + pgvector, Redis, Drizzle, Vitest). It is NOT a chatbot. The sophistication lives in
stateful routing, specialist subgraphs, parent handoffs/re-routing, durable state, trace-driven debugging and evaluation.
Infrastructure stays simple. Every decision must be explainable in an interview.

## Read order (do this before planning anything)
1. `docs/STATUS.md`        — where we are and what is next. Single source of truth for progress.
2. `docs/DECISIONS.md`     — locked decisions. Never reverse silently.
3. `docs/ROADMAP.md`       — 19 phases: goals, deliverables, dependencies.
4. `docs/REFERENCE.md`     — tool/verification/RAG matrices and the 14 evaluation scenarios (read when your phase touches them).
5. `docs/OPEN-DECISIONS.md`— unresolved design questions; your plan may need to resolve some.

Do not rebuild context by crawling the codebase when these docs answer the question. DO verify a doc claim against the code
when your plan depends on it, and report any mismatch instead of silently trusting either side.

## Git discipline
- One branch per phase: `phase/NN-name`. Never commit to `main`. One small commit per step, message `phase NN step Y: <what>`.
- Record the baseline test count in STATUS.md at phase start; the count may only go up.
- On phase sign-off the owner merges and tags `phase-NN-done` (a rollback point). Do not merge or tag yourself.
- Every commit must be reported in the step report. No commits outside the reviewed flow.

## Session protocol (permission-driven)
1. ORIENT: read STATUS.md, find the next incomplete phase/step in ROADMAP.md.
2. PLAN: copy `docs/plans/_TEMPLATE.md` to `docs/plans/phase-XX-plan.md` and fill it in. Then STOP and ask for approval.
   Write NO production code before the plan is approved.
3. EXECUTE (after approval): work step by step. After each step: lint, typecheck, test, one small commit.
   Stop immediately on any failure you cannot fix within the step's scope, or on any unplanned architectural decision.
4. REPORT: after each step use `docs/templates/step-report.md`: raw, unabridged output for
   `git diff --stat`, `git status`, `npm run lint`, `npm run typecheck`, `npm test`. No `...` elisions.
5. UPDATE DOCS (part of "done"): STATUS.md, ROADMAP.md checkbox, DECISIONS.md (newly approved decisions), OPEN-DECISIONS.md (move resolved items).

## Approval gates — STOP and ask
- Before any code: the phase plan.
- Any architecturally significant decision: router design, LLM/provider/settings, state shape or reducer changes, handoff payload shape,
  new dependency, schema migration, change to a protected file. Write it as a proposal in OPEN-DECISIONS.md (options, tradeoffs,
  recommendation) and wait for approval. Once approved, record it in DECISIONS.md.
- Small mechanical decisions (naming, test structure, file split): proceed, and list them in your report.
- Always flag genuine problems you notice, even non-blocking or out of scope. Flag + recommend; do not silently fix unrelated things.

## Hard rules (violating these is a defect)
- `server/src/persistence/db/schema.ts` is the single source of truth for tables; never split it.
- Protected files (reducer/infrastructure semantics are load-bearing): `persistence/db/client.ts`, `persistence/checkpointer/{client,setup}.ts`,
  `state/conversation-state.ts`, `routing/events.ts`, `services/conversation-lifecycle.service.ts`. Do not change without approval.
- Never query LangGraph checkpoint tables from app code. Checkpointer `.setup()` is a manual script, never run on boot.
- Nodes emit `ConversationStateUpdate` (the `.Update` type), not `Partial<ConversationState>`; routing updates are `Partial<RoutingState>` only.
- `handoffCount` updates are deltas (e.g. 1), never absolutes. `identity` and `activeWorkflow` are full-object overwrite.
- Only the Account Access specialist may change `identity` (via `state/identity-update.ts`; enforced by ESLint + boundary test).
- Tools never throw; they return `ToolResult`. No tool mutates ConversationState. Specialists get tools only via the gated executor.
- Persist the user message to Postgres BEFORE invoking the graph.
- Never log raw verification codes. Never answer policy questions from model memory when retrieval returns nothing.
- RAG is domain+topic scoped per specialist, never full-corpus. Structured questions use structured queries, not RAG.
- No new infrastructure (Kafka, k8s, extra DBs, vector DBs, observability stacks) without a documented requirement.
- Redis is never in the checkpoint path.

## Environment
- All source paths in docs are relative to server/; docs/, AGENTS.md and PERMISSIONS.md live at the repo root.
- Windows, PowerShell. Repo server dir: `e:\A Coding Folder\OrchestrAI\OrchestrAI\server`.
- Docker runs via WSL2: `wsl docker compose up -d` from the server dir; check with `wsl docker compose ps`.
- Scripts: `npm run lint | typecheck | test | test:watch | format | db:generate | db:migrate | db:seed | checkpointer:setup | knowledge:ingest`.
- Tests hit a real Postgres/Redis; Docker must be up. Embedding client is mocked in tests (never call the real Gemini API in the suite).
- Vitest strips types: always run `npm run typecheck` after final edits.
