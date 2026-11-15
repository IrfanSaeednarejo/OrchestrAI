# Phase 17 — Next.js Frontend Foundation & Customer Chat UI — PLAN (status: APPROVED)

## Approvals
- Approved by owner with amendments A1–A6.
- Baseline test count to preserve: 524 passing (63 files) in `server/`. All phases through Phase 16 are signed off in `docs/STATUS.md` and `docs/DECISIONS.md`.
- Acceptance requirement: server tests all pass, count >= 524 + new Phase 16 amendment tests.

---

## 0. Verification Baseline & Architectural Findings

Prior to implementation, the following architectural points were verified against the codebase:

1. **`auth.middleware.ts` Behavior**:
   - Absent `x-user-id` header (`rawUserId === undefined`): falls back automatically to guest identity via `getOrCreateGuestUser()`, assigning `req.user = { ...guestUser, isGuest: true }`.
   - Note on Guest Session Pool: All header-less callers resolve to `DEFAULT_GUEST_USER_ID = '00000000-0000-4000-a000-000000000001'` and share the same guest conversation pool (documented and accepted demo limitation).
   - Unknown `x-user-id` (syntactically valid UUID not found in `users` table): throws `NotFoundError` (`HTTP 404: User with id "<uuid>" not found`).
   - Malformed `x-user-id` (not a valid UUID): throws `BadRequestError` (`HTTP 400: Invalid x-user-id header: must be a valid UUID`).
2. **`seed.ts` Guest User Recreation**:
   - `seed.ts` wipes the database and creates Alice, Bob, Charlie, and Dave.
   - It does **not** recreate `DEFAULT_GUEST_USER_ID`. The guest user record is created on-demand by `getOrCreateGuestUser()` upon the first guest request.
3. **Account Access Node Reply Text & `currentStep` (Amendment A1)**:
   - When issuing a verification code in `server/src/agents/specialists/account-access/account-access.ts` (lines 404 & 408), Account Access explicitly writes:
     `activeWorkflow.currentStep = 'verify_identity'`
     `activeWorkflow.blockedBy = 'VERIFICATION_FULL'`
   - The reply text is:
     `"To proceed, we need to verify your identity. A 6-digit verification code has been sent to your email. Please enter the code when you receive it."`
   - The reply text **does not contain the OTP code**. The code is stored strictly in Redis under `verify:${userId}` with a 600-second TTL (10 minutes, as declared in `server/src/services/verification.service.ts` line 14: `TTL_SECONDS = 600`).
   - Telemetry extension: both `blockedBy` and `currentStep` will be exposed in assistant message metadata, SSE `routing` event, and JSON response.
   - Client OTP mask rule: user message is rendered cosmetically as `••••••` if and only if the text is exactly 6 digits (`/^\d{6}$/`) AND the immediately preceding assistant message had a non-null `blockedBy`.
4. **`graph.stream()` Chunk Keys**:
   - Verified live with LangGraph: `graph.stream()` defaults to `streamMode: 'updates'`, yielding dictionaries keyed by executing node names (`['router']`, `['order_tracking']`). Step 1b explicitly specifies `streamMode: 'updates'` for contract clarity.
5. **Existing Phase 16 SSE Test Assertions**:
   - Existing tests in `server/src/api/messages.test.ts` (line 267) and `server/src/api/api.integration.test.ts` (line 197) assert only `event: start`, `event: done`, and `"success":true`. Neither test asserts node names.

---

## 1. Goal and how it fits the architecture

Build the customer-facing chat frontend in `client/` (Next.js 14 App Router, TypeScript, Tailwind CSS) that interfaces directly with the OrchestrAI Express backend (`server/src/api/`), alongside scoped backend amendments (Phase 16 amendments, Steps 1a–1c) ensuring strict cross-user authorization, robust SSE abort handling, and explicit state telemetry.

The frontend exposes the multi-agent orchestration engine to customers in real time. It renders streaming responses via Server-Sent Events (SSE), provides live node-progress indicators and typing feedback, enforces double-send prevention and workflow status locks (`ESCALATED`), handles multi-turn OTP verification (Pattern C), and includes a dev-gated demo identity switcher resolving seed users dynamically by email.

---

## 2. Dependencies satisfied / missing

