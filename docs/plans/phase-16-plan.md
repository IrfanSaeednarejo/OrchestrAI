# Phase 16 — Backend API Layer — PLAN (status: APPROVED)

## Approvals
- 2026-11-06: Approved by owner in chat. OD-7 approved. Custom `AppError` class extending `Error`, `asyncHandler`, global error handling, and modular structure specified.

---

## 1. Goal and how it fits the architecture

Build a robust, production-ready Express.js HTTP API layer for OrchestrAI in `server/src/api/` that exposes conversation lifecycle, multi-turn message handling, routing inspection, and execution trace timeline endpoints to client applications.

The API layer bridges client applications (Phase 17 Customer Chat and Phase 18 Platform/Ops UI) to the LangGraph parent graph, durable PostgreSQL persistence, Redis verification cache, and LangSmith tracing infrastructure. It enforces strict request validation with Zod schemas, provides dual-mode messaging (standard JSON + Server-Sent Events SSE streaming), resolves client identity via `x-user-id` with guest fallback, and reports operational health.

---

## 2. Dependencies satisfied / missing

- **Dependencies satisfied**:
  - Phase 3: `conversation-lifecycle.service.ts` for starting conversations and message persistence.
  - Phase 8: `buildParentGraph` with stateful router, Command(goto) dispatch, and checkpointer.
  - Phase 12: All 6 concrete domain specialists verified end-to-end.
  - Phase 13: Failure handling (loop prevention, handoff cap, terminal ESCALATED state lock, tool retries).
  - Phase 14: Trace metadata, tags, and run config generation (`createTraceConfig`).
  - Phase 15: Evaluation framework and verified baseline of 475 tests.
- **Dependencies missing**:
  - Runtime packages: `express`, `cors` (to be added to `dependencies`).
  - Dev packages: `@types/express`, `@types/cors`, `supertest`, `@types/supertest` (to be added to `devDependencies`).

---

## 3. Scope IN / scope OUT

- **Scope IN**:
  - Express application setup in `server/src/api/app.ts` with CORS, JSON body parser, and global error handling middleware.
  - Server entrypoint in `server/src/api/server.ts` binding to `PORT` (default 3001) with graceful shutdown handling.
  - Middleware:
    - `auth.middleware.ts`: Extracts `x-user-id` header, verifies against PostgreSQL `users` table, and falls back to a guest user session.
    - `validation.middleware.ts`: Generic Zod request validator for params, query, and body emitting typed 400 responses.
    - `error.middleware.ts`: Catches unhandled errors and emits sanitized JSON responses without leaking internal stack traces.
  - Routes and Controllers:
    - `GET /health`: Health check endpoint reporting PostgreSQL, Redis, and API service status.
    - `POST /api/conversations`: Creates a new conversation for the authenticated/guest user.
    - `GET /api/conversations`: Lists conversations for the current user (paginated, latest first).
    - `GET /api/conversations/:id`: Retrieves conversation details and current state metadata.
    - `POST /api/conversations/:id/messages`: Dispatches a message to the conversation.
      - **Dual-mode support**: Emits standard JSON response by default, or streams Server-Sent Events (`text/event-stream`) when requested via `Accept` header.
    - `GET /api/conversations/:id/messages`: Retrieves chronological message history with pagination.
    - `GET /api/conversations/:id/traces`: Retrieves full execution trace timeline (routing decisions, agent executions, tool executions) for the ops visualization.
  - Test suite in `server/src/api/api.test.ts` covering all endpoints, authentication, validation errors, SSE streaming, and graph dispatch using `supertest`.
- **Scope OUT**:
  - No frontend UI code (Next.js chat client is Phase 17; Platform/Ops UI is Phase 18).
  - No WebSocket server (SSE is sufficient for one-directional agent token/status streaming).
  - No OAuth/SSO identity provider integration (mock/header identity via `x-user-id` aligns with existing schema).

---

## 4. Open decisions this phase must resolve

### OD-7: Backend API Architecture & Server Framework
- **Context**: Phase 16 requires exposing REST endpoints to interact with conversations, messages, routing, and execution traces.
- **Option A (Approved by owner in chat)**:
  - Dedicated Express.js REST application in `server/src/api/` with CORS, JSON body parser, Zod validation middleware, dual-mode message responses (standard JSON + Server-Sent Events SSE streaming), and `x-user-id` header validation against Postgres users table with guest fallback.
  - Packages to add: `express`, `cors` in dependencies; `@types/express`, `@types/cors`, `supertest`, `@types/supertest` in devDependencies.
- **Option B**: Fastify application in `server/src/api/`.
- **Option C**: Next.js Route Handlers.
- **Recommendation**: Adopt Option A.

---

## 5. Steps (small, ordered)

### Step 0: Plan & Dependency Approval
- Review and approve `docs/plans/phase-16-plan.md` and OD-7 proposal.
- Install `express`, `cors` and `@types/express`, `@types/cors`, `supertest`, `@types/supertest`.
- Verification: `npm run lint`, `npm run typecheck`.
- Commit: `phase 16 step 0: install express, cors, and supertest dependencies`.

### Step 1: Core App, Middleware, and Health Check
- Create `server/src/api/middleware/auth.middleware.ts` (`x-user-id` validation with guest fallback).
- Create `server/src/api/middleware/validation.middleware.ts` (Zod request validator).
- Create `server/src/api/middleware/error.middleware.ts` (sanitized JSON error handler).
- Create `server/src/api/routes/health.routes.ts` (`GET /health` with Postgres & Redis checks).
- Create `server/src/api/app.ts` (Express app wiring).
- Create unit tests in `server/src/api/health.test.ts`.
- Verification: `npm run lint`, `npm run typecheck`, `npm test -- src/api/health.test.ts`.
- Commit: `phase 16 step 1: express app setup, middleware, and health check endpoint`.

