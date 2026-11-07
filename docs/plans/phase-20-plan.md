# Phase 20 — Conversational Routing & Chat State Isolation — PLAN (status: APPROVED)

## Approvals
- APPROVED: Phase 20 Plan (2026-11-07 by owner)

## 1. Goal and How It Fits the Architecture
Phase 20 addresses two critical user experience defects in OrchestrAI:
1. **Conversational Greeting & Triage (Option B)**: Open-ended messages such as "hello there", greetings, and general queries currently default to `order_tracking`, which rigidly demands an order ID. This phase introduces conversational routing that greets customers, explains platform capabilities, and only dispatches to specialist subgraphs (`order_tracking`, `returns`, `payment`, `refund`, `profile`, `account_access`) once a domain intent is expressed.
2. **Chat Session Isolation & Disassociation**: In the Next.js client, switching demo users or clicking "+ New Chat" leaves conversation state lingering in React refs/state, and 403 Forbidden errors do not wipe previous transcripts, leaking prior messages across scenarios. This phase implements immediate, synchronous chat disassociation and state reset.

Following the completion of Phase 20, a formal architectural roadmap and plan for real user authentication (registration, login, logout, order creation) will be executed.

## 2. Dependencies Satisfied / Missing
- **Phases 1-19**: Complete and signed off.
- **Current Baseline Test Count**: Server: 559 passing (65 files); Client: 95 passing (20 files). Total: 654 passing tests.

## 3. Scope IN / Scope OUT
### Scope IN:
1. **Frontend Session Disassociation (`client/`)**:
   - In `client/src/hooks/use-chat.ts`, ensure `RESET_STATE` cleans all messages, current agent, blocked states, and conversation ID.
   - In `client/src/app/page.tsx`, ensure switching users immediately disassociates the active conversation ID and clears the chat feed before loading the new user's chats.
   - Ensure clicking "+ New Chat" unconditionally wipes `selectedConvId` and dispatches `RESET_STATE`, ensuring the next message creates a fresh conversation.
   - On authorization mismatch (`403 Forbidden` / ownership error), clear stale messages and present a clean conversation state.
2. **Conversational Router & Greeting Handling (`server/`)**:
   - In `server/src/routing/classifier/taxonomy.ts` & `classifier.ts`, define `GREETING` and update `GENERAL_INQUIRY` classification.
   - In `server/src/graphs/parent/parent-graph.ts`, when intent is `GREETING` or `GENERAL_INQUIRY` without domain specialist context:
     - Generate a conversational, grounded greeting via LLM (temperature 0.2) detailing OrchestrAI capabilities.
     - Keep `workflowStatus: 'WAITING_FOR_USER_INPUT'`, emit conversational `AIMessage`, and remain ready for domain dispatch on the subsequent turn.
3. **Test Suites**:
   - Unit tests in `client/src/hooks/use-chat.test.ts` and `client/src/app/page.test.tsx` for "+ New Chat" and user switching isolation.
   - Integration tests in `server/src/graphs/parent/parent-graph.test.ts` and `server/src/routing/classifier/classifier.test.ts` verifying greetings and subsequent domain routing.
   - Regression verification across all 654 existing tests and 14 REFERENCE scenarios.

### Scope OUT:
- Database schema changes for password hashing / real user auth (deferred to Phase 21).
- Modifying protected persistence or state reducer files (`schema.ts`, `client.ts`, `conversation-state.ts`).

## 4. Open Decisions This Phase Must Resolve
### OD-20: Conversational Router Agent Architecture for General Inquiries & Greetings
- **Context**: Currently, `taxonomy.ts` maps `GENERAL_INQUIRY` directly to `order_tracking`. `order-tracking.ts` immediately checks for an order ID UUID, replying with "I'd be happy to help track your order. Could you please provide your order ID?".
- **Options**:
  - *Option A (Router-Direct Conversational Response - Recommended)*:
    When the classifier returns `GREETING` or `GENERAL_INQUIRY`, `routerNode` does not dispatch `Command({ goto: 'order_tracking' })`. Instead, it generates a friendly customer-facing assistant response introducing OrchestrAI's support capabilities (Order tracking, returns, payments, refunds, account security, and profile updates) and returns `{ messages: [new AIMessage(...)], workflowStatus: 'WAITING_FOR_USER_INPUT' }`. When the user replies with a specific request, normal specialist routing engages.
  - *Option B (Dedicated Triage Specialist Subgraph)*:
    Build a new subgraph `triageNode` registered in `SPECIALIST_NODE_NAMES` and add it to the state graph.