- **Dependencies satisfied (from `docs/STATUS.md` and `docs/ROADMAP.md`)**:
  - Phase 16 complete: Express REST API running on port 3001 with CORS, Zod validation, `x-user-id` auth, and health check.
  - Phase 16 Step 2: Conversation lifecycle endpoints (`POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id`, `GET /api/conversations/:id/messages`).
  - Phase 16 Step 3: Dual-mode message dispatch endpoint (`POST /api/conversations/:id/messages`) supporting JSON and SSE streaming (`Accept: text/event-stream`).
  - Phase 16 Step 4: Trace timeline endpoint (`GET /api/conversations/:id/traces`).
  - Backend test baseline: 524/524 passing tests across 63 test files.
- **Dependencies missing**:
  - `client/` workspace initialization (Next.js 14.2.35 App Router, React 18, TypeScript, Tailwind CSS, pinned dependencies).
  - Client-side frontend guidelines document (`client/AGENTS.md`).

---

## 3. Scope IN / scope OUT

- **Scope IN (Phase 17)**:
  - **Step 1a: Authorization, Ownership & CORS Configuration**:
    - Shared ownership authorization helper (`assertConversationOwnership`) eliminating duplicate checks; guest owns strictly guest conversations (no fail-open).
    - Strict 403 test matrix: Guest receives 403 on `GET /:id`, `GET /:id/messages`, `GET /:id/traces`, `POST /:id/messages` (JSON), and `POST /:id/messages` (SSE) for User A's conversation; User B receives 403 on User A's conversation across all 5 endpoints.
    - CORS locking: add `CLIENT_ORIGIN: z.string().url().default('http://localhost:3000')` to `server/src/shared/config.ts` envSchema, export `config.app.clientOrigin`, update `config.test.ts` and `.env.example`. Lock `cors({ origin: config.app.clientOrigin })` without `credentials: true`.
  - **Step 1b: Message Controller Extraction, Abort Resilience & Telemetry**:
    - Turn-scoped message extraction: `HumanMessage` instantiated with explicit UUID `id`. Take only messages of type `'ai'` produced *after* this human message ID. If several, persist and return the last non-empty; if none, do not persist to DB, emit an SSE error event (`event: error`), or return 502 Bad Gateway in JSON mode. Orphan user row is accepted.
    - SSE connection abort resilience: listen to `res.on('close')`. On disconnect, drain the stream iterator to completion without breaking early; skip writes only. Persist assistant message once, never duplicate. Test that checkpointer contains the completed turn after abort.
    - Explicit `streamMode: 'updates'` passed to `graph.stream()`.
    - Expose `blockedBy` and `currentStep` in assistant message metadata, SSE `routing` event, and JSON response.
  - **Step 1c: Dev-Gated Demo & Verification Endpoints**:
    - `ENABLE_DEMO_ENDPOINTS`: parsed with `z.enum(['true', 'false']).default('false').transform(v => v === 'true')` (NOT `z.coerce.boolean`). If `NODE_ENV === 'production'`, hard-off (`false`) regardless of env var. Startup warning logged when enabled. `.env.example` has `ENABLE_DEMO_ENDPOINTS=false`.
    - `peekVerificationCode(userId: string): Promise<string | null>` added to `verificationService` in `server/src/services/verification.service.ts` (calls `connectRedis`, returns code only).
    - Dev routes mounted outside `x-user-id` middleware:
      - `GET /api/demo-users`: returns dynamic seed users by email (`alice@example.com`, `bob@example.com`, `charlie@example.com`, `dave@example.com`) and guest. Returns existing users gracefully; 404 when disabled/production.
      - `GET /api/dev/verification-code`: returns Redis code for given `userId`; 404 when disabled/production.
  - **Step 2: Client Workspace & AGENTS.md**:
    - Pinned Next.js 14.2.35 setup with React 18, TypeScript, Tailwind CSS. Every version verified with `npm view` before install.
    - Documented audit exceptions in `DECISIONS.md`.
    - `client/AGENTS.md` specifying frontend boundaries, testing patterns, and strict security rules.
  - **Step 3: Types, API Client & Strict SSE Consumer**:
    - Real response type shapes matching backend (`timestamp: string` for messages, wrapped responses, optional `blockedBy` and `currentStep` in metadata).
    - `WorkflowStatus` union: `'ACTIVE' | 'WAITING_FOR_USER_INPUT' | 'BLOCKED' | 'COMPLETED' | 'ESCALATED' | 'FAILED'` (no `'IN_PROGRESS'`).
    - API client checking `res.ok` and `Content-Type: text/event-stream` before SSE parsing. No transparent JSON fallback after request is sent.
    - SSE test coverage: frames split across chunk boundaries, CRLF (`\r\n`) line endings, and error event after stream start.
  - **Step 4: Demo Identity Context**:
    - Resolve seed users by email dynamically: Alice (Scenarios 1, 5), Bob (Scenario 2), Charlie (Scenario 3 - payment duplicate), Dave (Returns), plus Guest.
    - Switching identity clears active conversation, resets local state, and starts fresh. Labelled *"Demo identity, not authentication"*.
  - **Step 5a: Markdown Renderer & Message Input Components**:
    - `MarkdownRenderer`: safe rendering with `remark-gfm`, denies raw HTML, neutralizes `javascript:` URLs, forces `rel="noopener noreferrer"`, replaces remote images with link (never auto-loads), user messages plain text.
    - `MessageInput`: auto-growing textarea, submit lock, input disabled ONLY on `ESCALATED`.
  - **Step 5b: Conversation Sidebar & Specialist Badge Components**:
    - `ConversationSidebar`: conversation list, "+ New Chat" button, relative timestamps.
    - `SpecialistBadge`: visual indicator tolerating unknown `currentAgent` values with neutral fallback, handoff notice.
  - **Step 5c: Chat Feed & Verification Hint Components**:
    - `ChatFeed`: message bubbles, cosmetic `••••••` mask for 6-digit OTP user messages strictly when preceded by assistant message with non-null `blockedBy`, live node-progress indicator, typing indicator.
    - `VerificationPrompt`: neutral banner when `blockedBy === 'VERIFICATION_FULL'`, 6-digit OTP prompt only after code issued (`currentStep === 'verify_identity'`), dev code badge via OD-19.
  - **Step 6a: Chat State Machine, Reducer & Ref Guard**:
    - Pure reducer + `useChat` hook, synchronous `useRef` double-send guard.
    - State restored on conversation switch/reload from last assistant message metadata (validated via Zod, defaulting to `ACTIVE`).
    - Workflow status locks: `ESCALATED` permanently locks input; `COMPLETED` shows turn resolution with optional "New Chat"; `FAILED` shows recoverable error with retry.
  - **Step 6b: Master Chat Page Assembly**:
    - Master responsive layout (`page.tsx`, `layout.tsx`) combining sidebar, header, demo identity switcher, chat feed, and input bar.
  - **Step 7: Verification Script, Manual Runbook & Docs Close-Out**:
    - Cross-workspace verification script `scripts/verify.ps1` failing fast on error and propagating `$LASTEXITCODE`.
    - Executable manual test runbook `docs/manual-tests/phase-17-verification.md` for REFERENCE Scenarios 1, 3, and 5.
    - Update `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`.

