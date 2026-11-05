# Phase 14 — Observability & Tracing — PLAN (status: DONE)

## Approvals
- 2026-11-06: Approved by owner in chat ("Approved: COntinue"). OD-14 (LangSmith tracing delivery architecture) approved.

---

## 1. Goal and how it fits the architecture

Integrate production-grade observability and tracing via LangSmith into the OrchestrAI platform, enabling hierarchical tracing across conversation, parent graph, stateful router, specialist subgraph, tool execution, and LLM classification/generation levels.

This ensures full transparent visibility into autonomous agent decision-making, handoff journeys, guard activations, and tool latency, facilitating live trace-driven debugging in the LangSmith dashboard and creating the trace telemetry foundation required by the Phase 15 Evaluation Framework.

---

## 2. Dependencies satisfied / missing

**Satisfied:**
- Phases 1–13 complete and signed off: 428/428 tests passing across 54 files.
- All 6 concrete specialist subgraphs and parent router operational and validated live.
- `langsmith` (`^0.10.3`), `@langchain/core`, and `@langchain/langgraph` installed in `server/package.json`.
- Structured event logging operational in `tool_executions`, `routing_history`, and `agent_executions`.

**Missing:**
- None.

**Branch**: `phase/14-observability-tracing` created off `phase/13-failure-handling` tip (`f7c95bd`).

---

## 3. Scope IN / scope OUT

**Scope IN:**
1. **LangSmith Environment & Configuration (`server/src/shared/config.ts`)**:
   - Optional Zod env configuration: `LANGCHAIN_TRACING_V2` (default: `'false'`), `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT` (default: `'orchestrai'`), `LANGCHAIN_ENDPOINT` (default: `'https://api.smith.langchain.com'`).
   - Ensures local development and automated CI tests run smoothly without requiring real LangSmith credentials.
2. **Standardized Tracing Metadata Contract (`server/src/observability/`)**:
   - Typed metadata structure: `conversationId`, `userId`, `threadId`, `domain`, `specialist`, `intent`, `workflowStatus`, `verificationStatus`, `handoffCount`.
   - Typed tags: environment (`test`, `development`, `production`), agent type, domain tag, guard triggers.
3. **Trace Configuration Factory (`createTraceConfig`)**:
   - Creates LangGraph/LangChain-compatible `RunnableConfig` populated with hierarchical `runName`, `tags`, `metadata`, and optional LangSmith callbacks.
4. **Hierarchical Multi-Level Tracing**:
   - **Conversation / Graph Level**: Run name `OrchestrAI:ParentGraph`, tagged with conversationId and initial intent.
   - **Router Level**: Tracing router node decisions, guard evaluations, and classification latency.
   - **Specialist Level**: Subgraph execution traced with specialist name, active workflow step, and domain.
   - **Tool Level**: Traced with tool name, execution duration, gate decision (`ALLOWED`/`BLOCKED`/`DENIED`), retry count, and success status.
   - **LLM Level**: Structured output generation traced with model name, temperature, and schema validation.
5. **Offline Test Safety**:
   - Automated tests in Vitest verify trace config generation, metadata propagation, and tracer callbacks using in-memory mock collectors — **zero network calls to LangSmith in tests**.

**Scope OUT:**
- Third-party APM tools (Datadog, New Relic, OpenTelemetry collector sidecars) — out of scope.
- Frontend trace visualizer UI (deferred to Phase 18 Platform/Ops UI).
- Real network calls to LangSmith during automated tests.

---

## 4. Open decisions this phase must resolve

### OD-14: LangSmith Tracing Delivery Architecture
- **Options**:
  - *Option A*: Native LangChain/LangGraph tracing integration via `RunnableConfig` (`tags`, `metadata`, `runName`) paired with a centralized `createTraceConfig` factory in `server/src/observability/`. Tracing enabled automatically when `LANGCHAIN_TRACING_V2="true"` and `LANGCHAIN_API_KEY` is present.
  - *Option B*: Standalone OpenTelemetry SDK / Jaeger exporter.
  - *Option C*: Postgres-only logging without LangChain `RunnableConfig` metadata or LangSmith integration.
- **Tradeoffs**: Option A uses the native LangGraph/LangSmith tracing mechanism built into the existing packages (`@langchain/core`, `@langchain/langgraph`, `langsmith`), requires zero extra infrastructure, provides instant interactive tree graphs in LangSmith for portfolio demos, and runs offline safely during tests. Option B introduces heavy unnecessary dependencies. Option C fails the Phase 14 requirement.
- **Recommendation**: Adopt Option A.

