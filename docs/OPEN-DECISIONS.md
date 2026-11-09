# OPEN DECISIONS
Process: the agent writes a proposal (options, tradeoffs, recommendation, impact, tests that would prove it), then WAITS for approval.
Approved items move to DECISIONS.md. Items marked [CONFLICT] are inconsistencies in earlier notes that need a ruling, not a design.

1. [RESOLVED 2026-11-06] Pattern A definition locked, and 14-scenario evaluation matrix confirmed:
   - Pattern A = direct specialist resolution without lateral handoff or verification block (Scenarios 1, 2, 8, 9, 14).
   - Pattern B = lateral handoff to parent router -> parent router re-routes to secondary specialist (Scenarios 3, 4).
   - Pattern C = specialist blocked by verification -> routed to Account Access -> resumes originating specialist (Scenarios 5, 6, 7).
   - Safety/Escalation = Scenarios 10, 11, 12.
   - Security Boundary = Scenario 13 (preventing unverified identity mutation).
   All 14 scenarios validated live across concrete specialists in Phase 12. Recorded in DECISIONS.md under Phase 12.
2. [RESOLVED 2026-11-05] Router design: hybrid guard+LLM classifier; `DEFAULT_MAX_HANDOFFS = 3`; `Command({ goto })` dispatch; loop = same specialist ≥ 2 consecutive visits. Recorded in DECISIONS.md under Phase 8.
3. [RESOLVED 2026-11-05] Agent LLM: `gemini-2.5-flash`, `temperature: 0.0` for routing/tool decisions, `temperature: 0.2` for customer-facing generation, `responseMimeType: 'application/json'` + Zod `responseSchema` for structured output, mockable client interface in Vitest. Recorded in DECISIONS.md under Phase 7.
4. Specialist designs, one block per specialist: scope in/out, phased workflow (entry/action/branch/exit), handoff triggers, escalation conditions, success/failure criteria.
   OD-4a [RESOLVED 2026-11-05]: Order Tracking — single-node phased subgraph. Tools: get_order, get_shipment_status (LIGHT). RAG: orders/shipping. Ambiguous orderId → WAITING_FOR_USER_INPUT. Recorded in DECISIONS.md under Phase 9.
   OD-4b [RESOLVED 2026-11-05]: Returns — single-node phased subgraph. Tools: check_return_eligibility, create_return (FULL-gated), get_return_status, get_return_by_order. RAG: orders/returns. Ineligible → RAG explain → COMPLETED. FULL block → Pattern C → WAITING_FOR_USER_INPUT. Recorded in DECISIONS.md under Phase 9.
   OD-4c [RESOLVED 2026-11-05]: Payment specialist — single-node subgraph. Tools: get_order, get_payment (FULL), detect_duplicate_charge (FULL), search_knowledge (payments/payments). If duplicate confirmed, emits Pattern B handoff to Refund. Recorded in DECISIONS.md under Phase 10.
   OD-4d [RESOLVED 2026-11-05]: Refund specialist — single-node subgraph. Tools: get_order, get_payment (FULL), get_return_status, get_return_by_order, create_refund (FULL), get_refund_status (FULL), search_knowledge (payments/refunds). Duplicate charges processed via handoff resumeContext; unlinked returns hand off to Returns; approved returns trigger structured create_refund. Recorded in DECISIONS.md under Phase 10.
   OD-4e [RESOLVED 2026-11-06]: Profile specialist — single-node phased subgraph. Tools: get_profile, update_profile (FULL-gated). No RAG. On verification block, emits Pattern C activeWorkflow with returnTo: { agent: 'account_access' }. Recorded in DECISIONS.md under Phase 11.
   OD-4f [RESOLVED 2026-11-06]: Account Access specialist — single-node subgraph. Two-mode operation: Mode 1 (Password Reset, Scenario 14) calls initiatePasswordReset with NO identity mutation; Mode 2 (Verification for Resume, Scenarios 5, 6, 7) verifies OTP code via verifyIdentity, calls buildIdentityUpdate from state/identity-update.ts, clears activeWorkflow.blockedBy to null, and dispatches Command({ goto: 'router' }) for parent router resume guard. RAG: account/account_security. Recorded in DECISIONS.md under Phase 11.