- **Scope OUT (deferred to Phase 18 & 19)**:
  - Execution timeline viewer & trace viewer (`/api/conversations/:id/traces`) &rarr; **Phase 18**.
  - Routing decision graph & handoff inspector &rarr; **Phase 18**.
  - Evaluation benchmark scorecard dashboard &rarr; **Phase 18**.
  - Production OAuth / JWT auth providers &rarr; Out of core scope.
  - Production Docker multi-container deployment &rarr; **Phase 19**.

---

## 4. Open decisions & proposals

### OD-16: Frontend Architecture, Stack & Pinned Dependencies (Tier 2)
- **Recommendation**: Adopt Next.js 14.2.35, React 18, TypeScript, Tailwind CSS, Lucide icons, `react-markdown` + `remark-gfm` (without `rehype-raw`), Vitest, and React Testing Library.
- **Audit Gate**: Document allowed exception list in `DECISIONS.md` for any upstream advisory on Next 14 transitive packages that cannot be resolved without breaking Next.js.
- **Dependency verification**: Every version verified via `npm view` before installation.
- **Pinned Dependencies (`client/package.json`)**:
  - `dependencies`:
    - `next`: `14.2.35`
    - `react`: `18.3.1`
    - `react-dom`: `18.3.1`
    - `lucide-react`: `0.460.0`
    - `react-markdown`: `9.0.1`
    - `remark-gfm`: `4.0.0`
    - `clsx`: `2.1.1`
    - `tailwind-merge`: `2.5.5`
  - `devDependencies`:
    - `typescript`: `5.6.3`
    - `@types/react`: `18.3.12`
    - `@types/react-dom`: `18.3.1`
    - `@types/node`: `20.17.6`
    - `tailwindcss`: `3.4.15`
    - `postcss`: `8.4.49`
    - `autoprefixer`: `10.4.20`
    - `vitest`: `2.1.5`
    - `@testing-library/react`: `16.0.1`
    - `@testing-library/dom`: `10.4.0`
    - `@testing-library/user-event`: `14.5.2`
    - `@testing-library/jest-dom`: `6.6.3`
    - `@vitejs/plugin-react`: `4.3.4`
    - `jsdom`: `25.0.1`
    - `eslint`: `8.57.1`
    - `eslint-config-next`: `14.2.35`

