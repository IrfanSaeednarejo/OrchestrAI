# Phase 08 — Meta OrchestrAI Parent Graph & Stateful Router (Skeleton) — PLAN (status: APPROVED 2026-11-05)

## 1. Goal and How It Fits the Architecture
Phase 8 establishes the central nervous system of OrchestrAI: the parent state graph and the stateful meta-orchestrator router. The router inspects conversation history, routing state, active workflow blockers, and user identity to dynamically dispatch control flow to specialist subgraphs using LangGraph `Command({ goto: ... })`. It incorporates deterministic safety guards (handoff threshold cap of 3, loop detection, resume dispatch via `activeWorkflow.returnTo`) before falling back to structured LLM intent classification (Gemini 2.5 Flash). Six specialist stubs simulate downstream execution, allowing the full multi-turn routing and handoff lifecycle to be tested deterministically before building concrete specialist subgraphs in Phases 9–11.

## 2. Dependencies Satisfied / Missing
- **Satisfied**:
  - Phase 3: `ConversationStateAnnotation`, `PostgresSaver`, `recordRoutingEvent`, lifecycle services.
  - Phase 6: Access control gate, Pattern C blocked-workflow builder (`server/src/state/blocked-workflow.ts`).
  - Phase 7: LLM client wrapper (`server/src/agents/llm/client.ts`), prompt loader (`server/src/agents/prompts/template-loader.ts`), `HandoffRequest` validation (`server/src/agents/handoff/validation.ts`), and common node patterns / test harness.
  - Test baseline: 294 passing tests across 39 files.
- **Missing / Required First**:
  - Plan approval from project owner.

## 3. Scope IN / Scope OUT
- **Scope IN**:
  - **Intent & Routing Classifier Contract**: Schema and prompts for classifying user requests into domain intents (`ORDER_STATUS`, `RETURN_REQUEST`, `PAYMENT_QUERY`, `REFUND_REQUEST`, `PROFILE_UPDATE`, `ACCOUNT_ACCESS`, `GENERAL_INQUIRY`, `UNKNOWN`).
  - **Deterministic Router Guards**:
    - Guard 1: Active workflow resume (`activeWorkflow.returnTo != null` routes directly back to originating specialist).
    - Guard 2: Maximum handoff threshold cap (`routing.handoffCount >= 3` terminates in `workflowStatus: 'ESCALATED'`).
    - Guard 3: Direct loop detection (prevents circular ping-pong between agents, triggering escalation or fallback).
  - **Dynamic Dispatch via `Command({ goto })`**: Implementation of LangGraph Command-based routing node that records `RoutingEvent` via `recordRoutingEvent` and transitions to target specialist.
  - **Specialist Stubs**: Six lightweight stubs (`order_tracking`, `returns`, `payment`, `refund`, `profile`, `account_access`) implementing the standard specialist contract, capable of resolving or returning `HandoffRequest`.
  - **Parent Graph Definition & Factory**: `server/src/graphs/parent/parent-graph.ts` assembling the router and specialist stubs into a compiled graph with checkpointer.
  - **Type Alignment**: Address Known Issue #2 (`AnyCompiledGraph` type alignment in `conversation-lifecycle.service.ts`).
- **Scope OUT**:
  - Full concrete specialist logic (Order/Returns specialists in Phase 9; Payment/Refund in Phase 10; Profile/Account Access in Phase 11).
  - Live customer chat UI or HTTP API endpoints (Phases 16–18).

## 4. Open Decisions This Phase Must Resolve
- **OPEN-DECISIONS #2 (Router Architecture & Guards)**:
  - *Approved ruling*: Hybrid approach. Deterministic guards run first (resume check, loop detection, handoff count cap = 3), followed by Gemini structured output intent classification.
- **OPEN-DECISIONS #5 (Resume Semantics)**:
  - When `activeWorkflow.returnTo` is present and routing back to the originating specialist, the router transitions to `returnTo.agent` and sets `workflowStatus: 'ACTIVE'`.
- **Known Issue #2 (`AnyCompiledGraph` compatibility)**:
  - Align `AnyCompiledGraph` in `conversation-lifecycle.service.ts` so `parentGraph.compile()` matches structurally without requiring `as unknown as AnyCompiledGraph`.

## 5. Steps (Small, Ordered)