5. [RESOLVED 2026-11-05] Handoff and resume semantics: `resumeContext` = pending tool + validated args + resolved IDs; parent router writes `RE_ROUTE` event and routes to `activeWorkflow.returnTo`; resumed specialist clears `activeWorkflow` on COMPLETED. Recorded in DECISIONS.md under Phase 8.
6. [RESOLVED 2026-11-05] HandoffRequest payload shape (sourceAgent, handoffReason, detectedIntent, recommendedDomain, relevantContext, attemptedActions, confidence) and Zod validation. Recorded in DECISIONS.md under Phase 7.
7. [RESOLVED 2026-11-06] Backend API Architecture & Server Framework:
   Option A adopted — Dedicated Express.js REST application in `server/src/api/` with CORS, JSON body parser, Zod validation middleware, custom AppError hierarchy extending Error, dual-mode message responses (standard JSON + Server-Sent Events SSE streaming), x-user-id header validation against Postgres users table with guest fallback (using distinct RFC 4122 v4 UUID), and trace timeline endpoint. Recorded in DECISIONS.md under Phase 16.
8. [RESOLVED 2026-11-05] Refund specialist payment identification (Scenario 8): Option A adopted — `get_payment` (FULL gated) added to `refund` specialist allowlist in `server/src/tools/permissions.ts` and `REFERENCE.md`. Enables self-contained structured check in Scenario 8. Recorded in DECISIONS.md under Phase 10.
9. Original Stage 1/2 requirements doc is not available. Functional/non-functional requirements should be consolidated into docs/REQUIREMENTS.md during Phase 7 planning from DECISIONS + REFERENCE.
10. [RESOLVED] Phase 6 Step 6a and Step 6b signed off; Phase 6 closed.
11. [RESOLVED 2026-11-05] Pattern B lateral re-route mechanism in Parent Router: Option A adopted — existing `activeWorkflow` with `blockedBy: null` triggers `checkResumePreconditions` in router, emitting `decisionType: 'RE_ROUTE'` and dispatching `Command({ goto: targetSpecialist })`. Zero schema or state changes required. Recorded in DECISIONS.md under Phase 10.
12. [RESOLVED 2026-11-06] Tool Retry & Failure Escalation Policy (Scenario 11): Option A adopted — centralized single-retry (`maxRetries = 1`) inside `executeTool` for retryable infrastructure errors (`TIMEOUT`, `NETWORK_ERROR`, `DATABASE_ERROR`). On retry failure or unrecoverable error, specialist emits `workflowStatus: 'ESCALATED'` with human handoff message. Non-retryable domain outcomes (`NOT_FOUND`, `INVALID_ARGUMENTS`, `INELIGIBLE`) fail immediately without retry. Recorded in DECISIONS.md under Phase 13.
13. [RESOLVED 2026-11-06] Terminal `ESCALATED` State Router Guard & Fallback Routing: Option A adopted — added check in `evaluatePreClassificationGuards`: if `state.workflowStatus === 'ESCALATED'`, immediately return `{ outcome: 'ESCALATE', reason: 'Conversation in terminal ESCALATED state.' }`, preserving human handoff without invoking LLM classification. When LLM classification fails/errors, router logs `decisionType: 'FALLBACK'` and defaults safely to `order_tracking`. Recorded in DECISIONS.md under Phase 13.
14. [RESOLVED 2026-11-06] LangSmith Observability & Tracing Architecture:
    Option A adopted — Native LangGraph/LangChain tracing via `RunnableConfig` (`runName`, `tags`, `metadata`) paired with a centralized `createTraceConfig` factory in `server/src/observability/`. Tracing enabled automatically when `LANGCHAIN_TRACING_V2="true"` and `LANGCHAIN_API_KEY` is set. Tests run offline with zero external network calls. Recorded in DECISIONS.md under Phase 14.
15. [RESOLVED 2026-11-06] Evaluation Framework Architecture & Scenario Expansion:
    Option A adopted — Strongly typed in-code scenario dataset (30 scenarios expanding REFERENCE.md 1-14 with 16 new edge/failure cases) in `server/src/evaluation/dataset/scenarios.ts`; 8 deterministic binary evaluators (`ROUTING_CORRECT`, `HANDOFF_CORRECT`, `SPECIALIST_SCOPE_CORRECT`, `TOOL_SELECTION_CORRECT`, `STATE_PRESERVED`, `KNOWLEDGE_GROUNDED`, `WORKFLOW_COMPLETED`, `RESOLUTION_CORRECT`); dual-mode execution via Vitest CI suite (`npm test`) and standalone CLI report generator (`npm run eval`); maintain calibrated `MIN_SIMILARITY = 0.60`. Recorded in DECISIONS.md under Phase 15.