### OD-17: Verification Code Handling & Storage (Locked Resolution)
- **Decision**: Adopt Option A (explicitly accept plain code storage in database user message, document as architectural exception) paired with cosmetic rendering mask:
  - *Storage*: User message is persisted verbatim as a normal message (`content: "123456"`). The code in Redis has a 600-second TTL (10 minutes, per `server/src/services/verification.service.ts` line 14: `TTL_SECONDS = 600`) and is invalidated upon verification or after 5 attempts.
  - *UI Cosmetic Mask*: In `ChatFeed`, if a user message is exactly 6 digits (`/^\d{6}$/`) AND the immediately preceding assistant message had a non-null `blockedBy`, it is displayed cosmetically as `••••••`.
  - *Known Limitation on Manual Retry*: A manual retry re-POSTs the user message, creating a second user row in Postgres and re-invoking the graph. In Phase 17, the UI replaces the failed bubble with the retry attempt; request idempotency keys are documented as a deferred decision for Phase 19.

### OD-18: CORS Configuration & Client Origin Locking
- **Decision**: Add `CLIENT_ORIGIN: z.string().url().default('http://localhost:3000')` to `server/src/shared/config.ts` envSchema. Export `config.app.clientOrigin`. Update `server/src/shared/config.test.ts` and `.env.example`. Lock `app.use(cors({ origin: config.app.clientOrigin }))` without `credentials: true`.

### OD-19: Dev-Only OTP Verification Code Delivery Endpoint
- **Decision**: Add a dev-gated endpoint `GET /api/dev/verification-code?userId=<uuid>`:
  - Unauthenticated, dev-gated: returns 404 if `config.env === 'production'` or `!config.app.enableDemoEndpoints`.
  - Uses `verificationService.peekVerificationCode(userId)` (which connects Redis and returns code only, never exposing raw Redis client).
  - When `NEXT_PUBLIC_ENABLE_DEMO_CODE=true` in frontend `.env.local`, `VerificationPrompt` fetches this endpoint and displays an inline helper badge: *"Dev OTP: 123456"*.

---

## 5. Steps (Small, Ordered)

### Step 1a: Ownership Helper, 403 Matrix & CORS Configuration
- **Files touched**:
  - `server/src/api/utils/auth-helpers.ts` (new): shared `assertConversationOwnership(conversation, callerUser)` helper ensuring guest owns ONLY guest conversations and caller matches owner. No fail-open.
  - `server/src/api/controllers/conversation.controller.ts`: use shared ownership helper in `getConversationHandler` and `getConversationMessagesHandler`.
  - `server/src/api/controllers/message.controller.ts`: use shared ownership helper in `sendMessageHandler`.
  - `server/src/api/controllers/trace.controller.ts`: use shared ownership helper in `getTraceHandler`.
  - `server/src/shared/config.ts`: add `CLIENT_ORIGIN: z.string().url().default('http://localhost:3000')` to envSchema; export in frozen `config.app.clientOrigin`.
  - `server/src/shared/config.test.ts`: test `config.app.clientOrigin`.
  - `server/.env.example`: add `CLIENT_ORIGIN=http://localhost:3000`.
  - `server/src/api/app.ts`: lock CORS origin to `config.app.clientOrigin` (no `credentials: true`).
  - `server/src/api/conversations.test.ts`: test Guest and User B receiving 403 on `GET /:id` and `GET /:id/messages`.
  - `server/src/api/messages.test.ts`: test Guest and User B receiving 403 on `POST /:id/messages` (JSON and SSE).
