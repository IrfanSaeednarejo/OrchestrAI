# DECISIONS (locked). Do not reverse silently; propose changes via OPEN-DECISIONS.md.

## Principles
Requirements -> architecture -> tradeoffs -> design -> implementation -> technology, never reversed. Simple infrastructure, sophisticated agent architecture.
Small focused steps; explicit typed state; clear agent boundaries; no agent spaghetti (agents never jump directly to each other; the parent re-routes).

## State and persistence
- ConversationState is a TS type living inside the Postgres checkpoint (official PostgresSaver reusing the app's pg.Pool). It is NOT a table.
- Application tables (conversations, messages, routing_history, agent_executions, tool_executions) are the durable operational history.
- No distributed transaction between checkpoint writes and operational writes. Message row is written first, then the graph is invoked with ONLY the new message.
- Redis is excluded from checkpointing; used for verification codes and justified caching only.
- Reducers: messages append; routing.history append (bounded runtime log, not a replacement for routing_history); routing.handoffCount DELTA-based;
  routing.visitedAgents deduped merge; identity and activeWorkflow full overwrite; scalar fields overwrite.
- Nodes emit ConversationStateUpdate; routing updates are Partial<RoutingState> only (never OverwriteValue).
- Events are intentionally asymmetric: RoutingEvent -> state update + DB row; AgentExecutionEvent and ToolExecutionEvent -> DB row only.
- Only HANDOFF and RE_ROUTE increment handoffCount.
- Single retailer; one payment per order; refund.returnId nullable (duplicate-charge refunds); shipments.deliveredAt added for return-window measurement.

## Tools
- 16 tools. Every tool: zod-validated input, returns ToolResult, never throws, repository failures -> REPOSITORY_ERROR.
- Empty result is success with empty data; NOT_FOUND only for a missing referenced entity (load-bearing for Scenario 4).
- Return eligibility: order delivered AND deliveredAt within 30 days AND no non-rejected return exists. Reasons: ORDER_NOT_FOUND, ORDER_NOT_DELIVERED, RETURN_WINDOW_EXPIRED, RETURN_ALREADY_EXISTS.
  check_return_eligibility and create_return share one evaluation function.
- Duplicate charge heuristic: same user, same amount, both captured (not authorized), different payment/order, within 24h. No match = success with potentialDuplicate false.
- create_refund: captured payment required; blocked by existing pending/processing/completed refund (failed does not block); if returnId given the return must be 'approved' and
  belong to the payment's order; returnId null valid; amount must equal payment.amount exactly as a string (no partial refunds); starts 'pending'.
  Codes: INVALID_INPUT, PAYMENT_NOT_FOUND, PAYMENT_NOT_CAPTURED, REFUND_ALREADY_EXISTS, RETURN_NOT_FOUND, RETURN_NOT_APPROVED, RETURN_ORDER_MISMATCH, AMOUNT_MISMATCH, REPOSITORY_ERROR.
- update_profile changes only name and defaultAddress (never email). get_profile returns the full row (FULL verification gates it).
- initiate_password_reset is stateless (users has no credential column), returns {acknowledged:true}, never touches identity.
- Verification code: 6-digit, Redis key verify:{userId} {code, attempts}, TTL 600s, single use, max 5 wrong attempts, re-issue overwrites, no resend throttle, raw code never logged.
  Typed failures: INVALID_CODE, CODE_EXPIRED, MAX_ATTEMPTS_EXCEEDED, VERIFICATION_SERVICE_UNAVAILABLE. Atomic attempt handling sits behind VerificationService.
- executeTool: times, catches throws (UNEXPECTED_ERROR), logs one tool_executions row, redacts sensitive fields shallowly, logging failure never affects the result.

## Access control (Phase 6)
- gatedExecuteTool wraps executeTool; specialists only receive the gated version. The gate checks allowlist permission BEFORE verification; identity null = UNVERIFIED.
- A verification failure is a typed BLOCKED result, distinct from ToolResult failures; DENIED for allowlist violations. The gate never mutates state; the calling node writes activeWorkflow.
  Blocked/denied attempts write a tool_executions failure row (e.g. VERIFICATION_REQUIRED).
- Pattern C builder (state/blocked-workflow.ts): BlockedByReason = 'VERIFICATION_LIGHT' | 'VERIFICATION_FULL'; emits all six activeWorkflow fields every time; ActiveWorkflowState.blockedBy stays string|null.
- Identity mutation: only via state/identity-update.ts (enforces status/method/verifiedAt invariants, throws on violation), importable only by Account Access paths; enforced by ESLint no-restricted-imports + a source-scanning boundary test.
  Integration tests must not import it; supply identity via graph input.

## Knowledge / RAG
- gemini-embedding-2 via @google/genai, 768 dims, whole-document chunks, asymmetric prefixes ("title: none | text: ..." for docs, "task: search result | query: ..." for queries; NO taskType field).
- Ingestion wipes and reseeds; manual script, not part of the test suite. Tests mock the embeddings client.
- retrieveKnowledge requires non-empty domains (no unscoped search), optional topics filter, similarity = 1 - cosine distance. MIN_SIMILARITY = 0.60 provisional (recalibrate Phase 15), injected server-side.
- Per-specialist scope is domain+topic (see REFERENCE.md); Profile gets NO_KNOWLEDGE_ACCESS. Empty retrieval = no grounded knowledge; specialists must not answer from memory.
- Structured questions use structured queries; semantic questions use retrieval.

## Agents (Phase 7)
- LLM: `gemini-2.5-flash` via `@google/genai`. Deterministic decisions/tool calls use `temperature: 0.0`; customer-facing generation uses `temperature: 0.2`.
- Structured output uses `responseMimeType: 'application/json'` and validates responses with Zod schemas. Wrapper returns typed `LLMResult<T>` and never throws raw SDK errors. In Vitest, `@google/genai` is mocked (no real Gemini API calls).
- Prompt templates enforce 5 standard sections (`Identity`, `Objective`, `Scope`, `Phased-Workflow`, `Guidelines`) with `{{key}}` parameter interpolation. Missing required sections throw at validation time; unreplaced variables trigger a warning.
- `HandoffRequest` payload contract: `sourceAgent` (SpecialistId), `handoffReason` (string), `detectedIntent` (string | null), `recommendedDomain` (string), `relevantContext` (Record<string, unknown>), `attemptedActions` (string[]), `confidence` (number in [0, 1]). Strictly validated with Zod.
- Specialist node patterns execute all tools via `gatedExecuteTool`. Gate outcomes map to: ALLOWED -> `{ workflowStatus: 'COMPLETED' }`, BLOCKED -> `{ ...buildBlockedWorkflowUpdate(...), workflowStatus: 'WAITING_FOR_USER_INPUT' }`, DENIED -> `{ workflowStatus: 'FAILED' }`.
- Subgraph test harness (`buildSubgraphHarness`, `buildSingleNodeHarness`) runs against `ConversationStateAnnotation` with `MemorySaver` checkpointer for fast in-memory integration testing.

## Testing conventions
- Real DB/Redis in integration tests with scoped cleanup (never an unscoped delete); distinct fixture prefixes to avoid cross-file races.
- Raw verbatim command output in reports; always run typecheck after final edits.