### Step 1: Intent Taxonomy & LLM Router Classifier
- **Files touched**:
  - `server/src/routing/classifier/taxonomy.ts`
  - `server/src/routing/classifier/classifier.ts`
  - `server/src/routing/classifier/classifier.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Pure classification function; emits parsed intent and target specialist.
- **Details**: Uses `generateStructuredOutput` with `temperature: 0.0` to classify user message into target `SpecialistId` and detected intent string.

### Step 2: Deterministic Router Guards
- **Files touched**:
  - `server/src/routing/guards.ts`
  - `server/src/routing/guards.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Reads `RoutingState` and `ActiveWorkflowState`.
- **Details**: Implements pure guard functions:
  - `checkHandoffCap(routing, max = 3)` -> returns escalation decision if exceeded.
  - `checkResumeTarget(activeWorkflow, identity)` -> returns resume target if returnTo exists.
  - `checkLoop(routing, targetAgent)` -> detects circular transitions.

### Step 3: Specialist Stubs & Handoff Handlers
- **Files touched**:
  - `server/src/agents/specialists/stubs.ts`
  - `server/src/agents/specialists/stubs.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Stubs emit `ConversationStateUpdate` with `workflowStatus: 'COMPLETED'` or return `HandoffRequest` back to router.
- **Details**: Implement mockable specialist nodes for all 6 specialists adhering to standard input/output contracts.

### Step 4: Parent Graph Assembly & Command(goto) Dispatch
- **Files touched**:
  - `server/src/graphs/parent/parent-graph.ts`
  - `server/src/services/conversation-lifecycle.service.ts` (type cleanup only)
  - `server/src/graphs/parent/parent-graph.test.ts`
- **Protected files affected**: `conversation-lifecycle.service.ts` (type signature alignment only).
- **State ownership & changes**: Router node dispatches via `Command({ goto: targetNode, update: routingStateUpdate })`.
- **Details**: Assembles parent graph with START -> router -> [specialist stubs] -> END / router. Integrates `recordRoutingEvent` on every routing step.

### Step 5: End-to-End Integration Tests
- **Files touched**:
  - `server/src/graphs/parent/parent-graph.integration.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Real PostgresSaver checkpointer, tests multi-turn routing, loop escalation, and handoff resume.
- **Details**: Validates multi-turn routing: initial routing -> stub execution -> handoff -> re-route -> max handoff cap escalation.

### Step 6: Close-out & Documentation
- **Files touched**:
  - `docs/STATUS.md`
  - `docs/DECISIONS.md`
  - `docs/OPEN-DECISIONS.md`
  - `docs/ROADMAP.md`
- **Details**: Update test counts, baseline, and mark Phase 8 as complete.

## 6. Functional Requirements
- Router MUST evaluate deterministic guards prior to invoking LLM classification.
- Reaching 3 lateral handoffs MUST immediately transition to `workflowStatus: 'ESCALATED'` without calling LLM.
- Presence of valid `activeWorkflow.returnTo` MUST resume the originating specialist without re-classifying intent.
- Every routing decision MUST write a durable `routing_history` record via `recordRoutingEvent`.
- Routing transitions MUST use LangGraph `Command({ goto })`.

## 7. Non-Functional Requirements
- **TypeScript strictness**: Zero `any`, zero `as` casts, zero `@ts-ignore`.
- **No real LLM calls in unit test suite**: Gemini mocked via standard `generateStructuredOutput` / `@google/genai` mock patterns.
- **Clean integration teardown**: Database integration tests use scoped UUID cleanup.

## 8. Acceptance Criteria
- Commands from `server/`:
  - `npm run typecheck` (0 errors)
  - `npm run lint` (0 errors)
  - `npm test` (all tests passing, count >= 294 + new tests)
- Named integration scenarios:
  - Initial direct route to specialist stub.
  - Resume route using `activeWorkflow.returnTo`.
  - Lateral handoff from specialist stub back to router -> re-route.
  - Escalation triggered when `handoffCount >= 3`.

## 9. Risks and What Would Make You Stop and Ask
- Any incompatibility between LangGraph `Command` goto transitions and `StateGraph` typing that would require unsafe casts.
- Changes required to protected files beyond `AnyCompiledGraph` type definition in `conversation-lifecycle.service.ts`.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/OPEN-DECISIONS.md`
- `docs/ROADMAP.md`