- **Acceptance**: All server tests pass; count >= 524 + new Step 1a tests.
- **Commit**: `phase 17 step 1a: shared ownership helper, 403 test matrix, and cors origin locking`.

### Step 1b: Message Controller Extraction, Abort Resilience & Telemetry
- **Files touched**:
  - `server/src/api/controllers/message.controller.ts`:
    - Turn-scoped message extraction: `HumanMessage` given explicit UUID `id`. Extract only `'ai'` messages produced *after* this ID. Return/persist last non-empty; if none, do not persist to DB; emit SSE error event or return 502 Bad Gateway in JSON mode. Document orphan user row as accepted.
    - SSE abort: listen to `res.on('close')`. Drain stream iterator to completion without `break`, skipping writes. Persist assistant message once.
    - Pass `streamMode: 'updates'` explicitly to `graph.stream(...)`.
    - Expose `blockedBy` and `currentStep` in assistant message metadata, SSE `routing` event, and JSON response.
  - `server/src/api/messages.test.ts`:
    - Aborted-request test using `AbortController` (verifies graph finishes, checkpoint contains completed turn, message persisted once without duplicates).
    - Test empty assistant response handling (502 in JSON, error event in SSE, zero DB persistence) using stub graph via `req.app.locals.graph`.
    - Test `blockedBy` and `currentStep` presence in metadata, SSE routing event, and JSON response.
- **Acceptance**: All server tests pass; count >= Step 1a + new Step 1b tests.
- **Commit**: `phase 17 step 1b: turn-scoped message extraction, sse abort drain, and telemetry fields`.

### Step 1c: Dev-Gated Demo & Verification Endpoints
- **Files touched**:
  - `server/src/services/verification.service.ts`: add `peekVerificationCode(userId: string): Promise<string | null>`.
  - `server/src/services/verification.service.test.ts`: unit test for `peekVerificationCode`.
  - `server/src/shared/config.ts`: add `ENABLE_DEMO_ENDPOINTS: z.enum(['true', 'false']).default('false').transform(v => v === 'true')` to envSchema; if `NODE_ENV === 'production'`, force `false`. Export `config.app.enableDemoEndpoints`. Add startup console warning when `true`.
  - `server/src/shared/config.test.ts`: test `enableDemoEndpoints` flag behavior (default false, parse transform, production hard-off).
  - `server/.env.example`: add `ENABLE_DEMO_ENDPOINTS=false`.
  - `server/src/api/routes/demo.routes.ts` & `server/src/api/app.ts` (new routes mounted outside `authMiddleware`):
    - `GET /api/demo-users`: returns seed users by email (`alice@example.com`, `bob@example.com`, `charlie@example.com`, `dave@example.com`) and guest. Returns existing users gracefully; 404 when disabled/production.
    - `GET /api/dev/verification-code`: returns code from `verificationService.peekVerificationCode`; 404 when disabled/production.
  - `server/src/api/demo.test.ts` (new): tests for flag off (404), production mode (404), flag on (returns users, handles missing seed user, returns OTP code).
- **Acceptance**: All server tests pass; count >= Step 1b + new Step 1c tests.
- **Commit**: `phase 17 step 1c: dev-gated demo users and verification code endpoints`.

### Step 2: Client Workspace Initialization & Frontend Rules
- **Files touched**:
  - Pinned version verification: verify every version using `npm view` before writing `package.json`.
  - `client/package.json`: pinned dependencies (Next 14.2.35, React 18.3.1, Tailwind 3.4.15, Vitest 2.1.5, RTL 16.0.1, `@testing-library/dom` 10.4.0, `@testing-library/user-event` 14.5.2, `@vitejs/plugin-react` 4.3.4, `remark-gfm` 4.0.0).
  - `client/tsconfig.json`, `client/next.config.mjs`, `client/tailwind.config.ts`, `client/postcss.config.js`.
  - `client/vitest.config.ts`: Vitest configuration with jsdom, `@vitejs/plugin-react`, and setup files.
  - `client/AGENTS.md`: frontend guidelines, component structure, state rules, security prohibitions (no raw HTML).
