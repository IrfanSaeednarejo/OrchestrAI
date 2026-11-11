# Phase 24 Plan — Conversational Routing & Memory Overhaul

## 1. Goal
Overhaul the parent router, intent classifier, and conversation state architecture to eliminate sticky guard locks, enable conversational capability triage, provide short-turn conversational memory (entities and transcript history), clean up UI progress leakage, and support multi-intent queuing.

## 2. Baseline Status
- Branch: `phase/24-conversational-routing`
- Baseline test count: 759 passing tests (615 server tests, 144 client tests).
- Pre-existing regression tests: `server/src/graphs/parent/conversation-flow.test.ts` (Scenarios A–D failing as expected on legacy code, Scenarios E–F passing).

## 3. Architecture Overview
1. **Router Decision Model:** The router evaluates every turn dynamically through classification, removing sticky continuation locks (guards 3b and 3c). It retains narrow, deterministic payload fast paths:
   - Pure UUID format matching an active inquiry.
   - Pure 6-digit numeric format matching pending identity verification (`verify_identity`).
2. **Contextual Intent Classifier:** Input includes recent message transcript, pending task context, and current domain. Output includes a routing decision (`CONTINUE`, `SWITCH`, or `GENERAL`), ordered intents, and confidence. Low confidence produces clarifying questions rather than silently defaulting to `order_tracking`.
3. **General Assistant Specialist Node:** Handles greetings, capability questions ("what else can you do?"), and store chit-chat, grounded in a typed platform capabilities registry (`server/src/agents/specialists/general-assistant/`).
4. **Conversation Entity Memory:** Additive `lastKnownEntities` field in `ConversationState` (`server/src/state/conversation-state.ts`, protected file, approved) storing recent order, payment, and return references.
5. **Transcript Context Injection:** Shared utility `formatConversationTranscript` injects recent turns into extraction and customer response prompts across all specialists.
6. **Suggestions & Progressive Activity:** Response schema updated to `{ response: string, suggestions: string[] }`. Server-sent events include typed `event: activity` delivering user-friendly progress descriptions (`"Checking your order status..."`) while keeping raw node telemetry in ops traces.
7. **Multi-Intent Queue:** Classifier outputs up to 2 detected intents; router executes the primary intent and queues secondary in state.

## 4. Step Breakdown

### Step 24.0: Regression Tests for Conversational Routing (COMPLETED)
- Added `server/src/graphs/parent/conversation-flow.test.ts`.
- Verified Scenarios A–D fail for diagnosed reasons; Scenarios E–F pass.

### Step 24.1: Router Decision Model & General Assistant Node
- Files touched:
  - `server/src/agents/specialists/general-assistant/general-assistant.ts` (NEW)
  - `server/src/agents/specialists/general-assistant/capabilities.ts` (NEW)
  - `server/src/routing/classifier/taxonomy.ts`
  - `server/src/routing/classifier/classifier.ts`
  - `server/src/graphs/parent/parent-graph.ts`
  - `server/src/tools/permissions.ts`
- Changes:
  - Remove sticky continuation guards 3b and 3c in `parent-graph.ts`.
  - Narrow Guard 3a to pure 6-digit OTP regex (`^\d{6}$`). Keep narrow bare-UUID regex fast path.
  - Add `general_assistant` to `SpecialistId` and register node in `parent-graph.ts`.
  - Ground `general_assistant` in typed capabilities registry.
  - Safe fallback: low classifier confidence triggers a clarifying question instead of silently routing to `order_tracking`.
- Verification: Scenarios A, B, D in `conversation-flow.test.ts` pass.

### Step 24.2: Pending-Task State & Entity Memory
- Files touched:
  - `server/src/state/conversation-state.ts` (protected file - approved)
  - `server/src/state/conversation-state.test.ts`
  - `server/src/graphs/parent/parent-graph.ts`
- Changes:
  - Add `lastKnownEntities?: { orderId?: string | null; paymentId?: string | null; returnId?: string | null; lastUpdated?: string }` to `ConversationState` annotation and reducer.
  - Add `pendingTask?: { specialist: SpecialistId; awaitingField: string; context?: Record<string, unknown> } | null` to `ConversationState`.
  - Specialists write discovered/created IDs to `lastKnownEntities`.
  - Clear non-verification `pendingTask` when user switches intent.
- Verification: State serialization unit tests pass.

### Step 24.3: History and Entity Context Injection into Specialists & Classifier
- Files touched:
  - `server/src/agents/common/context.ts` (NEW)
  - `server/src/routing/classifier/classifier.ts`
  - `server/src/agents/specialists/order-tracking/order-tracking.ts`
  - `server/src/agents/specialists/returns/returns.ts`
  - `server/src/agents/specialists/payment/payment.ts`
  - `server/src/agents/specialists/refund/refund.ts`
  - `server/src/agents/specialists/profile/profile.ts`
- Changes:
  - Implement `formatConversationTranscript(messages, limit = 6)`.
  - Classifier prompt includes transcript and `lastKnownEntities`.
  - Specialist prompts include transcript and read `lastKnownEntities` for "this order" references.
- Verification: Scenario C in `conversation-flow.test.ts` passes.

### Step 24.4: Contextual Suggestion Generation
- Files touched:
  - `server/src/agents/prompts/`
  - `server/src/graphs/parent/parent-graph.ts`
  - `server/src/api/controllers/message.controller.ts`
- Changes:
  - Response schemas output `{ response: string, suggestions: string[] }`.
  - Suggestions forwarded via message metadata and SSE `event: routing`.

### Step 24.5: Customer Activity Events & Specialist UI Decoupling
- Files touched:
  - `server/src/api/controllers/message.controller.ts`
  - `client/src/types/sse.ts`
  - `client/src/components/chat/chat-feed.tsx`
  - `client/src/hooks/use-chat.ts`
- Changes:
  - SSE emits `event: activity` with user-friendly descriptions.
  - User chat feed displays activity text instead of raw internal node names.

### Step 24.6: Multi-Intent Queueing & Conditional Routing
- Files touched:
  - `server/src/state/conversation-state.ts` (protected file - approved)
  - `server/src/graphs/parent/parent-graph.ts`
  - `server/src/routing/classifier/classifier.ts`
- Changes:
  - Classifier returns ordered intents list (max 2).
  - Router queues secondary intent in `state.pendingIntents`.
  - Specialists transition back to router when secondary intent is pending (capped at 2 handoffs).

### Step 24.7: Frontend Modernization
- Files touched:
  - `client/src/components/chat/chat-feed.tsx`
  - `client/src/components/chat/service-option-bar.tsx`
  - `client/src/hooks/use-chat.ts`
- Changes:
  - Modernize chip rendering from dynamic suggestions.
  - Update `useChat` reducer for `STREAM_ACTIVITY`.

### Step 24.8: End-to-End Verification & Documentation Closeout
- Files touched:
  - `server/src/api/conversation-flow.integration.test.ts` (NEW)
  - `docs/STATUS.md`
  - `docs/DECISIONS.md`
  - `docs/ROADMAP.md`
- Verification: Full suite passes, all 14 evaluation scenarios pass.
