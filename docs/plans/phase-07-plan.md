# Phase 7 — Agent Foundation — PLAN (status: COMPLETED)

## 1. Goal and How It Fits the Architecture
Phase 7 establishes the foundational building blocks required by all future specialist subgraphs (Phases 9–11) and the parent router (Phase 8). It introduces a mockable LLM client wrapper over `@google/genai` (Gemini 2.5 Flash), a modular prompt template loader enforcing standard agent sections, a strongly typed and validated `HandoffRequest` contract, standardized node execution patterns (routing all tool invocations through Phase 6's `gatedExecuteTool`), and a reusable subgraph test harness.

## 2. Dependencies Satisfied / Missing
- **Satisfied**:
  - Phase 4: Deterministic tools layer & verification flow (`server/src/tools/*`).
  - Phase 5: Knowledge ingestion & domain/topic-scoped RAG (`server/src/knowledge/*`).
  - Phase 6: Access control gate, allowlists, Pattern C blocked workflow, identity update boundary (`server/src/tools/gate.ts`, `server/src/tools/gated-execution.ts`, `server/src/state/blocked-workflow.ts`).
  - Baseline test count: 240 tests across 35 files (all passing).
- **Missing / Required First**:
  - Approval of OPEN-DECISIONS #3 (Agent LLM: `gemini-2.5-flash`, temperature 0.0 for decisions, structured Zod validation).
  - Approval of this Phase 7 Plan.

## 3. Scope IN / Scope OUT
- **Scope IN**:
  - **LLM Client Wrapper**: `server/src/agents/llm/client.ts` with structured JSON output via Zod schemas, deterministic options (`temperature: 0.0`), and a mockable test interface.
  - **Prompt Template Loader**: `server/src/agents/prompts/template-loader.ts` enforcing the 5 standard sections (`Identity`, `Objective`, `Scope`, `Phased-Workflow`, `Guidelines`) with type-safe parameter interpolation.
  - **Handoff Contract**: `server/src/agents/handoff/types.ts` & `validation.ts` defining `HandoffRequest` (`sourceAgent`, `handoffReason`, `detectedIntent`, `recommendedDomain`, `relevantContext`, `attemptedActions`, `confidence`) with Zod schemas.
  - **Standard Node Execution Patterns**: `server/src/agents/common/node-patterns.ts` implementing standardized specialist execution (tool call via `gatedExecuteTool`, gate decision mapping to `ConversationStateUpdate`, handoff formatting).
  - **Subgraph Test Harness**: `server/src/agents/common/subgraph-harness.ts` allowing specialist subgraphs to be tested end-to-end in isolation with mock LLM outputs, real database fixtures, and checkpoint round-trips.
- **Scope OUT**:
  - Concrete domain specialist subgraphs (Order Tracking/Returns in Phase 9, Payment/Refund in Phase 10, Profile/Account Access in Phase 11).
  - Parent graph & router skeleton (Phase 8).
  - Modifying protected files (`server/src/state/conversation-state.ts`, `server/src/persistence/*`, etc.).

## 4. Open Decisions This Phase Must Resolve
- **OPEN-DECISIONS #3 (Agent LLM)**:
  - *Options*: `gemini-2.5-flash` vs `gemini-2.0-flash` vs `gemini-1.5-pro`.
  - *Recommendation*: Use `gemini-2.5-flash` with `temperature: 0.0` for structured classification and tool argument generation; validate via Zod; mock in Vitest.
  - *Status*: Proposal formulated in `docs/OPEN-DECISIONS.md`; awaiting owner approval.
- **OPEN-DECISIONS #6 (`HandoffRequest` payload shape)**:
  - Formulate schema: `sourceAgent` (`SpecialistId`), `handoffReason` (`string`), `detectedIntent` (`string | null`), `recommendedDomain` (`string`), `relevantContext` (`Record<string, unknown>`), `attemptedActions` (`string[]`), `confidence` (`number` between 0 and 1). Validated strictly with Zod.

## 5. Steps (Small, Ordered)

### Step 1: LLM Client Wrapper & Contract
- **Files touched**:
  - `server/src/agents/llm/client.ts`
  - `server/src/agents/llm/client.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: None.
- **Details**: Wrap `@google/genai` to provide `generateStructuredOutput<T>(schema: z.ZodType<T>, prompt: string, options?: LLMOptions)` with Gemini `responseMimeType: 'application/json'` and `responseSchema`. Unit test with mocked `@google/genai` verifying schema adherence, error handling, and parameter passing.
- **Failure cases**: Unhandled SDK errors, malformed JSON response from mock, schema validation failure.

### Step 2: Prompt Template Loader
- **Files touched**:
  - `server/src/agents/prompts/template-loader.ts`
  - `server/src/agents/prompts/template-loader.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: None.
- **Details**: Create prompt loader supporting parameterized markdown templates. Verify templates contain required sections: Identity, Objective, Scope, Phased-Workflow, Guidelines.
- **Failure cases**: Missing required section in template, unreplaced template variables.

### Step 3: HandoffRequest Definition & Validation
- **Files touched**:
  - `server/src/agents/handoff/types.ts`
  - `server/src/agents/handoff/validation.ts`
  - `server/src/agents/handoff/validation.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: None.
- **Details**: Implement `HandoffRequestSchema` and `buildHandoffRequest` helper. Verify all fields: `sourceAgent`, `handoffReason`, `detectedIntent`, `recommendedDomain`, `relevantContext`, `attemptedActions`, `confidence`.
- **Failure cases**: Invalid confidence range (<0 or >1), missing specialist ID, invalid types.

### Step 4: Common Node Patterns & Subgraph Harness
- **Files touched**:
  - `server/src/agents/common/node-patterns.ts`
  - `server/src/agents/common/subgraph-harness.ts`
  - `server/src/agents/common/subgraph-harness.test.ts`
- **Protected files affected**: None.
- **State ownership & changes**: Emits valid `ConversationStateUpdate` (never `Partial<ConversationState>`).
- **Details**: Build standard execution functions for specialist nodes:
  - Invokes tools exclusively via `gatedExecuteTool`.
  - Maps BLOCKED to `buildBlockedWorkflowUpdate` with `workflowStatus: 'WAITING_FOR_USER_INPUT'`.
  - Maps DENIED to `workflowStatus: 'FAILED'`.
  - Build mockable subgraph test harness that executes a single specialist subgraph against `ConversationStateAnnotation` with in-memory or PostgreSQL checkpointer.
- **Failure cases**: Gated tool execution failure, incorrect state transition emission.

## 6. Functional Requirements
- Tools called by agent nodes must strictly pass through `gatedExecuteTool`.
- `HandoffRequest` payloads must validate strictly against Zod schemas.
- Prompt templates must consistently structure specialist behavior across the platform.
- Zero paid API calls during the test suite; Gemini client must be mockable cleanly.

## 7. Non-Functional Requirements
- **TypeScript strictness**: No `any`, no `as`, no `@ts-ignore`.
- **Protected files intact**: Zero edits to `conversation-state.ts`, checkpointer, schema, or lifecycle services.
- **Test suite integrity**: Test count must strictly increase from baseline 240.

## 8. Acceptance Criteria
- Commands executed from `server/`:
  - `npm run typecheck` (0 errors)
  - `npm run lint` (0 errors, 0 warnings)
  - `npm test` (all test files pass, test count >= 240 + new Phase 7 tests)
- New tests:
  - `server/src/agents/llm/client.test.ts`
  - `server/src/agents/prompts/template-loader.test.ts`
  - `server/src/agents/handoff/validation.test.ts`
  - `server/src/agents/common/subgraph-harness.test.ts`

## 9. Risks and What Would Make You Stop and Ask
- Any conflict in `@google/genai` JSON schema generation with nested Zod schemas.
- Any pressure to alter `ConversationStateAnnotation` fields (forbidden without approval).
- Any ambiguity in `HandoffRequest` payload routing semantics.

## 10. Docs to Update on Completion
- `docs/STATUS.md`: Phase 7 progress and test counts.
- `docs/DECISIONS.md`: Record approved Agent LLM settings and `HandoffRequest` specification.
- `docs/ROADMAP.md`: Update Phase 7 status.
- `docs/OPEN-DECISIONS.md`: Move resolved items to DECISIONS.