- **Run**: `npm audit` in `client/` checked against `DECISIONS.md` exception list; verify `npm run lint` and `npm run typecheck`.
- **Commit**: `phase 17 step 2: initialize client workspace with pinned dependencies and agent guide`.

### Step 3: Types, API Client & Strict SSE Consumer
- **Files touched**:
  - `client/src/types/api.ts`: real backend shapes (`Conversation`, `Message` with `timestamp: string`, `WorkflowStatus = 'ACTIVE' | 'WAITING_FOR_USER_INPUT' | 'BLOCKED' | 'COMPLETED' | 'ESCALATED' | 'FAILED'`, `DemoUser`). Optional `blockedBy` and `currentStep` in message metadata.
  - `client/src/types/sse.ts`: SSE event shapes (`start`, `node`, `message`, `routing` with optional `blockedBy` and `currentStep`, `done`, `error`).
  - `client/src/lib/api-client.ts`:
    - Checks `res.ok` and `Content-Type: text/event-stream` before SSE parsing.
    - No transparent JSON fallback after request is sent. If response is non-SSE or fails, throw error, refetch conversation messages, and prompt manual retry.
    - Full abort signal support; handles disconnect without duplicate message emission.
  - `client/src/lib/api-client.test.ts`: unit tests covering:
    - Normal SSE event stream parsing.
    - SSE frames split across chunk boundaries.
    - CRLF (`\r\n`) line endings.
    - Error event received after stream has started.
    - Non-2xx responses and abort handling.
    - Conversation refetch on stream completion.
- **Commit**: `phase 17 step 3: implement type contracts and robust sse api client`.

### Step 4: Demo Identity Context & Scenario Mapping
- **Files touched**:
  - `client/src/context/user-context.tsx`: fetches `/api/demo-users` on mount, resolves users by email:
    - Alice (`alice@example.com`): Orders (Scenarios 1, 5)
    - Bob (`bob@example.com`): Ambiguous orders (Scenario 2)
    - Charlie (`charlie@example.com`): Payments duplicate (Scenario 3)
    - Dave (`dave@example.com`): Returns (Scenarios 6, 9)
    - Guest: Unauthenticated session
  - Identity switcher clears conversation list and active conversation upon change.
  - Header displays *"Demo identity, not authentication"*.
  - `client/src/context/user-context.test.tsx`: tests switching behavior and conversation cache eviction.
- **Commit**: `phase 17 step 4: implement dynamic demo identity context and scenario mapping`.

### Step 5a: Markdown Renderer & Message Input Components
- **Files touched**:
  - `client/src/components/MarkdownRenderer.tsx`: renders Markdown with `remark-gfm`, disables raw HTML, sanitizes `javascript:` URLs, forces `rel="noopener noreferrer"` on external links, replaces remote images with `[Image: alt](url)` link (never auto-loads).
  - `client/src/components/MarkdownRenderer.test.tsx`: test suite verifying rejection of raw HTML/scripts, `javascript:` link neutralization, external link attributes, and remote image link conversion.
  - `client/src/components/MessageInput.tsx`: auto-growing textarea, submit lock, input disabled ONLY when conversation is `ESCALATED`.
  - `client/src/components/MessageInput.test.tsx`: tests for keyboard enter-to-send, disabled states, and double-send prevention.
- **Commit**: `phase 17 step 5a: build markdown renderer and message input components with safety tests`.

### Step 5b: Conversation Sidebar & Specialist Badge Components
- **Files touched**:
  - `client/src/components/ConversationSidebar.tsx`: conversation list, "+ New Chat" button, relative timestamps (`X minutes ago`), active selection highlight.
  - `client/src/components/SpecialistBadge.tsx`: color-coded active agent indicator (`order_tracking`, `returns`, `payment`, `refund`, `profile`, `account_access`); tolerates unknown agent names gracefully with neutral fallback styling. Renders handoff transition alerts.
  - Tests in `client/src/components/ConversationSidebar.test.tsx` and `SpecialistBadge.test.tsx`.
- **Commit**: `phase 17 step 5b: build conversation sidebar and specialist badge components`.

