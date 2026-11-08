# Phase 23 — Conversational UX, Interactive Service Menu & Order Tracking Fix — PLAN (status: DONE)

---

## 1. Goal and How it Fits the Architecture

This phase tightens three user-facing rough edges that emerged after the Phase 20–22 delivery:

1. **Dynamic greeting response** – The router currently emits a hardcoded, long, prescriptive introduction for every greeting.  We replace it with a brief, context-aware LLM-generated greeting (temperature 0.2) that adapts its tone and length to the input.  The router's core routing logic (guard order, `Command({ goto })` dispatch, `isGreetingMessage` regex) is **not changed**.

2. **Interactive service-option buttons** – When the conversation is in the opening state (no previous specialist, `workflowStatus !== 'ESCALATED'`, no active workflow), the assistant response includes a structured `options` array in the SSE `routing` metadata.  The client maps those options to clickable buttons in the chat feed that fire `sendMessage` with the selected service label.  No new state shape; the payload piggybacks on the existing `SSERoutingEvent` / `MessageMetadata` extension pattern.

3. **Order Tracking follow-up fix** – When the specialist is waiting for an Order ID (`workflowStatus === 'WAITING_FOR_USER_INPUT'`, `currentAgent === 'order_tracking'`) and the user submits text that the UUID fast-path cannot match, the LLM extraction currently runs but the `resumeContext` stored in `activeWorkflow` is **never used by `checkResumePreconditions`** because `blockedBy` is `null` only for Pattern B/C.  The real bug is that the router re-classifies the follow-up instead of routing directly back to `order_tracking` to retry extraction.  The fix is a lightweight guard in `routerNode`: when `state.routing.currentAgent === 'order_tracking'` AND `state.workflowStatus === 'WAITING_FOR_USER_INPUT'`, skip LLM classification and route back directly.

---

## 2. Dependencies Satisfied / Missing

- Phases 1–22: **COMPLETE and signed off** (STATUS.md line 6-24).
- All 715 tests passing; this phase's baseline is **715**.
- No new npm packages required.
- No schema migrations required.
- No new infrastructure required.

---

## 3. Scope IN / Scope OUT

### In Scope
- Replace static greeting string in `routerNode` with a short LLM-generated greeting + interactive options array in the response.
- Extend `SSERoutingEvent` on both server and client with an optional `options?: ServiceOption[]` field (additive, backward-compatible).
- Extend `MessageMetadata` client type with optional `options?: ServiceOption[]`.
- New `ServiceOptionBar` client component rendered beneath the assistant message when options are present.
- Clicking a service option fires `sendMessage(option.message)` — same code path as a typed message.
- Order Tracking guard: when `currentAgent === 'order_tracking'` and `workflowStatus === 'WAITING_FOR_USER_INPUT'`, skip classifier and route directly back to `order_tracking`.
- Tests for: new router behavior (greeting LLM branch, options in routing update, OT guard), `ServiceOptionBar` render/click.

### Out of Scope
- Any new backend infrastructure or database changes.
- Changing the guard order, `checkResumePreconditions`, or any protected file semantics.
- Redesigning the SSE streaming protocol.
- Changing any specialist beyond `order_tracking`.
- LangSmith trace changes.
- Persistent storage of service options.

---

## 4. Open Decisions This Phase Must Resolve

### OD-23a — Greeting Response: Static String vs. LLM-Generated (NEEDS APPROVAL)

**Problem:** The hardcoded greeting produces a long, repetitive intro on every "hello".

**Options:**

| | Option A: LLM-generated (temperature 0.2) | Option B: Rotate from a small bank of static strings |
|---|---|---|
| Naturalness | High — varies with phrasing | Medium — still repetitive across sessions |
| Latency | +~1 LLM call per greeting (~200–400ms) | Zero extra latency |
| Test stability | Needs mock (already mocked in Vitest) | Simple string match |
| Complexity | Low — reuses `generateStructuredOutput` already in the router context | Minimal |

**Recommendation:** **Option A** — LLM-generated greeting.  Fits the "platform feels intelligent" goal, and `@google/genai` is already mocked in Vitest so tests remain deterministic.  The greeting call uses the same `generateStructuredOutput` pattern already in every specialist.

### OD-23b — Interactive Options Transport: Routing Metadata vs. Dedicated SSE Event (NEEDS APPROVAL)

**Options:**

| | Option A: Add `options` to existing `SSERoutingEvent` / `MessageMetadata` | Option B: New `options` SSE event type |
|---|---|---|
| Protocol change | Additive only (backward-compatible) | New event type, client must handle or ignore |
| Client complexity | Low — `STREAM_ROUTING` already updates state | Medium — new reducer case |
| Risk to existing tests | Minimal — extra field ignored if not present | Moderate — parsers must skip |

**Recommendation:** **Option A** — extend `SSERoutingEvent` and `MessageMetadata` with an optional `options` field.  The existing SSE frame and reducer already handle `routing` events; adding an optional field is a backward-compatible, non-breaking addition.