---

## 5. Steps (small, ordered)

### Step 1: Optional LangSmith Config & Schema Validation
- **Files touched**:
  - `server/src/shared/config.ts`
  - `server/src/shared/config.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: None.
- **Failure cases**: Missing env vars cause crash (prevented: optional with safe defaults).

### Step 2: Observability Types & Metadata Builder
- **Files touched**:
  - `server/src/observability/types.ts`
  - `server/src/observability/metadata.ts`
- **Protected files affected**: None.
- **State ownership & changes**: None. Pure type contracts and metadata builders.
- **Failure cases**: PII leakage in metadata (prevented: only IDs, status, intent, and sanitized domain labels allowed).

### Step 3: Trace Config Factory & LangSmith Tracer Integration
- **Files touched**:
  - `server/src/observability/tracer.ts`
  - `server/src/observability/observability.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Produces `RunnableConfig` for LangGraph invocations.
- **Failure cases**: External network call in test (prevented: mock tracer callback verifies tags/metadata in memory).

### Step 4: Parent Graph Tracing Integration Test Suite
- **Files touched**:
  - `server/src/graphs/parent/parent-graph-tracing.integration.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Real Postgres, Redis, PostgresSaver checkpointer.
- **Tests**:
  1. Parent graph invocation receives and propagates `RunnableConfig` trace metadata and tags.
  2. Multi-turn handoff correctly updates trace metadata across turns.
  3. Router node decisions and guard outcomes reflect in run metadata.
  4. Tool execution durations and gate outcomes align with trace context.

### Step 5: Docs Close-Out & Sign-Off
- **Files touched**:
  - `docs/STATUS.md`
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md`
  - `docs/OPEN-DECISIONS.md`
  - `docs/plans/phase-14-plan.md`
- **Protected files affected**: None.
- Verification: `npm run lint`, `npm run typecheck`, `npm test` (all 428+ tests green).

---

## 6. Functional requirements

1. `config.ts` cleanly parses optional LangSmith variables: `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`, `LANGCHAIN_ENDPOINT`.
2. `createTraceConfig` produces a fully configured `RunnableConfig` containing:
   - `runName`: e.g. `'OrchestrAI:ParentGraph'`.
   - `tags`: e.g. `['orchestrai', 'env:test', 'domain:orders', 'specialist:order_tracking']`.
   - `metadata`: structured key-value pairs (`conversationId`, `userId`, `threadId`, `intent`, `workflowStatus`, etc.).
3. Child runs within parent graph and subgraphs inherit conversation and user trace metadata.
4. No secrets, passwords, or raw verification codes appear in trace metadata or tags.
5. Offline safety: automated test suites run without attempting external network calls to `api.smith.langchain.com`.

---

## 7. Non-functional requirements

- **Latency**: Metadata construction is synchronous with negligible overhead (<1ms).
- **Safety**: No unhandled exceptions if LangSmith tracing is disabled or network is offline.
- **Testability**: Tracer behavior testable deterministically with Vitest callbacks.

---

## 8. Acceptance criteria

1. Unit tests in `server/src/shared/config.test.ts` verify optional LangSmith env parsing with defaults.
2. Unit tests in `server/src/observability/observability.test.ts` verify:
   - Metadata generation sanitization and validation.
   - Tag generation formatting.
   - `createTraceConfig` returns correct `runName`, `tags`, and `metadata`.
3. Integration tests in `parent-graph-tracing.integration.test.ts` prove:
   - Parent graph accepts and executes with `createTraceConfig`.
   - Trace metadata persists across checkpoints and turns.
   - Zero real API calls made to LangSmith during suite execution.
4. Overall test suite passes with test count >= 428.

---

## 9. Risks and what would make you stop and ask

- If LangSmith SDK requires updating `@langchain/core` or adding new packages not in `package.json` (Tier 2 approval required; currently `langsmith` is already bundled).
- Any proposal to touch protected files (`schema.ts`, `state/conversation-state.ts`, `services/conversation-lifecycle.service.ts`).

---

## 10. Docs to update on completion

- `docs/STATUS.md` — update baseline test count; mark Phase 14 COMPLETE.
- `docs/ROADMAP.md` — tick box 14.
- `docs/DECISIONS.md` — record OD-14 approval.
- `docs/OPEN-DECISIONS.md` — mark OD-14 resolved.
- `docs/plans/phase-14-plan.md` — update status to DONE.

---

Phase 14 completed on 2026-11-06. All 444 tests passing across 56 test files. Ready for merge to main and tag `phase-14-done`.