- **Recommendation**: Adopt **Option A**. It avoids modifying state annotations or permissions allowlists, respects the master orchestrator pattern, and naturally handles conversational onboarding.

## 5. Ordered Steps

### Step 1: Frontend Chat Session Isolation & "+ New Chat" Disassociation (`client/`)
- **Files touched**:
  - `client/src/hooks/use-chat.ts`: Ensure `RESET_STATE` guarantees an empty conversation ID and message array; add explicit `resetChat()` handler.
  - `client/src/app/page.tsx`: Reset `selectedConvId` and chat state synchronously upon switching user or clicking "+ New Chat".
  - `client/src/hooks/use-chat.test.ts`: Verify "+ New Chat" and user switch resets messages and conversation state.
  - `client/src/app/page.test.tsx`: Component test for "+ New Chat" disassociation.
- **Protected files affected**: None.
- **Failure cases**: User switches back and forth between demo identities; ensure no stale transcripts or 403 leakages occur.

### Step 2: Server Conversational Router & Greeting Handling (`server/`)
- **Files touched**:
  - `server/src/routing/classifier/taxonomy.ts`: Add `GREETING` to taxonomy.
  - `server/src/routing/classifier/classifier.ts`: Add greeting examples to router classifier prompt.
  - `server/src/graphs/parent/parent-graph.ts`: Handle `GREETING` and general conversational inquiries directly in `routerNode` with an informative greeting message rather than forcing `order_tracking`.
  - `server/src/routing/classifier/classifier.test.ts`: Add tests for greeting classification.
  - `server/src/graphs/parent/parent-graph.test.ts`: Test greeting turn and subsequent specialist handoff.
- **Protected files affected**: None.
- **Failure cases**: Greeting followed immediately by order tracking; must transition cleanly to `order_tracking` without loop or escalation.

### Step 3: Full Cross-Workspace Verification & Docs
- **Files touched**:
  - `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`.
- **Run verification**: `npm run lint`, `npm run typecheck`, `npm test` across both `server/` and `client/`.

## 6. Functional Requirements
- Typing "hello there", "hi", or general inquiries must receive a helpful greeting explaining OrchestrAI support capabilities, NOT an order ID tracking prompt.
- Clicking "+ New Chat" must completely reset the chat feed, disconnect the conversation ID, and start a fresh conversation on the next message.
- Switching demo users in the dropdown must immediately clear the chat transcript of the previous user and never send messages to another user's conversation ID.

## 7. Non-Functional Requirements
- Maintain 100% test pass rate across the baseline 654 tests.
- All 14 evaluation scenarios from `REFERENCE.md` must continue to pass without regression.
- Zero extra external dependencies.

## 8. Acceptance Criteria
- Client tests: `npm test` in `client/` passes with all tests green.
- Server tests: `npm test` in `server/` passes with all tests green.
- Interactive verification:
  - User sends "hello there" -> Router replies with friendly greeting and capabilities.
  - User then sends "Where is order 06e54732-960c-438e-b68e-58e645a6f998" -> Seamlessly routes to `order_tracking`.
  - User clicks "+ New Chat" -> Feed is blank; next message starts a new thread with new conversation ID.
  - User switches identity -> Feed is reset; no 403 errors in console or lingering messages from previous identity.

## 9. Risks and Stop Triggers
- Any regression in the 14 reference scenarios -> Stop and inspect classification boundaries.
- Any attempt to modify protected files -> Stop and request explicit approval.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/ROADMAP.md` (add Phase 20)
- `docs/DECISIONS.md` (record OD-20)
- `docs/OPEN-DECISIONS.md` (resolve OD-20)

STOP here and request approval.