20. [RESOLVED 2026-11-07] Conversational Router Agent Architecture for General Inquiries & Greetings:
    Option A adopted — When the user sends greetings ("hello", "hi") or unclassified store queries, the router handles them directly via a conversational LLM greeting detailing OrchestrAI capabilities without dispatching Command({ goto: 'order_tracking' }) or requiring an order ID. The router keeps workflowStatus: 'WAITING_FOR_USER_INPUT' and transitions to specialist dispatch on the subsequent turn once a domain intent is expressed. Recorded in DECISIONS.md under Phase 20.

21. [RESOLVED 2026-11-07] Real User Authentication & Storefront Integration:
    OD-21a [RESOLVED 2026-11-07]: Password Hashing & Security Service — Option A adopted: Node.js built-in `crypto.scrypt` with 16-byte random salt, 64-byte derived key, and constant-time `crypto.timingSafeEqual`. Requires zero external binary dependencies and provides production cryptographic security.
    OD-21b [RESOLVED 2026-11-07]: Session Token Transport & Backward Compatibility — Option A adopted: Stateless signed HMAC-SHA256 Bearer session token (`Authorization: Bearer <token>`). `auth.middleware.ts` evaluates Bearer tokens first (for real registered users) and falls back cleanly to `x-user-id` header (for benchmark/eval test suites) and guest fallback for anonymous visits.
    OD-21c [RESOLVED 2026-11-07]: Order & Shipment Initialization on Checkout — Option A adopted: `POST /api/orders` executes an atomic Drizzle transaction creating `orders` (status: 'paid'), `order_items` (with unit price snapshot), `payments` (status: 'captured'), and `shipments` (status: 'in_transit' with tracking number). Enables newly registered customers to immediately query the multi-agent system regarding their order in real time. Recorded in DECISIONS.md under Phase 21.

22. [RESOLVED 2026-11-08] Mandatory User Authentication Guard & Storefront/Orders UX Architecture:
    OD-22a [RESOLVED 2026-11-08]: Client-side Navigation Guard (`useRequireAuth`) — Option A adopted: A lightweight React hook (`useRequireAuth(targetPath)`) wrapping Next.js App Router `useRouter()`. Inspects `isAuthenticated` and `isLoading` from `auth-context.tsx`. When unauthenticated, replaces the active URL with `/login?redirect=${encodeURIComponent(targetPath)}`. Ensures sessions persist across reloads via localStorage Bearer tokens and automatically redirects unauthorized visitors from `/`, `/store`, and `/orders`.
    OD-22b [RESOLVED 2026-11-08]: 1-Click Order Chat Integration via Query Parameter — Option A adopted: When the customer clicks "Ask Agent About This Order" from either `/store` checkout receipt or `/orders` history, they navigate to `/?orderId=${order.id}`. The root chat component inspects `useSearchParams().get('orderId')` within `<Suspense>` and initializes the chat message draft with `"Where is my order ${orderId}? Can you give me the latest tracking status?"`. Enables immediate single-click conversational tracking without manual copy-pasting. Recorded in DECISIONS.md under Phase 22.

23. [RESOLVED 2026-11-08] Conversational UX, Interactive Service Menu & Order Tracking Reliability:
    OD-23a [RESOLVED 2026-11-08]: Greeting Response Generation — Option A adopted: short context-aware LLM greeting generation (`temperature: 0.2`) returning `{ greeting, options }` schema instead of hardcoded repetitive script.
    OD-23b [RESOLVED 2026-11-08]: Interactive Options Transport & Rendering — Option A adopted: options transported in `AIMessage.additional_kwargs.options` -> forwarded in SSE routing event -> stored in `ChatState.serviceOptions` -> rendered as interactive `ServiceOptionBar` pills in chat.
    OD-23c [RESOLVED 2026-11-08]: Order Tracking Continuation Guard — Option A adopted: direct continuation guard in `routerNode` ensuring pending order ID collection turns re-route directly to `order_tracking` without spurious LLM re-classification. Recorded in DECISIONS.md under Phase 23.