### OD-23c — Order Tracking Re-Route Guard: Position in `routerNode` (NEEDS APPROVAL)

**Options:**

| | Option A: Add a new pre-classification guard inside `routerNode` body (after ESCALATE/RESUME, before LLM classify) | Option B: Extend `checkResumePreconditions` in `guards.ts` |
|---|---|---|
| Protected file impact | `parent-graph.ts` changed (not protected); `guards.ts` **is** listed as adjacent to protected routing infra but is not explicitly in the protected list | Only `guards.ts` modified |
| Clarity | Guard logic lives in `parent-graph.ts` where routing branch decisions already exist | Centralises all guard logic |
| Risk | Low — new `if` block in an existing switch-like sequence | Low — adds another check inside existing fn |

**Recommendation:** **Option A** — add the guard directly in `routerNode` between the RESUME block and the LLM classification.  `guards.ts` is not in the protected-file list; however, the guard pattern is conceptually: "when specialist is waiting for user input, do not reclassify — continue with the same specialist."  This is a routing continuation, not a resume of a blocked workflow, so it belongs in `routerNode` logic, not in `checkResumePreconditions`.

---

## 5. Steps

### Step 1 — Server: Dynamic LLM Greeting + Options in Routing Metadata
**Files touched:** `server/src/graphs/parent/parent-graph.ts`

- Replace the hardcoded `AIMessage` string in the `detectedIntent === 'GREETING'` branch with a call to `generateStructuredOutput` (schema: `{ greeting: z.string(), options: z.array(z.object({label: z.string(), message: z.string()})) }`).
- If the LLM call fails, fall back to a short static string (safe degradation).
- Include `options` in the state update — but `ConversationState` does **not** store them.  Instead, emit them in the SSE `routing` event (via the `routingUpdate`).

> **How options get to the client:** The `message.controller.ts` SSE `routing` event serialises the routing state update.  We extend `toRoutingStateUpdate` / `recordRoutingEvent` return type to pass through `options` as an extra field on the event that the controller forwards in the SSE frame.

Protected file check: `routing/events.ts` is **protected**.  To avoid modifying it, we pass options through a separate key on the `ConversationStateUpdate` extension approach is not feasible without schema changes.  Alternative: the SSE routing event in `message.controller.ts` reads `options` from the `state` snapshot after each graph step.  Since `options` will not be in `ConversationState`, we include them in the `AIMessage`'s `additional_kwargs` and extract them in the controller.

**Revised approach (no protected-file touch):**
- Encode `options` in the `AIMessage`'s `additional_kwargs.options` field (standard LangChain pattern for metadata).
- `message.controller.ts` reads `additional_kwargs.options` from the extracted AI message and includes it in the `routing` SSE event and the persisted message `metadata`.
- `routing/events.ts` is **not touched**.

**Files touched:** `server/src/graphs/parent/parent-graph.ts`, `server/src/api/controllers/message.controller.ts`

Protected file impact: **None.**

### Step 2 — Server: Order Tracking Continuation Guard
**Files touched:** `server/src/graphs/parent/parent-graph.ts`

- After the RESUME guard block, before LLM classification, add:
  ```ts
  if (
    state.routing.currentAgent === 'order_tracking' &&
    state.workflowStatus === 'WAITING_FOR_USER_INPUT'
  ) {
    // Route back to order_tracking without re-classifying
    targetSpecialist = 'order_tracking';
    detectedIntent = state.currentIntent ?? 'ORDER_STATUS';
    routingReason = 'Continuing order ID collection for active order_tracking session';
    // skip classifier
  }
  ```
- Skip the classifier and proceed to the normal dispatch path (Step 5 of `routerNode`).
- This guard fires only when the user is mid-collection and prevents reclassification to any other specialist or the greeting handler.

Protected file impact: **None.**

### Step 3 — Shared Types: `ServiceOption` + extend `SSERoutingEvent` / `MessageMetadata`
**Files touched:** `client/src/types/api.ts`, `client/src/types/sse.ts`

- Add `ServiceOption { label: string; message: string }` interface.
- Add optional `options?: ServiceOption[]` to `SSERoutingEvent` and `MessageMetadata`.
- Additive — no existing field changed.

### Step 4 — Client: `ServiceOptionBar` Component
**Files touched:** `client/src/components/chat/service-option-bar.tsx` (new), `client/src/components/chat/service-option-bar.test.tsx` (new)

- Renders a horizontal (wrapping) row of pill buttons from an `options` prop.
- Each button calls `onSelect(option.message)` when clicked.
- Visually: outlined indigo pills, disabled when `isStreaming` or `isEscalated`.
- Tests: renders correct labels, calls `onSelect` with correct message on click, disabled state.

### Step 5 — Client: Wire `ServiceOptionBar` into `ChatFeed`
**Files touched:** `client/src/components/chat/chat-feed.tsx`, `client/src/components/chat/chat-feed.test.tsx`