### Step 5c: Chat Feed & Verification Hint Components
- **Files touched**:
  - `client/src/components/ChatFeed.tsx`: message list with role styling; cosmetic `••••••` mask for 6-digit OTP user messages strictly when immediately preceding assistant message had non-null `blockedBy`; live node-progress indicators (e.g. `Router -> Order Tracking`) and typing indicator; empty state with scenario prompts.
  - `client/src/components/VerificationPrompt.tsx`:
    - Neutral banner copy when `blockedBy === 'VERIFICATION_FULL'`: *"Verification required — follow the assistant's instructions"*.
    - Shows 6-digit OTP prompt only after Account Access has issued the code (`currentStep === 'verify_identity'`).
    - For `VERIFICATION_LIGHT`: plain hint with no OTP styling.
    - Dev-only demo code badge fetching `/api/dev/verification-code` when `NEXT_PUBLIC_ENABLE_DEMO_CODE=true`.
  - Tests in `client/src/components/ChatFeed.test.tsx` and `VerificationPrompt.test.tsx`.
- **Commit**: `phase 17 step 5c: build chat feed and inline verification hint components`.

### Step 6a: Chat State Machine, Reducer & Ref Guard
- **Files touched**:
  - `client/src/hooks/use-chat.ts`: pure reducer and state management hook.
  - Synchronous `useRef` guard guaranteeing zero duplicate sends even on double-click.
  - On page load / conversation switch: reloads state derived from the last assistant message's metadata (validated with Zod, defaulting to `ACTIVE` if no assistant message exists).
  - Workflow status locks: `ESCALATED` permanently locks input; `COMPLETED` displays turn resolution notice with optional "New Chat" button; `FAILED` displays recoverable error banner with retry.
  - Unit tests in `client/src/hooks/use-chat.test.ts`.
- **Commit**: `phase 17 step 6a: implement pure chat reducer and hook with sync double-send guard`.

### Step 6b: Master Chat Page Assembly
- **Files touched**:
  - `client/src/app/page.tsx` & `client/src/app/layout.tsx`: master responsive layout combining sidebar, header, demo identity switcher, chat feed, and message input bar.
  - `client/src/app/page.test.tsx`: integration test verifying full conversation turn, stream lifecycle, and error state transitions.
- **Commit**: `phase 17 step 6b: assemble master chat page layout and integration test`.

### Step 7: Verification Script, Manual Runbook & Docs Close-Out
- **Files touched**:
  - `scripts/verify.ps1`: root PowerShell verification script running lint, typecheck, and test across BOTH `server/` and `client/`, failing fast on error and propagating `$LASTEXITCODE`.
  - `docs/manual-tests/phase-17-verification.md`: executable manual verification runbook for REFERENCE Scenarios 1, 3, and 5.
  - `docs/STATUS.md`: record frontend test suite count, phase 17 complete.
  - `docs/ROADMAP.md`: check off `[x] 17 Frontend: Customer Chat`.
  - `docs/DECISIONS.md`: record Phase 17 frontend decisions, Phase 16 amendments, audit exception list, and shared guest session pool documentation.
  - `docs/OPEN-DECISIONS.md`: move OD-16, OD-17, OD-18, OD-19 to resolved.
  - `docs/plans/phase-17-plan.md`: update status to `DONE`.
- **Acceptance**: All server tests pass (count >= 524 + new), all client tests pass, `scripts/verify.ps1` clean.
- **Commit**: `phase 17 step 7: add cross-workspace verify script, manual test guide, and close out phase 17 docs`.

---

## 6. Functional requirements

1. **Conversation Lifecycle**:
   - Create new conversation thread with one click.
   - List past conversations with formatted relative dates.
   - Select conversation to view chronological message history.
2. **Streaming & Progress Feedback**:
   - Progressive assistant message display via SSE.
   - Live node-progress indicator displaying intermediate graph nodes (e.g. `router` &rarr; `order_tracking`).
   - Typing indicator displayed while agent is generating text.
   - Re-fetch conversation messages from server upon stream completion (`done`).
3. **Specialist & Handoff Transparency**:
   - Current specialist badge tolerating known and unknown specialist identifiers.
   - Notice displayed when a lateral handoff occurs between specialists.