24. Phase 24 Stabilization Proposals (PENDING APPROVAL — DO NOT IMPLEMENT WITHOUT APPROVAL):
    - OD-24a (Identity Seeding Boundary vs. "Only Account Access Writes Identity" Invariant):
      - Problem: Locked rule in DECISIONS.md states "Only the Account Access specialist may change identity (via state/identity-update.ts; enforced by ESLint + boundary test)". However, real users authenticated via Bearer tokens enter the graph with `identity = null` (or unverified), causing LIGHT-gated tools (`get_order`) to block unnecessarily and prompting logged-in users to log in again.
      - Option A (Recommended): Create pure helper `server/src/state/session-identity.ts`. Maps `req.authMethod === 'bearer'` to `status: 'LIGHTLY_VERIFIED'` with `verificationMethod: 'session'`. Guests and `x-user-id` callers map to `UNVERIFIED`. If checkpoint already has `status: 'VERIFIED'`, preserve `VERIFIED` only if `verifiedAt` is within TTL (e.g. 15m), else drop to `LIGHTLY_VERIFIED`. The helper NEVER creates or elevates to `VERIFIED`. `auth.middleware.ts` sets `req.authMethod`; controller passes identity into graph input.
      - Option B: Force an automatic internal invocation of Account Access before running any specialist.
        - Tradeoff: High latency (+1 graph execution per turn), complex routing state transitions.
      - Option C: Modify `evaluateGate` to inspect HTTP request headers directly.
        - Tradeoff: Breaches architectural purity; tools/gate should only inspect state, not HTTP context.
      - Recommendation: Option A. Pure, deterministic, preserves the OTP elevation boundary for `VERIFIED`.

    - OD-24b (Duplicate Charge Human Review Escalation & `review_requests` Table):
      - Problem: Payment currently executes automatic lateral handoff to Refund which auto-calls `createRefund` for duplicate charges without customer confirmation or merchant oversight. This risks unauthorized refunds.
      - Option A (Recommended): Add `review_requests` table to `server/src/persistence/db/schema.ts` with columns (`id`, `conversationId`, `userId`, `orderId`, `paymentId`, `duplicatePaymentId`, `amount`, `status`, `reason`, `createdAt`, `updatedAt`). When duplicate charge is detected, agent asks user to confirm. Once confirmed, creates a `review_requests` record with `status: 'pending'`, escalating to human review instead of executing an immediate automated refund.
      - Option B: Repurpose `routing_history` or `agent_executions` to record review requests.
        - Tradeoff: Conflates system runtime logs with domain financial records.
      - Option C: Only emit `workflowStatus: 'ESCALATED'` without database persistence.
        - Tradeoff: Ops team cannot query, approve, or track duplicate charge requests.
      - Recommendation: Option A. Clean relational schema with Drizzle migration.

    - OD-24c (Per-Turn Handoff Counter Semantics in `ConversationState`):
      - Problem: `routing.handoffCount` currently accumulates across all turns of a conversation. Multi-turn conversations eventually hit `DEFAULT_MAX_HANDOFFS = 3` and trigger false-positive human escalations. In addition, specialists and router both update `handoffCount` inconsistently.
      - Option A (Recommended): Make `handoffCount` turn-scoped (reset to 0 at the start of each user turn in router or state initialization). Single authoritative owner: only the parent router updates `handoffCount` when executing a `HANDOFF` or `RE_ROUTE`. Specialists never emit `handoffCount` deltas. Resume transitions (`RE_ROUTE`) are exempt from loop detection.
      - Option B: Increase global `DEFAULT_MAX_HANDOFFS` from 3 to 15.
        - Tradeoff: Masking bug; does not fix unbounded cumulative growth or uncoordinated specialist emissions.
      - Option C: Rely entirely on `isRoutingLoop` and remove `DEFAULT_MAX_HANDOFFS`.
        - Tradeoff: Fails to detect multi-node non-adjacent cycles (A -> B -> C -> A).
      - Recommendation: Option A. Prevents false-positive escalations while maintaining loop safety per turn.