### Step 2: Conversation Lifecycle & History Endpoints
- Create `server/src/api/routes/conversation.routes.ts`:
  - `POST /api/conversations`: start conversation via `startConversation(userId)`.
  - `GET /api/conversations`: list conversations for authenticated user.
  - `GET /api/conversations/:id`: get conversation details and metadata.
  - `GET /api/conversations/:id/messages`: get message history.
- Create unit/integration tests in `server/src/api/conversations.test.ts`.
- Verification: `npm run lint`, `npm run typecheck`, `npm test -- src/api/conversations.test.ts`.
- Commit: `phase 16 step 2: conversation lifecycle and message history endpoints`.

### Step 3: Message Dispatch Endpoint (Dual-Mode: JSON & SSE Streaming)
- Create `server/src/api/controllers/message.controller.ts`:
  - Validates conversation exists and belongs to user.
  - Persists human message to Postgres via `appendMessage` BEFORE invoking the parent graph (hard rule).
  - JSON mode: invokes `parentGraph.invoke(...)` with checkpointer and trace config, returns assistant message, routing status, workflow status, and token usage.
  - SSE mode (`Accept: text/event-stream`): streams `streamEvents` (`on_chat_model_stream`, routing decision, status updates) and closes with `event: done`.
  - Handles terminal `ESCALATED` conversation locks safely.
- Create tests in `server/src/api/messages.test.ts` validating both JSON and SSE streaming behaviors.
- Verification: `npm run lint`, `npm run typecheck`, `npm test -- src/api/messages.test.ts`.
- Commit: `phase 16 step 3: dual-mode message dispatch endpoint with SSE streaming`.

### Step 4: Execution Trace Timeline Endpoint & Server Entrypoint
- Create `server/src/api/routes/trace.routes.ts`:
  - `GET /api/conversations/:id/traces`: aggregates `routingHistory`, `agentExecutions`, and `toolExecutions` into a chronological timeline for the ops UI.
- Create `server/src/api/server.ts` entrypoint with graceful shutdown on `SIGTERM`/`SIGINT`.
- Create comprehensive API integration test suite `server/src/api/api.integration.test.ts`.
- Verification: `npm run lint`, `npm run typecheck`, `npm test`.
- Commit: `phase 16 step 4: trace timeline endpoint and server entrypoint`.

### Step 5: Docs Close-Out & Sign-Off
- Update `docs/STATUS.md` (baseline test count >= 475+).
- Update `docs/ROADMAP.md` (tick box 16).
- Update `docs/DECISIONS.md` (record OD-7 approval and Express API architecture).
- Update `docs/OPEN-DECISIONS.md` (mark OD-7 resolved).
- Update `docs/plans/phase-16-plan.md` (set status to DONE).
- Verification: Full suite verification `npm run lint && npm run typecheck && npm test`.
- Commit: `phase 16 step 5: update docs for phase 16 close-out`.

---

## 6. Functional requirements

1. `POST /api/conversations`: Accepts optional title and metadata, returns new conversation record.
2. `GET /api/conversations`: Returns array of conversations for caller's `userId`.
3. `POST /api/conversations/:id/messages`:
   - Persists user message before graph execution.
   - Dispatches state to LangGraph parent graph with thread checkpointing.
   - Returns assistant message, current specialist, handoff count, and workflow status.
   - When `Accept: text/event-stream` is requested, streams SSE events in real-time.
4. `GET /api/conversations/:id/messages`: Returns paginated chronological message list.
5. `GET /api/conversations/:id/traces`: Returns chronological array of routing decisions, agent executions, and tool executions.
6. `GET /health`: Returns 200 OK with status of API, PostgreSQL, and Redis.

---

## 7. Non-functional requirements

- **Security & Privacy**: All inputs validated via Zod schemas. Error messages sanitized to never leak stack traces, database credentials, or verification secrets.
- **Durable State**: Checkpointed state in PostgreSQL is the single source of truth across requests.
- **Performance**: SSE streaming responds with initial chunk within 200ms; JSON requests complete promptly.
- **Graceful Shutdown**: Server drains active HTTP connections and closes database pools cleanly on termination signals.

---

## 8. Acceptance criteria

1. All endpoints return appropriate HTTP status codes (200, 201, 400 for validation errors, 401 for invalid auth, 404 for missing conversations, 500 for internal errors).
2. SSE streaming emits properly formatted `data: {...}\n\n` frames and terminates cleanly with `event: done`.
3. User message is persisted to the database before the parent graph invocation begins.
4. Escalated conversations return the escalation response without calling the classification LLM.
5. Baseline test count increases from 475 to >= 495+ passing tests.
6. `npm run lint`, `npm run typecheck`, and `npm test` pass with 0 errors.

---

## 9. Risks and what would make you stop and ask

- Adding runtime packages (`express`, `cors`) requires Tier 2 approval (included in this plan approval).
- Touching protected files (`schema.ts`, `state/conversation-state.ts`, `services/conversation-lifecycle.service.ts`).
- Any attempt to bypass the checkpointer or persist user messages out-of-order.

---

## 10. Docs to update on completion

- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/OPEN-DECISIONS.md`
- `docs/plans/phase-16-plan.md`

---

STOP here and request approval.