- Accept new `onOptionSelect?: (message: string) => void` prop and `serviceOptions?: ServiceOption[]` prop.
- Render `ServiceOptionBar` beneath the **last** assistant message when `serviceOptions` is non-empty.
- Pass `isStreaming` to disable buttons during a pending response.

### Step 6 — Client: Plumb Options Through `useChat` → `page.tsx`
**Files touched:** `client/src/hooks/use-chat.ts`, `client/src/app/page.tsx`

- In `chatReducer`, `STREAM_ROUTING` case: capture `options` from the routing event into `ChatState.serviceOptions?: ServiceOption[]`.  Clear `serviceOptions` to `null` on `START_SEND` (a new message starts, old options removed).
- In `page.tsx`, pass `serviceOptions={chatState.serviceOptions}` and `onOptionSelect={handleSend}` to `ChatFeed`.

### Step 7 — Tests
**Files touched:** `server/src/graphs/parent/parent-graph.test.ts`, `client/src/hooks/use-chat.test.ts`, new component test files

- Server unit test: `routerNode` with `isGreetingMessage` input → mock LLM → verify `AIMessage.additional_kwargs.options` present and contains expected service labels.
- Server unit test: `routerNode` with `currentAgent === 'order_tracking'` + `workflowStatus === 'WAITING_FOR_USER_INPUT'` state → verify `Command({ goto: 'order_tracking' })` returned without LLM classifier called.
- Client: `chatReducer` `STREAM_ROUTING` with `options` field → verify `serviceOptions` in state.
- Client: `chatReducer` `START_SEND` → verify `serviceOptions` cleared.
- `ServiceOptionBar` render and click tests (Step 4).
- `ChatFeed` options render test (Step 5).

---

## 6. Functional Requirements

1. When a user sends a greeting, the assistant replies with a **short, natural greeting** (≤2 sentences) and displays **up to 6 interactive service-option buttons**.
2. Clicking a service-option button sends the corresponding message exactly as if the user had typed it.
3. Service-option buttons are hidden once the user has sent any message after them.
4. When `currentAgent === 'order_tracking'` and `workflowStatus === 'WAITING_FOR_USER_INPUT'`, the router **skips LLM classification** and re-routes directly to `order_tracking`.
5. The order-tracking specialist accepts the user's follow-up text and re-runs UUID extraction; if still not found, it asks again (existing behavior — no change needed).
6. No existing evaluation scenarios (1–30) regress.

---

## 7. Non-Functional Requirements

- **Latency:** Greeting LLM call adds ≤500ms; acceptable for a conversational greeting.
- **Testability:** All LLM calls remain mockable via the existing Vitest `@google/genai` mock.
- **Backward compatibility:** The `options` field in SSE events and message metadata is optional; existing SSE consumers that do not read it are unaffected.
- **No protected-file changes:** `routing/events.ts`, `state/conversation-state.ts`, `persistence/db/client.ts`, `persistence/checkpointer/*`, `services/conversation-lifecycle.service.ts`, `routing/events.ts` — all untouched.
- **Test count:** Must not decrease from 715.

---

## 8. Acceptance Criteria

```
npm run lint                        # 0 errors / 0 warnings
npm run typecheck                   # 0 errors
npm test                            # ≥ 715 passing (server + client combined)
```

Specific named tests (new, must pass):
- `routerNode › greeting branch › generates LLM greeting with service options`
- `routerNode › order tracking guard › routes back to order_tracking when WAITING_FOR_USER_INPUT`
- `chatReducer › STREAM_ROUTING with options › populates serviceOptions in state`
- `chatReducer › START_SEND › clears serviceOptions`
- `ServiceOptionBar › renders correct labels and fires onSelect with message`
- `ServiceOptionBar › disabled when isStreaming`
- `ChatFeed › renders ServiceOptionBar when serviceOptions is non-empty`

---

## 9. Risks and What Would Make Me Stop and Ask

| Risk | Mitigation / Stop condition |
|---|---|
| `generateStructuredOutput` mock in Vitest does not cover the new greeting call site | Verify mock shape; stop and ask if Vitest mock doesn't expose new call |
| `additional_kwargs` on `AIMessage` is not serialised in the SSE `message` event but only in the routing event path | Verify `message.controller.ts` extraction path; stop and ask if LangGraph strips `additional_kwargs` before controller access |
| OT guard interacts badly with Pattern C resume (specialist is `order_tracking` AND `blockedBy` is set) | The Pattern C guard (`checkResumePreconditions`) runs **before** the new guard; if `blockedBy` is set, `RESUME` path fires first and the new guard is never reached — no conflict |
| Adding `options` to `ChatState` requires a new test for `RESET_STATE` | Update existing `RESET_STATE` test; not a stop condition |

---

## 10. Docs to Update on Completion

- `docs/STATUS.md` — phase state, baseline test count.
- `docs/DECISIONS.md` — OD-23a, OD-23b, OD-23c.
- `docs/OPEN-DECISIONS.md` — move OD-23a/b/c to resolved.
- `docs/ROADMAP.md` — add Phase 23 checkbox (checked).

---

**STOP — awaiting approval before writing any production code.**