4. **Verification Flow (Pattern C)**:
   - Neutral banner when verification required; 6-digit OTP prompt only after code issued (`currentStep === 'verify_identity'`).
   - Submitting OTP transmits a standard chat message into the active conversation thread.
   - Dev-gated helper badge (`NEXT_PUBLIC_ENABLE_DEMO_CODE=true`) surfaces OTP code from Redis for human evaluator testing.
5. **Workflow Status Rules**:
   - `ESCALATED`: disables input, displays polite human agent handoff notice.
   - `COMPLETED`: displays turn completed badge, keeps input available for further inquiries or offers "New Chat".
   - `FAILED`: displays recoverable error banner with retry.
6. **Demo Identity Switching**:
   - Header dropdown allows switching between Alice, Bob, Charlie, Dave, and Guest (dynamically fetched from `/api/demo-users`).
   - Switching user clears active conversation and fetches only the selected user's conversations.
   - Labelled prominently *"Demo identity, not authentication"*.
7. **Security & Content Sanitization**:
   - Markdown rendering neutralizes `javascript:` URLs, denies raw HTML/script tags, replaces remote images with links (never auto-loads), and enforces `rel="noopener noreferrer"`.
   - User messages rendered plain-text; 6-digit OTP codes rendered cosmetically as `••••••` strictly when preceded by assistant message with non-null `blockedBy`.

---

## 7. Non-functional requirements

- **Latency**: First SSE event received within 500ms of dispatch under local development environment.
- **Double-Send Prevention**: Synchronous `useRef` lock disabling submit immediately upon action.
- **Error Handling & Resilience**:
  - Check `res.ok` and `Content-Type` before parsing SSE.
  - On stream abort or network disconnect, prevent duplicate message bubbles and refetch canonical state.
- **Testability & Integrity**: Comprehensive Vitest suites for components, reducer, and API client.
- **Dependency Health**: Pinned dependencies with documented `DECISIONS.md` exception list; fail-fast `verify.ps1`.

---

## 8. Acceptance criteria — Executable

1. **Backend Tests**:
   - `cd server && npm test` passes 100% of tests. Count >= 524 + new Phase 16 amendment tests across Steps 1a, 1b, and 1c.
2. **Backend Cross-User Ownership Tests**:
   - Verified tests in `server/src/api/conversations.test.ts` and `messages.test.ts` asserting Guest and User B receive 403 on User A's resources across all 5 endpoints (`GET /:id`, `GET /:id/messages`, `GET /:id/traces`, `POST /:id/messages` JSON & SSE).
3. **Frontend Automated Suite**:
   - `cd client && npm run lint` passes with 0 errors.
   - `cd client && npm run typecheck` passes with 0 errors.
   - `cd client && npm test` passes all component, hook, reducer, and markdown security tests.
4. **Cross-Workspace Verification**:
   - `powershell -File scripts/verify.ps1` runs both server and client checks cleanly.
5. **Manual Runbook Scenarios (`docs/manual-tests/phase-17-verification.md`)**:
   - **Scenario 1 (Alice)**: Order tracking inquiry &rarr; node progress indicator &rarr; streamed reply &rarr; completed.
   - **Scenario 3 (Charlie)**: Duplicate charge report &rarr; Payment specialist &rarr; handoff notice &rarr; Refund specialist processes refund.
   - **Scenario 5 (Alice)**: Unverified payment inquiry &rarr; OTP prompt &rarr; user submits code &rarr; resumed inquiry.

---

## 9. Risks and what would make you stop and ask

- Any unexpected dependency conflict during `npm install` in `client/`.
- Any failure in existing 524 backend tests during Step 1 amendments.
- If `res.on('close')` behavior in Node HTTP under Windows/PowerShell requires custom socket handling.

---

## 10. Docs to update on completion

1. `docs/STATUS.md` — Record frontend test suite count, phase 17 complete.
2. `docs/ROADMAP.md` — Check off `[x] 17 Frontend: Customer Chat`.
3. `docs/DECISIONS.md` — Record Phase 17 frontend decisions, Phase 16 amendments, audit exception list, and shared guest session pool documentation.
4. `docs/OPEN-DECISIONS.md` — Move OD-16, OD-17, OD-18, OD-19 to resolved.
5. `docs/plans/phase-17-plan.md` — Update status to `DONE`.
