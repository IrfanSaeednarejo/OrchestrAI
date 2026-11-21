# OrchestrAI — Complete Frontend Application Audit

**Date:** November 21, 2026  
**Auditor:** Antigravity Agent  
**Scope:** `client/` frontend application code, components, routes, styles, and configurations  
**Authority Reference:** `client/ORCHESTRAI_DESIGN_SYSTEM.md`  
**Status:** Complete Read-Only Inspection & Structural Baseline  

---

## 1. Application Overview

OrchestrAI is a portfolio-grade, stateful multi-agent customer support platform built with Next.js 14 (App Router), React 18, TypeScript, and Tailwind CSS. The frontend fulfills two core functions:

1. **Customer-Facing Commerce & Autonomous Support Interface**:
   * Real-time conversational AI support powered by six specialist subgraphs (`order_tracking`, `payment`, `returns`, `refund`, `account_access`, `profile`) and a supervisor router.
   * Full customer lifecycle: JWT-based user authentication, product catalog browsing, cart calculation, order placement, and live delivery status tracking with 1-click agent handoff.
2. **Platform & Ops Observability Console**:
   * Real-time conversation thread explorer with filtering and search.
   * Granular execution trace inspector displaying multi-agent routing trajectories, event timelines, and tool execution telemetry.
   * Deterministic 30-scenario evaluation benchmark dashboard scoring routing precision, tool scoping, and safety guardrails across 8 binary metrics.

### Technical Stack & Runtime Environment
* **Framework**: Next.js 14.2.35 (React 18.3.1, React DOM 18.3.1)
* **Styling**: Tailwind CSS 3.4.15, PostCSS 8.4.49, Autoprefixer 10.4.20
* **Typography**: Tailwind default system font stack (no custom web fonts loaded currently)
* **Icons**: `lucide-react` 0.460.0
* **Markdown Rendering**: `react-markdown` 9.0.1 + `remark-gfm` 4.0.0
* **Testing Suite**: Vitest 2.1.5, JSDOM 25.0.1, `@testing-library/react` 16.0.1 (28 test suites, 150 passing tests)
* **Backend Connection**: Express API at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`)
  * REST API: authentication, conversations, messages, demo users, store catalog, order placement, ops observability.
  * SSE (Server-Sent Events): chunked assistant responses, node progress updates, agent activity indicators, and routing decision telemetry (`POST /api/conversations/:id/messages` with `Accept: text/event-stream`).

---

## 2. Complete Route Inventory

| Route | Route Type | File Location | Auth Requirement | Layout Hierarchy | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Page | `src/app/page.tsx` | **Protected** (via `useRequireAuth('/')`) | `RootLayout` | Primary customer support chat interface, conversation sidebar, and modal hubs. |
| `/login` | Page | `src/app/login/page.tsx` | **Public** (redirects if authenticated) | `RootLayout` | Standalone sign-in page with email/password authentication. |
| `/register` | Page | `src/app/register/page.tsx` | **Public** (redirects if authenticated) | `RootLayout` | Standalone user registration page capturing name, email, shipping address, and password. |
| `/store` | Page | `src/app/store/page.tsx` | **Protected** (via `useRequireAuth('/store')`) | `RootLayout` | Hardware product catalog, interactive cart, checkout submission, and order receipt modal. |
| `/orders` | Page | `src/app/orders/page.tsx` | **Protected** (via `useRequireAuth('/orders')`) | `RootLayout` | Customer order history, shipping destination tracking, and 1-click "Ask Agent" routing. |
| `/ops` | Page | `src/app/ops/page.tsx` | **Public / Ops Role** | `RootLayout` $\to$ `OpsLayout` | Platform Conversation Explorer with KPI stat cards, search, status filter, and data table. |
| `/ops/evals` | Page | `src/app/ops/evals/page.tsx` | **Public / Ops Role** | `RootLayout` $\to$ `OpsLayout` | 30-Scenario Canonical Evaluation Benchmark Scorecard across domains and evaluators. |
| `/ops/traces/[id]` | Dynamic Page | `src/app/ops/traces/[id]/page.tsx` | **Public / Ops Role** | `RootLayout` $\to$ `OpsLayout` | Granular execution trace inspector for a single conversation thread. |
| *Route Error Boundary* | Boundary | `src/app/error.tsx` | Global | Within Route | Client-side error recovery with "Try Again" and "Return Home". |
| *Root Error Boundary* | Boundary | `src/app/global-error.tsx` | Global | Root Level | Catch-all error page when `RootLayout` fails to render. |
| *404 Not Found* | Not Found | `src/app/not-found.tsx` | Global | `RootLayout` | Global 404 handler with direct navigation links. |

### Layout & Navigation Structure
1. **Root Layout** (`src/app/layout.tsx`):
   * Wraps all routes in `Providers` (`AuthProvider`).
   * Currently applies `bg-slate-50 text-slate-900 antialiased` to `<body>`.
2. **Ops Layout** (`src/app/ops/layout.tsx`):
   * Wraps `/ops`, `/ops/evals`, and `/ops/traces/[id]`.
   * Houses the global `TopNav` and a secondary `ops-subnav` bar linking between `/ops` (Conversations) and `/ops/evals` (Benchmark).
3. **Primary Top Navigation** (`src/components/navigation/top-nav.tsx`):
   * Persistent across `/`, `/store`, `/orders`, and `/ops`.
   * Displays the brand identity, active tabs, user session pill, and sign-in/out triggers.

---

## 3. Page-by-Page Breakdown

### 3.1 Home / Chat Page (`src/app/page.tsx`)
* **Purpose**: Primary customer chat interface assembling the sidebar, chat feed, input bar, status alerts, and modals.
* **Component Composition**:
  * `TopNav` (global header)
  * `ConversationSidebar` (left panel, width 288px–320px)
  * `ChatFeed` (center feed container with auto-scroll)
  * `SpecialistBadge` & `TurnStatusBadges` (chat header)
  * `VerificationPrompt` (conditional inline verification banner)
  * `MessageInput` (bottom pinned textarea and send trigger)
  * `AuthModal` & `StorefrontModal` (dialog overlays)
* **State & Data Integrations**:
  * `useRequireAuth('/')`: checks authentication; redirects unauthenticated visitors to `/login?redirect=%2F`.
  * `useChat(activeUserId, selectedConvId, activeToken)`: manages full SSE lifecycle, messages, and streaming states.
  * URL query parameters: detects `?orderId=...` and pre-fills `initialDraft` prompt ("Where is my order ...?").
* **Visual States**:
  * Loading auth spinner (`bg-slate-950`).
  * Escalation banner (`bg-rose-50 border-rose-200 text-rose-800`).
  * Communication error banner with retry button (`bg-amber-50 border-amber-200`).
  * Header resolved badge (`bg-emerald-50 text-emerald-700`).

### 3.2 Login Page (`src/app/login/page.tsx`)
* **Purpose**: Standalone customer authentication entry point.
* **Component Composition**:
  * Centered card container (`max-w-md bg-slate-900 border-slate-800`).
  * Brand icon (`Sparkles` in `bg-indigo-600 rounded-xl`).
  * Form inputs: Email (`Mail` icon) and Password (`Lock` icon).
  * Submit button with spinning loader (`Loader2`).
  * Navigation link to `/register`.
* **State & Data Integrations**:
  * Uses `useAuth().login(email, password)`.
  * Preserves `?redirect=...` query param on successful sign-in.
  * Displays error banner (`bg-rose-950/70 border-rose-800`) on validation or HTTP failure.

### 3.3 Register Page (`src/app/register/page.tsx`)
* **Purpose**: New customer onboarding and account creation.
* **Component Composition**:
  * Centered card container (`max-w-md bg-slate-900 border-slate-800`).
  * Form inputs: Full Name (`User`), Email (`Mail`), Shipping Address (`MapPin`), and Password (`Lock`).
  * Submit button with loading state.
  * Navigation link to `/login`.
* **State & Data Integrations**:
  * Uses `useAuth().register(...)`.
  * Validates minimum password length (8 chars).
  * Automatically redirects to `redirect` param or `/store` upon creation.

### 3.4 Orders Page (`src/app/orders/page.tsx`)
* **Purpose**: Dedicated order management dashboard displaying past transactions and live shipping tracking.
* **Component Composition**:
  * `TopNav` (global header).
  * Page title, subtitle, refresh button, and Storefront CTA link.
  * Order cards list rendering ID, creation timestamp, total amount, shipping address, and status badge.
  * Bottom action button: "Ask Agent About This Order" (triggers router navigation to `/?orderId=${order.id}`).
* **State & Data Integrations**:
  * `useRequireAuth('/orders')`.
  * Calls `fetchUserOrders(token, user.id)` via `api-client.ts`.
* **Visual States**:
  * Loading spinner (`Loader2` in `text-indigo-500`).
  * Error alert banner with retry button (`bg-rose-950/40 border-rose-800/60`).
  * Empty state card with dashed border and "Browse Store Catalog" button.
  * Status badges (`getStatusBadge`):
    * `paid`: `bg-emerald-950/70 text-emerald-300 border-emerald-800/60`
    * `shipped`: `bg-sky-950/70 text-sky-300 border-sky-800/60`
    * `delivered`: `bg-purple-950/70 text-purple-300 border-purple-800/60`
    * `cancelled`: `bg-rose-950/70 text-rose-300 border-rose-800/60`
    * `returned`: `bg-amber-950/70 text-amber-300 border-amber-800/60`
    * `pending`: `bg-amber-950/70 text-amber-300 border-amber-800/60`

### 3.5 Store Page (`src/app/store/page.tsx`)
* **Purpose**: Hardware products catalog, interactive cart management, checkout execution, and receipt display.
* **Component Composition**:
  * `TopNav` (global header).
  * Two-column layout on desktop:
    * Left (2 cols): Product cards grid with SKU, stock status, name, price, and $+/-$ quantity controls.
    * Right (1 col): Sticky order summary card with item breakdown, delivery destination snapshot, and checkout button.
  * Order Confirmed receipt modal/card (`data-testid="order-confirmation-card"`):
    * Displays confirmed Order ID, tracking number, payment status (`Captured`), and shipment status (`In Transit`).
    * Direct CTA: "Ask Agent to Track Order".
* **State & Data Integrations**:
  * `useRequireAuth('/store')`.
  * Calls `fetchProducts()` and `apiPlaceOrder(items, token, userId)`.
* **Visual States**:
  * Loading state, error alert banner, empty catalog state.
  * Cart button loading state (`Loader2` + "Processing Order...").

### 3.6 Ops / Conversation Explorer Page (`src/app/ops/page.tsx`)
* **Purpose**: Observability dashboard for engineering and support teams to inspect live conversations and routing threads.
* **Component Composition**:
  * Header with title, subtitle, and three KPI stat cards (Total, Active, Escalated).
  * `ConversationTable` component.
* **State & Data Integrations**:
  * Calls `fetchOpsConversations(50, 0)` via `ops-client.ts`.
* **Visual States**:
  * KPI metric cards with icons (`MessageSquare`, `CheckCircle2`, `AlertTriangle`).
  * Error alert banner with `ShieldAlert`.

### 3.7 Ops / Evaluation Benchmark Page (`src/app/ops/evals/page.tsx`)
* **Purpose**: QA benchmark dashboard presenting automated test suite metrics across 30 canonical multi-agent scenarios.
* **Component Composition**:
  * Header with re-run button (`RefreshCw`).
  * `EvalScorecard` component.
* **State & Data Integrations**:
  * Calls `fetchOpsEvalResults()` via `ops-client.ts`.
* **Visual States**:
  * Loading animation executing 30 scenarios.
  * Error alert banner with retry.

### 3.8 Ops / Trace Inspector Page (`src/app/ops/traces/[id]/page.tsx`)
* **Purpose**: Deep-dive timeline inspector visualizing execution steps, routing decisions, and tool calls for a specific thread.
* **Component Composition**:
  * Top navigation back link and refresh button.
  * Header info card with conversation ID, status badge, message count, event count, and routing step count.
  * `HandoffBreadcrumbs` component.
  * `TraceTimeline` component.
* **State & Data Integrations**:
  * Reads `params.id` and calls `fetchOpsTrace(conversationId)` via `ops-client.ts`.

### 3.9 Error & Fallback Boundaries
* **Route Error Boundary** (`src/app/error.tsx`):
  * Renders on client crash with "Something went wrong", raw error message, "Try Again" (`reset()`), and "Return Home".
* **Root Global Error Boundary** (`src/app/global-error.tsx`):
  * Catch-all root layout crash handler with minimal inline HTML.
* **Not Found Page** (`src/app/not-found.tsx`):
  * 404 screen with `Compass` icon and navigation back to Support Chat or Ops Dashboard.

---

## 4. Component Inventory with File Paths

Below is the complete audit of all 16 UI components across the client application.

### 4.1 `TopNav`
* **File Path**: `src/components/navigation/top-nav.tsx`
* **Where Used**: `src/app/page.tsx`, `src/app/orders/page.tsx`, `src/app/store/page.tsx`, `src/app/ops/layout.tsx`
* **Classification**: **Shared Shell Component**
* **Visual Purpose**: Fixed top application header (56px / `h-14`) displaying brand logo, navigation tabs (Support Chat, Store, My Orders, Platform Ops), active route indicator, and user account pill / sign-in button.
* **Existing Interactions**:
  * Route navigation via Next.js `Link`.
  * User sign-out trigger calling `authContext.logout()`.
* **Dependencies**: `next/link`, `next/navigation` (`usePathname`), `lucide-react`, `auth-context`.

### 4.2 `ConversationSidebar`
* **File Path**: `src/components/sidebar/conversation-sidebar.tsx`
* **Where Used**: `src/app/page.tsx`
* **Classification**: **Page-Specific Shell Component** (Chat view)
* **Visual Purpose**: Left navigation drawer displaying active session status, "+ New Chat" button, Storefront shortcut icon, scrollable conversation list with timestamps and status, and bottom authenticated user profile card.
* **Existing Interactions**:
  * `onNewChat`: clears active conversation.
  * `onSelect(id)`: switches active conversation.
  * `onOpenStore`: launches storefront modal.
  * `logout`: signs user out.
* **Dependencies**: `next/link`, `lucide-react`, `auth-context`, `Conversation` type.

### 4.3 `ChatFeed`
* **File Path**: `src/components/chat/chat-feed.tsx`
* **Where Used**: `src/app/page.tsx`
* **Classification**: **Page-Specific Chat Component**
* **Visual Purpose**: Central message stream container displaying welcome state, user plain-text bubbles, assistant Markdown bubbles, streaming response bubble with active node progress indicator, and interactive service options bar.
* **Existing Interactions**:
  * Auto-scrolls to bottom on message change or streaming token arrival.
  * Privacy guard: detects 6-digit OTP codes and masks them cosmetically as `••••••`.
  * Dispatches `onOptionSelect` when a quick-service pill is clicked.
* **Dependencies**: `lucide-react`, `MarkdownRenderer`, `ServiceOptionBar`, `Message`, `ServiceOption` types.

### 4.4 `MessageInput`
* **File Path**: `src/components/chat/message-input.tsx`
* **Where Used**: `src/app/page.tsx`
* **Classification**: **Page-Specific Chat Component**
* **Visual Purpose**: Bottom pinned multiline composer with auto-resizing textarea (up to 160px max height), dynamic placeholder text based on verification/escalation state, send button with icon, and escalation lock warning.
* **Existing Interactions**:
  * `Enter` to send, `Shift+Enter` for newline.
  * Automatically resizes DOM textarea height via `scrollHeight`.
  * Disabled when streaming, loading, or escalated (`ESCALATED`).
* **Dependencies**: `lucide-react`, `WorkflowStatus` type.

### 4.5 `MarkdownRenderer`
* **File Path**: `src/components/chat/markdown-renderer.tsx`
* **Where Used**: `src/components/chat/chat-feed.tsx`
* **Classification**: **Shared Chat Component**
* **Visual Purpose**: Security-hardened Markdown renderer for assistant messages, tables, lists, and inline/block code snippets.
* **Existing Interactions**:
  * Strictly sanitizes links (blocks `javascript:`, `data:`, `vbscript:`).
  * Forces `target="_blank"` and `rel="noopener noreferrer"`.
  * Intercepts `<img>` tags and renders them as safe clickable links (never autoloads external images).
* **Dependencies**: `react-markdown`, `remark-gfm`.

### 4.6 `SpecialistBadge`
* **File Path**: `src/components/chat/specialist-badge.tsx`
* **Where Used**: `src/app/page.tsx`
* **Classification**: **Shared Chat Component**
* **Visual Purpose**: Header status badge displaying the currently active agent specialist (`order_tracking`, `payment`, `returns`, `refund`, `account_access`, `profile`, `router`) along with multi-agent handoff count counter pill.
* **Existing Interactions**: Tooltip explaining handoff counts; graceful fallback for unknown/unmapped specialist agent names.
* **Dependencies**: `lucide-react`.

### 4.7 `VerificationPrompt`
* **File Path**: `src/components/chat/verification-prompt.tsx`
* **Where Used**: `src/app/page.tsx`
* **Classification**: **Shared Chat Component**
* **Visual Purpose**: Inline security verification banner driven by state machine (`IDLE`, `SENT_AWAITING_CODE`, `COOLDOWN_ACTIVE`, `SEND_FAILED`, `EXPIRED`, `LOCKED_OUT`), countdown timer, resend button, and dev-mode OTP peeking tool.
* **Existing Interactions**:
  * Countdown intervals for expiry and resend cooldown.
  * Dev-mode OTP inspection calling `peekDevVerificationCode`.
  * Copy-to-clipboard trigger.
* **Dependencies**: `lucide-react`, `api-client.ts`.

### 4.8 `ServiceOptionBar`
* **File Path**: `src/components/chat/service-option-bar.tsx`
* **Where Used**: `src/components/chat/chat-feed.tsx`
* **Classification**: **Shared Chat Component**
* **Visual Purpose**: Horizontal row of clickable quick-action buttons rendered directly beneath greeting/assistant messages.
* **Existing Interactions**: Clicking an option dispatches `onSelect(option.message)`, firing the message immediately without manual typing.
* **Dependencies**: `ServiceOption` type.

### 4.9 `AuthModal`
* **File Path**: `src/components/auth/auth-modal.tsx`
* **Where Used**: `src/app/page.tsx`, `src/components/store/storefront-modal.tsx`
* **Classification**: **Shared Modal Component**
* **Visual Purpose**: Accessible dialog overlay with tab switcher between "Sign In" and "Create Customer Account", form validation, and submit button.
* **Existing Interactions**:
  * Switch tabs (`login` vs `register`).
  * Form submission calling `authContext.login` or `authContext.register`.
  * Backdrop click / close button calling `onClose()`.
* **Dependencies**: `lucide-react`, `auth-context`.

### 4.10 `StorefrontModal`
* **File Path**: `src/components/store/storefront-modal.tsx`
* **Where Used**: `src/app/page.tsx`
* **Classification**: **Shared Modal Component**
* **Visual Purpose**: Modal catalog allowing customers to view hardware products, adjust quantities, place an order, and receive an instant order receipt without leaving the chat view.
* **Existing Interactions**:
  * Quantity increment/decrement.
  * Direct checkout execution via `apiPlaceOrder`.
  * "Ask Agent About This Order" action transferring order ID into chat.
* **Dependencies**: `lucide-react`, `api-client.ts`, `auth-context`, `Product`, `PlaceOrderResponse` types.

### 4.11 `ConversationTable`
* **File Path**: `src/components/ops/conversation-table.tsx`
* **Where Used**: `src/app/ops/page.tsx`
* **Classification**: **Ops Component**
* **Visual Purpose**: Data table rendering conversations with search input (by ID, email, or name), status dropdown filter (`all`, `active`, `escalated`, `archived`), turn count, formatted timestamps, and direct "Inspect" action link.
* **Existing Interactions**:
  * Live client-side text filtering and status selection.
  * Manual table refresh trigger.
  * Link navigation to `/ops/traces/[id]`.
* **Dependencies**: `next/link`, `lucide-react`, `OpsConversation` type.

### 4.12 `EvalScorecard`
* **File Path**: `src/components/ops/eval-scorecard.tsx`
* **Where Used**: `src/app/ops/evals/page.tsx`
* **Classification**: **Ops Component**
* **Visual Purpose**: Benchmark scorecard displaying overall pass rate, domain breakdown progress bars, 8 binary evaluator progress bars, and a filterable scenario results table.
* **Existing Interactions**:
  * Search input filtering scenario names, IDs, and patterns.
  * Domain dropdown filtering by specialist domain.
* **Dependencies**: `lucide-react`, `BenchmarkReport` type.

### 4.13 `HandoffBreadcrumbs`
* **File Path**: `src/components/ops/handoff-breadcrumbs.tsx`
* **Where Used**: `src/app/ops/traces/[id]/page.tsx`
* **Classification**: **Ops Component**
* **Visual Purpose**: Visual routing trajectory diagram showing sequential handoff transitions across specialist agents, highlighting the final active agent.
* **Existing Interactions**: Visual display of routing path array.
* **Dependencies**: `lucide-react`.

### 4.14 `ToolExecutionCard`
* **File Path**: `src/components/ops/tool-execution-card.tsx`
* **Where Used**: `src/components/ops/trace-timeline.tsx`
* **Classification**: **Ops Component**
* **Visual Purpose**: Collapsible telemetry card for a single tool call showing tool name, execution latency (in ms), success/failure status badge, timestamp, and formatted error details.
* **Existing Interactions**: Toggle open/closed state to reveal error and telemetry details.
* **Dependencies**: `lucide-react`, `OpsToolEvent` type.

### 4.15 `TraceTimeline`
* **File Path**: `src/components/ops/trace-timeline.tsx`
* **Where Used**: `src/app/ops/traces/[id]/page.tsx`
* **Classification**: **Ops Component**
* **Visual Purpose**: Chronological vertical event timeline alternating between supervisor routing decisions (intent, rationale, decision type) and agent execution turns (latency, invoked tools, errors).
* **Existing Interactions**: Embedded collapsible `ToolExecutionCard` components.
* **Dependencies**: `lucide-react`, `ToolExecutionCard`, `OpsTimelineEvent` types.

### 4.16 `Providers`
* **File Path**: `src/components/providers.tsx`
* **Where Used**: `src/app/layout.tsx`
* **Classification**: **Root Wrapper**
* **Visual Purpose**: Non-visual React context provider wrapper injecting `AuthProvider`.
* **Dependencies**: `auth-context.tsx`.

---

## 5. Functional Inventory

### 5.1 Chat Submission & SSE Streaming
* **Initiation**: Triggered from `MessageInput` via `useChat().sendMessage(text)`.
* **Double-Submission Lock**: Enforced synchronously via `isSendingRef.current = true` before React state updates flush, preventing duplicate network dispatches.
* **Conversation Provisioning**: If `conversationId` is null, automatically calls `createConversation(userId, token)` before dispatching the user turn.
* **SSE Stream Processing**:
  * Consumes SSE event stream using `ReadableStreamDefaultReader` in `src/lib/api-client.ts`.
  * Emits typed events:
    * `start`: establishes active conversation ID.
    * `node`: tracks graph step (e.g. `supervisor_router`, `order_tracking`).
    * `activity`: provides human-readable step text (e.g. "Looking up order status...").
    * `message`: stream chunks concatenated into `streamingText`.
    * `routing`: updates `currentAgent`, `handoffCount`, `blockedBy`, `currentStep`, `workflowStatus`, and `options`.
    * `done`: flushes `finalAssistantMessage`, resets streaming flags, and triggers background message sync.
    * `error`: captures stream errors and transitions workflow status to `FAILED`.

### 5.2 Conversation History & Switching
* Handled via `ConversationSidebar` calling `useChat().loadConversation(id)`.
* Fetches message history via `GET /api/conversations/:id/messages`.
* Pure reducer function `deriveStateFromMessages` parses the last assistant message's metadata to restore agent specialist, handoff count, blocked state, and workflow status.

### 5.3 Specialist-Agent Identification & Handoffs
* The backend routing supervisor selects from six specialized agents:
  1. `order_tracking`: Order delivery dates, carrier info, location tracking.
  2. `payment`: Billing receipts, payment methods, transaction charges.
  3. `returns`: RMA authorization, return labels, return eligibility.
  4. `refund`: Payment reversions, balance adjustments.
  5. `account_access`: OTP identity verification, login credentials, security recovery.
  6. `profile`: Customer shipping address changes, contact updates.
* Current agent is displayed in the header badge (`SpecialistBadge`) and in Ops timelines (`HandoffBreadcrumbs`).
* Handoff count increments monotonically on multi-agent hops.

### 5.4 Agent Activity & Tracing
* While streaming, `currentNode` and `currentActivity` render an animated pulsing pill (`node-progress-indicator`) above the streaming assistant bubble.
* In Ops mode, full execution trees are fetched from `/api/ops/conversations/:id/traces`, detailing exact tool invocations, execution duration in milliseconds, and supervisor reasoning strings.

### 5.5 Operation Execution & Commerce Flow
* **Storefront**: Fetches hardware inventory via `GET /api/store/products`.
* **Cart Calculations**: Calculates subtotal dynamically across selected quantities in state.
* **Order Placement**: Executes `POST /api/store/orders`, capturing shipping snapshot and issuing immediate tracking numbers.
* **Agent Handoff**: Order confirmation receipt features an "Ask Agent to Track Order" button which loads `/` with prefilled prompt and order ID.

### 5.6 Authentication & Validation
* Managed by `AuthContext` with Bearer token persistence in `localStorage` under `orchestrai_token`.
* Authenticated sessions validate automatically on boot via `GET /api/auth/me`.
* Protected pages (`/`, `/store`, `/orders`) use `useRequireAuth()` to intercept unauthenticated users and redirect them to `/login?redirect=...`.

---

## 6. Architecture & Dependency Overview

### 6.1 Application Directory Structure
```
client/
├── src/
│   ├── app/                    # Next.js App Router pages and route groups
│   │   ├── login/              # Standalone login page
│   │   ├── register/           # Standalone registration page
│   │   ├── store/              # Hardware product catalog & checkout
│   │   ├── orders/             # Customer order history & live tracking
│   │   ├── ops/                # Platform/Ops console
│   │   │   ├── evals/          # Evaluation benchmark dashboard
│   │   │   ├── traces/[id]/    # Single conversation execution trace inspector
│   │   │   └── layout.tsx      # Ops nested layout with ops-subnav
│   │   ├── layout.tsx          # Root application layout
│   │   ├── page.tsx            # Main support chat view
│   │   ├── globals.css         # Global CSS & Tailwind directives
│   │   ├── error.tsx           # Route-level error boundary
│   │   ├── global-error.tsx    # Root layout error boundary
│   │   └── not-found.tsx       # 404 page
│   ├── components/             # Reusable UI component modules
│   │   ├── auth/               # Auth modal dialog
│   │   ├── chat/               # Chat feed, message input, badge, prompt, markdown
│   │   ├── navigation/         # Global top navigation bar
│   │   ├── ops/                # Ops table, scorecard, breadcrumbs, timeline, tool card
│   │   ├── sidebar/            # Conversation history sidebar
│   │   ├── store/              # Storefront modal dialog
│   │   └── providers.tsx       # Root context providers
│   ├── context/                # Global React contexts
│   │   ├── auth-context.tsx    # Bearer token & real user session state
│   │   └── user-context.tsx    # Demo/guest user selector context
│   ├── hooks/                  # Custom application hooks
│   │   ├── use-chat.ts         # Chat reducer, SSE consumer, send lock guard
│   │   └── use-require-auth.ts # Route authentication guard
│   ├── lib/                    # API clients and HTTP consumers
│   │   ├── api-client.ts       # Customer REST client & SSE stream consumer
│   │   └── ops-client.ts       # Ops observability REST client
│   ├── types/                  # TypeScript data contracts & event schemas
│   │   ├── api.ts              # API domain types & schemas
│   │   ├── ops.ts              # Ops & benchmark schemas
│   │   └── sse.ts              # Server-sent events contracts
│   └── test/                   # Test configuration and setup files
├── tailwind.config.ts          # Tailwind CSS theme configuration
└── package.json                # Project dependencies and test scripts
```

### 6.2 State Management Architecture
* **`AuthContext`** (`src/context/auth-context.tsx`): Persistent customer identity and Bearer JWT token stored in browser `localStorage`.
* **`UserContext`** (`src/context/user-context.tsx`): Demo persona selector fallback.
* **`useChat`** (`src/hooks/use-chat.ts`): State machine powered by `chatReducer` managing messages, streaming text, workflow states, and synchronous ref locks.
* **Local Component State**: Form inputs, modals (`isOpen`), quantity counters, search terms, and active filters.

### 6.3 External Libraries & Dependencies
* **Tailwind CSS (`v3.4.15`)**: Utility-first CSS engine. Currently un-tokenized (only default colors).
* **Lucide React (`v0.460.0`)**: Exclusive icon family used across navigation, statuses, cards, and buttons.
* **React Markdown (`v9.0.1`) + Remark GFM (`v4.0.0`)**: Secure markdown parsing without raw HTML.
* **Vitest (`v2.1.5`)**: Fast test runner with JSDOM and Testing Library.

---

## 7. Design-System Conflict Inventory

A line-by-line comparison between `ORCHESTRAI_DESIGN_SYSTEM.md` and the existing client implementation reveals six major conflict zones:

### 7.1 Conflict 1: Theme & Canvas Background (Light Mode vs Dark-Only)
* **Design Specification**: Dark only. Canvas must be `--bg-canvas: #16070B`, surface `--bg-surface: #2B0D15`, sidebar `--bg-sidebar: #20090F`, and elevated `--bg-elevated: #36121C`.
* **Current Code**:
  * `src/app/globals.css`: `:root { --background: #f8fafc; --foreground: #0f172a; }` (Light mode).
  * `src/app/layout.tsx`: `<body className="bg-slate-50 text-slate-900 antialiased">`.
  * `src/app/page.tsx`: Chat background is `bg-white` and `bg-slate-50`.
* **Impact**: The entire application currently presents as a generic light-slate interface instead of the specified Midnight Burgundy / Imperial Crimson dark theme.

### 7.2 Conflict 2: Brand Action Color (Generic Indigo vs Imperial Crimson)
* **Design Specification**: Primary brand action is Imperial Crimson (`--brand-primary: #8A0B24`), hover is `--brand-hover: #A8112F`, and focus ring is `--brand-focus: #D1193E`. Section 3.7 explicitly prohibits generic blue, purple, or indigo accents for navigation and primary actions.
* **Current Code**:
  * `TopNav`: Logo icon background is `bg-indigo-600`; active Ops tab is `bg-indigo-600`; sign-in button is `bg-indigo-600`.
  * `ConversationSidebar`: "+ New Chat" button is `bg-indigo-600`.
  * `LoginPage` & `RegisterPage`: Primary submit buttons are `bg-indigo-600 hover:bg-indigo-500`.
  * `StorePage` & `OrdersPage`: Checkout and action buttons are `bg-indigo-600`.
  * `MessageInput`: Send button is `bg-blue-600 hover:bg-blue-700`.
* **Impact**: Direct violation of the brand identity. The product currently reads as a standard Tailwind Indigo SaaS template.

### 7.3 Conflict 3: Specialist Agent Badges (Rainbow Palette vs Semantic State)
* **Design Specification**: Section 3.5 & 7.3 state that semantic colors communicate system state (Success, Warning, Error, Information, Active/Brand) and are NOT alternate brand colors. Specialist agents must have an identifiable identity that is distinct from their execution state (queued, running, completed, failed).
* **Current Code**:
  * `src/components/chat/specialist-badge.tsx` assigns arbitrary rainbow colors to each agent:
    * `order_tracking`: `bg-blue-50 text-blue-700 border-blue-200`
    * `payment`: `bg-emerald-50 text-emerald-700 border-emerald-200`
    * `returns`: `bg-purple-50 text-purple-700 border-purple-200`
    * `refund`: `bg-teal-50 text-teal-700 border-teal-200`
    * `account_access`: `bg-amber-50 text-amber-800 border-amber-200`
    * `profile`: `bg-indigo-50 text-indigo-700 border-indigo-200`
* **Impact**: Creates decorative rainbow clutter and conflates specialist domain identity with execution health states.

### 7.4 Conflict 4: Typography Configuration
* **Design Specification**: Exactly two font families:
  * Primary UI: **Manrope** (400, 500, 600, 700) for body, headings, buttons, and navigation.
  * Technical Content: **Geist Mono** (400, 500, 600) for timestamps, execution logs, tool names, JSON payloads, and IDs.
* **Current Code**:
  * Neither Manrope nor Geist Mono is imported or configured.
  * `layout.tsx` uses default system fonts.
  * `tailwind.config.ts` has no `fontFamily` definition.
* **Impact**: Typography lacks the technical precision and modern character mandated by Section 4.

### 7.5 Conflict 5: Corner Radii & Pill Shapes
* **Design Specification**: Section 5.2 establishes strict geometry:
  * Dialogs & main containers: 12px (`rounded-xl`).
  * Cards & panels: 10–12px (`rounded-xl` or `rounded-[10px]`).
  * Message surfaces: 10px (`rounded-[10px]`).
  * Inputs and buttons: 8px (`rounded-lg`).
  * Tags & small badges: 6–8px (`rounded-md`).
  * **Rule**: "Avoid excessive pill-shaped controls. Pills are appropriate for compact status tags... not as the default shape for every control."
* **Current Code**:
  * Specialist badges, handoff badges, user message bubbles, and service option buttons frequently use `rounded-full`.
* **Impact**: Softens the technical, developer-tool precision into a consumer chatbot aesthetic.

### 7.6 Conflict 6: Design Tokens & Tailwind Abstraction
* **Design Specification**: Centralized CSS tokens for `--bg-*`, `--brand-*`, `--text-*`, `--border-*`, and `--space-*`.
* **Current Code**:
  * `tailwind.config.ts` only declares `background: 'var(--background)'` and `foreground: 'var(--foreground)'`.
  * Every component hardcodes ad-hoc Tailwind classes (`slate-100`, `slate-700`, `slate-800`, `indigo-600`, `blue-600`), resulting in styling inconsistencies across pages.

---

## 8. Shared Component Dependencies & Impact Matrix

When refactoring components to comply with the design system, the following dependency chains must be preserved:

```
[ RootLayout (layout.tsx) ]
     │
     ├── Injects globals.css (CSS Tokens & Typography)
     └── Wraps children in Providers (AuthProvider)
          │
          ├── [ TopNav ] ── Used by: Home (/), Store (/store), Orders (/orders), OpsLayout (/ops/*)
          │
          ├── [ Customer Support Chat (/) ]
          │    ├── ConversationSidebar (depends on AuthContext)
          │    ├── SpecialistBadge (depends on chatState.currentAgent)
          │    ├── ChatFeed
          │    │    ├── MarkdownRenderer (security-hardened)
          │    │    └── ServiceOptionBar (dispatches sendMessage)
          │    ├── VerificationPrompt (security state machine)
          │    ├── MessageInput (synchronous lock guard)
          │    ├── AuthModal (depends on AuthContext)
          │    └── StorefrontModal (depends on AuthContext & apiPlaceOrder)
          │
          ├── [ Store (/store) ] & [ Orders (/orders) ]
          │    └── Auth guards (useRequireAuth) & Order Action triggers
          │
          └── [ Ops Layout (/ops/*) ]
               ├── OpsSubNav (Conversations vs Evals tabs)
               ├── ConversationTable (/ops)
               ├── EvalScorecard (/ops/evals)
               └── TraceInspector (/ops/traces/[id])
                    ├── HandoffBreadcrumbs
                    └── TraceTimeline
                         └── ToolExecutionCard
```

### Critical Component Preservation Rules:
1. **DOM Test Attributes**: Over 150 Vitest tests rely on exact `data-testid` selectors (e.g. `specialist-badge`, `handoff-count-badge`, `chat-feed`, `message-input`, `send-button`, `top-nav`, `user-message-text-0`). These attributes must **never** be renamed or removed.
2. **Markdown Security**: `MarkdownRenderer` must maintain URL sanitization and safe link rendering for images. Never install or use `rehype-raw`.
3. **Synchronous Lock**: `MessageInput` and `useChat` rely on `isSendingRef.current` to prevent race conditions during message dispatch.
4. **OTP Privacy Masking**: The cosmetic masking `/^\d{6}$/` for user messages must be preserved.

---

## 9. Recommended Redesign Sequence

To execute the redesign safely without regressions or broken contracts, the work should follow a structured, phased sequence:

### Phase 1: Design Tokens, CSS Variables & Typography Foundation
* **Files**: `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`.
* **Actions**:
  1. Define all design tokens from `ORCHESTRAI_DESIGN_SYSTEM.md` in `globals.css` (`--brand-*`, `--bg-*`, `--text-*`, `--border-*`, `--space-*`).
  2. Extend `tailwind.config.ts` to map these custom properties cleanly into Tailwind utility classes.
  3. Load `Manrope` and `Geist Mono` in `layout.tsx` via `next/font/google`, binding them to `--font-sans` and `--font-mono`.
  4. Switch default body styling to `--bg-canvas` (`#16070B`) and `--text-primary` (`#FFF9FA`).
* **Verification**: Run `npm run typecheck`, `npm run lint`, `npm test`.

### Phase 2: Application Shell & Global Navigation
* **Files**: `src/components/navigation/top-nav.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`.
* **Actions**:
  1. Redesign `TopNav` to use `--bg-sidebar` (`#20090F`), subtle borders (`#52202D`), Imperial Crimson brand accents, and Manrope typography.
  2. Restyle error boundaries and 404 page to dark canvas and semantic error treatments.
* **Verification**: Verify header rendering on all routes; run test suite.

### Phase 3: Core Chat Experience & Message Interface
* **Files**: `src/app/page.tsx`, `src/components/chat/chat-feed.tsx`, `src/components/chat/message-input.tsx`, `src/components/chat/markdown-renderer.tsx`, `src/components/chat/service-option-bar.tsx`, `src/components/sidebar/conversation-sidebar.tsx`.
* **Actions**:
  1. Transition chat canvas to `--bg-canvas` (`#16070B`).
  2. Restyle user bubbles to brand surface and assistant bubbles to elevated surface (`--bg-surface: #2B0D15`).
  3. Apply `Geist Mono` to code blocks, IDs, and metadata within `MarkdownRenderer`.
  4. Redesign `MessageInput` with 8px radius, subtle border, and Imperial Crimson send button.
  5. Refactor `ConversationSidebar` to `--bg-sidebar` with active row highlights.
* **Verification**: Test chat streaming, auto-scroll, OTP masking, and quick-service pills.

### Phase 4: Specialist Badging & Security Verification
* **Files**: `src/components/chat/specialist-badge.tsx`, `src/components/chat/verification-prompt.tsx`.
* **Actions**:
  1. Replace rainbow agent badges with structured, restrained badge styling using subtle brand surfaces and consistent icons.
  2. Align execution statuses (active, turn resolved, escalated) with semantic status tokens (`#34D399`, `#FBBF24`, `#FB7185`).
  3. Redesign `VerificationPrompt` states (Code Sent, Delivery Failed, Expired, Locked Out) to use semantic status colors and clean countdown formatting.
* **Verification**: Verify all verification prompt states and agent handoff counters.

### Phase 5: Authentication Surfaces
* **Files**: `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/components/auth/auth-modal.tsx`.
* **Actions**:
  1. Redesign login and registration cards with `--bg-surface`, 12px corner radius, Manrope headings, and Imperial Crimson submit buttons.
  2. Ensure high-contrast input fields (`--bg-inset: #110509`, `--border-subtle: #52202D`).
* **Verification**: Test full login, registration, validation errors, and redirects.

### Phase 6: Commerce & Order Management Surfaces
* **Files**: `src/app/store/page.tsx`, `src/app/orders/page.tsx`, `src/components/store/storefront-modal.tsx`.
* **Actions**:
  1. Redesign product cards with dark surfaces, clear pricing hierarchy, and 8px quantity controls.
  2. Restyle order history cards and delivery status badges using the semantic status table.
  3. Polish order confirmation receipt card with monospace order IDs and tracking numbers.
* **Verification**: Test product quantity adjustments, checkout submission, receipt rendering, and "Ask Agent" routing.

### Phase 7: Platform / Ops Observability Console
* **Files**: `src/app/ops/layout.tsx`, `src/app/ops/page.tsx`, `src/app/ops/evals/page.tsx`, `src/app/ops/traces/[id]/page.tsx`, `src/components/ops/*`.
* **Actions**:
  1. Apply developer-tool visual polish to Ops tables, search bars, and filter dropdowns.
  2. Implement `Geist Mono` across conversation IDs, timestamps, and tool names.
  3. Redesign `HandoffBreadcrumbs` and `TraceTimeline` with high-clarity trajectory connectors and collapsible tool telemetry cards.
  4. Restyle `EvalScorecard` with clean data visualization bars.
* **Verification**: Test all table filters, trace inspections, and benchmark scorecards.

---

## 10. Risks and Regression Considerations

| Risk Area | Description | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Test Selector Breakage** | Vitest component tests assert specific `data-testid` elements and text content. | **High** | Maintain 100% of existing `data-testid` attributes and semantic DOM roles across all redesigned components. |
| **XSS via Markdown** | Changes to Markdown styling could accidentally permit unsanitized HTML if dependencies or plugins are swapped. | **Critical** | Do NOT touch `remarkGfm` or install `rehype-raw`. Keep link sanitization logic in `MarkdownRenderer` intact. |
| **OTP Privacy Leak** | Cosmetic masking of 6-digit OTP codes (`••••••`) must not be removed during bubble redesign. | **High** | Retain the `shouldMaskOtp` check in `ChatFeed` and test with the existing OTP test suite. |
| **Text Contrast & Readability** | Dark burgundy surfaces paired with dark crimson text can fail WCAG 2.2 AA contrast checks. | **High** | Follow the text tokens strictly: `--text-primary: #FFF9FA` and `--text-secondary: #D9B8BF` for high contrast against `--bg-surface` (`#2B0D15`). |
| **Streaming Race Conditions** | Refactoring message inputs or chat feed could interfere with the SSE reader or auto-scroll ref. | **Medium** | Keep `useChat` and `api-client` strictly intact; modify only presentation markup and CSS classes. |
| **Backend Boundary Violations** | Temptation to alter backend response schemas to simplify frontend rendering. | **Prohibited** | Maintain strict frontend-only boundary. All API contracts (`/types/api.ts`, `/types/ops.ts`, `/types/sse.ts`) remain frozen. |

---

## Audit Sign-Off
This audit reflects a complete, verified inspection of the OrchestrAI frontend codebase. **No code, styles, or configurations have been altered.**

---
---

# PART II: Frontend Audit Supplement (Read-Only Verification)

**Date:** November 21, 2026  
**Auditor:** Antigravity Agent  
**Purpose:** Deep-dive verification resolving inventory gaps, route/role ambiguities, responsive behavior limitations, UI-state matrices, testing selector strategies, and separating verified facts from assumptions.  
**Constraint:** Strict read-only audit. Zero modifications to application code, styles, configurations, or dependencies.

---

## S1. Complete Component Inventory & Granular UI Decomposition

The initial component inventory focused on top-level component files. However, several load-bearing visual structures in Next.js App Router exist as layout wrappers, sub-navigation bars, and composite inline elements within page files. Below is the verified complete inventory of all UI components, whether file-isolated or composite inline.

### S1.1 Layout & Navigation Wrappers

#### 1. `OpsLayout` (`src/app/ops/layout.tsx`)
* **Classification**: Nested Route Layout Component (Shared across `/ops`, `/ops/evals`, `/ops/traces/[id]`).
* **Visual Purpose**: Enforces a persistent 2-level shell for Platform Operations:
  * Top layer: Global `TopNav` (56px / `h-14`).
  * Sub-header layer: `ops-subnav` (48px / `h-12`) in `bg-slate-950 border-b border-slate-800`.
  * Right indicator: Monospace environment tag (`System Environment: Dev / Local` with `text-emerald-400`).
* **Interactions**:
  * Active route highlighting using `usePathname()`:
    * `/ops`: Conversations tab highlighted (`bg-slate-800 text-indigo-400 font-semibold`).
    * `/ops/evals`: Evaluation Benchmark tab highlighted (`bg-slate-800 text-indigo-400 font-semibold`).
* **Dependencies**: `react`, `next/link`, `next/navigation` (`usePathname`), `TopNav`, `lucide-react` (`Table`, `Award`).

#### 2. `OpsSubNav` (Inline within `src/app/ops/layout.tsx`)
* **Classification**: Composite Sub-Navigation Bar.
* **DOM Hook**: `data-testid="ops-subnav"`, `data-testid="subnav-conversations-link"`, `data-testid="subnav-evals-link"`.
* **Visual Purpose**: Secondary tab switcher between `Conversations` and `Evaluation Benchmark`.
* **Interactions**: Client-side Next.js route transitions.
* **Dependencies**: `next/link`, `lucide-react` (`Table`, `Award`).

### S1.2 Composite Inline Status & Operational Components

#### 3. `TurnStatusBadges` (Inline within `src/app/page.tsx` Chat Header)
* **File Path**: `src/app/page.tsx` (Lines 177–195).
* **Classification**: Page-Specific Status Indicator (Chat Header).
* **DOM Hooks**: `data-testid="escalated-badge"`, `data-testid="completed-badge"`.
* **Visual Purpose**:
  * Escalated Badge: Rendered when `chatState.workflowStatus === 'ESCALATED'`. Displays `AlertTriangle` icon and "Escalated to Human" in `bg-rose-50 text-rose-700 border border-rose-200 rounded-full`.
  * Completed Badge: Rendered when `chatState.workflowStatus === 'COMPLETED'`. Displays `CheckCircle` icon and "Turn Resolved" in `bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full`.
* **Interactions**: Reactive state display driven by `useChat().state.workflowStatus`. Non-interactive.
* **Dependencies**: `lucide-react` (`AlertTriangle`, `CheckCircle`), `WorkflowStatus` type.

#### 4. `ChatHeader` (Inline within `src/app/page.tsx`)
* **File Path**: `src/app/page.tsx` (Lines 149–197).
* **Classification**: Page-Specific Composite Container.
* **DOM Hook**: `data-testid="chat-header"`, `data-testid="header-store-btn"`.
* **Visual Purpose**: Top bar of main chat area (64px / `h-16`) holding `SpecialistBadge`, monospace conversation ID snippet, "Storefront" modal trigger button, and `TurnStatusBadges`.
* **Interactions**: Click "Storefront" button $\to$ sets `isStorefrontModalOpen = true`.
* **Dependencies**: `SpecialistBadge`, `lucide-react` (`ShoppingBag`).

#### 5. `EscalationAlertBanner` (Inline within `src/app/page.tsx`)
* **File Path**: `src/app/page.tsx` (Lines 200–210).
* **Classification**: Page-Specific Alert Banner.
* **DOM Hook**: `data-testid="escalation-alert-banner"`.
* **Visual Purpose**: Full-width alert banner below header when `workflowStatus === 'ESCALATED'`: "This conversation has been escalated to a human support specialist. Chat input is disabled." in `bg-rose-50 border-b border-rose-200 text-rose-800`.
* **Interactions**: Passive alert notification.
* **Dependencies**: `lucide-react` (`AlertTriangle`).

#### 6. `ErrorAlertBanner` (Inline within `src/app/page.tsx`)
* **File Path**: `src/app/page.tsx` (Lines 213–230).
* **Classification**: Page-Specific Recoverable Error Banner.
* **DOM Hook**: `data-testid="error-alert-banner"`.
* **Visual Purpose**: Displays recoverable streaming communication error in `bg-amber-50 border-b border-amber-200 text-amber-800` with an inline "Retry" button.
* **Interactions**: Clicking "Retry" calls `loadConversation(selectedConvId)` to reload turn state.
* **Dependencies**: `lucide-react` (`RefreshCw`).

#### 7. `StreamingProgressPill` (Inline within `src/components/chat/chat-feed.tsx`)
* **File Path**: `src/components/chat/chat-feed.tsx` (Lines 153–161).
* **Classification**: Composite Inline Progress Pill.
* **DOM Hook**: `data-testid="node-progress-indicator"`.
* **Visual Purpose**: Rendered inside the live assistant streaming bubble when `currentActivity` or `currentNode` is truthy. Displays spinning `Loader2` and human-readable activity text (e.g., "Looking up order status...") in `bg-indigo-50 text-indigo-700 border-indigo-200 rounded-full animate-pulse`.
* **Interactions**: Reactive state display driven by SSE stream events.
* **Dependencies**: `lucide-react` (`Loader2`).

#### 8. `TypingIndicator` (Inline within `src/components/chat/chat-feed.tsx`)
* **File Path**: `src/components/chat/chat-feed.tsx` (Lines 169–183).
* **Classification**: Composite Inline Animated Indicator.
* **DOM Hook**: `data-testid="typing-indicator"`.
* **Visual Purpose**: Three bouncing dots (`animate-bounce`) with staggered animation delays (`0.15s`, `0.3s`) shown while the assistant turn is queued before text chunks or activity arrive.
* **Interactions**: Passive visual animation.
* **Dependencies**: None.

#### 9. `OrderConfirmationCard` (Inline within `src/app/store/page.tsx`)
* **File Path**: `src/app/store/page.tsx` (Lines 152–233).
* **Classification**: Page-Specific Receipt View / Modal Replacement.
* **DOM Hook**: `data-testid="order-confirmation-card"`, `data-testid="receipt-order-id"`, `data-testid="receipt-tracking-number"`, `data-testid="receipt-ask-agent-btn"`, `data-testid="receipt-continue-btn"`.
* **Visual Purpose**: Replaces the product catalog on `/store` upon successful order placement:
  * Green circular check badge (`CheckCircle` in `bg-emerald-950/80 border-emerald-600/70`).
  * "Order Confirmed & Paid" heading.
  * Summary table: Order ID (monospace), Tracking Number (emerald monospace), Shipping Address, Payment Status (`Captured`), Shipment Status (`In Transit`).
* **Interactions**:
  * "Ask Agent to Track Order": navigates to `/?orderId=${order.id}`.
  * "Back to Catalog": resets `placedOrder = null` to restore the store grid.
* **Dependencies**: `lucide-react` (`CheckCircle`, `Package`, `ArrowRight`, `ShieldCheck`), `next/navigation` (`useRouter`).

#### 10. `OrderSuccessScreen` (Inline within `src/components/store/storefront-modal.tsx`)
* **File Path**: `src/components/store/storefront-modal.tsx` (Lines 138–199).
* **Classification**: Modal-Specific Receipt View.
* **DOM Hook**: `data-testid="order-success-screen"`, `data-testid="placed-order-id"`, `data-testid="placed-tracking-number"`, `data-testid="ask-agent-about-order-btn"`.
* **Visual Purpose**: Rendered inside `StorefrontModal` when an order completes from within chat. Mirrors `OrderConfirmationCard` with a compact modal layout.
* **Interactions**:
  * "Ask Agent About This Order": executes `onAskAgent(orderId)` and closes modal.
  * "Place Another Order": resets `placedOrder = null`.
* **Dependencies**: `lucide-react` (`CheckCircle`, `Package`, `ArrowRight`).

#### 11. `OpsKPICards` (Inline within `src/app/ops/page.tsx`)
* **File Path**: `src/app/ops/page.tsx` (Lines 53–83).
* **Classification**: Page-Specific Metric Cards.
* **DOM Hooks**: `data-testid="metric-total"`, `data-testid="metric-active"`, `data-testid="metric-escalated"`.
* **Visual Purpose**: 3 summary cards showing total conversations, active count (green), and escalated count (rose).
* **Interactions**: Real-time counter derived from fetched conversations array.
* **Dependencies**: `lucide-react` (`MessageSquare`, `CheckCircle2`, `AlertTriangle`).

---

## S2. Route Authentication & Authorization Verification

A critical ambiguity in earlier analysis was whether `/ops` is "role-protected" or authenticated. An exhaustive inspection of frontend source code resolves this question definitively.

### S2.1 Direct Route Protection Matrix

| Route | Protected on Frontend? | Mechanism | Redirect Behavior |
| :--- | :--- | :--- | :--- |
| `/` (Chat) | **YES** | `useRequireAuth('/')` in `CustomerChatContent` | If unauthenticated and not loading, redirects to `/login?redirect=%2F`. |
| `/store` | **YES** | `useRequireAuth('/store')` in `StorePage` | If unauthenticated and not loading, redirects to `/login?redirect=%2Fstore`. |
| `/orders` | **YES** | `useRequireAuth('/orders')` in `OrdersPage` | If unauthenticated and not loading, redirects to `/login?redirect=%2Forders`. |
| `/login` | Public | Manual `useEffect` redirect | If already authenticated, redirects to `?redirect` query param or `/`. |
| `/register` | Public | Manual `useEffect` redirect | If already authenticated, redirects to `?redirect` query param or `/store`. |
| `/ops` | **NO** (Public on Frontend) | None | Freely accessible without session token. |
| `/ops/evals` | **NO** (Public on Frontend) | None | Freely accessible without session token. |
| `/ops/traces/[id]` | **NO** (Public on Frontend) | None | Freely accessible without session token. |

### S2.2 Verified Frontend Findings on Ops & Roles
1. **Zero Frontend Role Checks**: The string `role` exists in frontend code only as `Message.role` (`'user' | 'assistant' | 'system'`) and HTML ARIA roles (`role="dialog"`). There is **no frontend user role concept** (e.g. `admin`, `operator`, `customer`) anywhere in `client/src`.
2. **Ops API Calls are Unauthenticated on Frontend**:
   * In `src/lib/ops-client.ts`, `fetchOpsConversations`, `fetchOpsTrace`, and `fetchOpsEvalResults` do **not** call `getAuthHeaders()` and do **not** send an `Authorization: Bearer <token>` header. They make plain `fetch(url)` requests.
3. **Visibility vs Protection in Navigation**:
   * In `TopNav` (`src/components/navigation/top-nav.tsx`, line 96), the link to `/ops` has the class `hidden sm:inline-flex`.
   * It is hidden on small mobile viewports solely for **space conservation**, NOT for authentication. It is visible to both unauthenticated and authenticated users on screens $\ge 640\text{px}$.
4. **Backend Authorization Boundary**:
   * Whether the Express server (`/api/ops/*`) rejects unauthorized requests in production environments cannot be verified from client code. On the frontend, `/ops` routes execute unauthenticated requests against `NEXT_PUBLIC_API_URL`.

---

## S3. Comprehensive Responsive Behavior Audit

The application was inspected across standard viewport widths: **Desktop ($\ge 1280\text{px}$)**, **Laptop/Tablet Landscape ($1024\text{px}$)**, **Tablet Portrait ($768\text{px}$)**, and **Mobile ($375\text{px} - 640\text{px}$)**.

### S3.1 Viewport Behavior by Page & Component

#### 1. Global Navigation (`TopNav`)
* **Desktop ($\ge 1024\text{px}$)**: Full brand logo, 4 navigation links (Support Chat, Store, My Orders, Platform Ops), user profile pill or Sign In button.
* **Tablet ($640\text{px} - 1023\text{px}$)**: All 4 links visible. User name truncated to `max-w-[140px]`.
* **Mobile ($< 640\text{px}$)**:
  * `Platform Ops` link is hidden via `hidden sm:inline-flex`.
  * Brand text shrinks (`text-sm`).
  * User email truncate width can cause header overflow if email is long and screen is under 360px.
* **Conflict with Design System**: Section 10 requires mobile navigation to collapse cleanly without losing access to existing routes. Currently, `/ops` is completely inaccessible via navigation on mobile devices.

#### 2. Chat Layout (`src/app/page.tsx` & `ConversationSidebar`)
* **Desktop ($\ge 1024\text{px}$)**: Two-column layout. Sidebar has fixed width `w-72 md:w-80 shrink-0`. Main chat area occupies remaining width.
* **Mobile ($< 768\text{px}$)**:
  * **Critical Usability Defect**: The sidebar remains `w-72 shrink-0` side-by-side with `<main className="flex-1 flex flex-col h-full min-w-0">`.
  * On a 375px mobile screen, the sidebar consumes 288px (77% of the viewport), squeezing the chat feed into an unusable 87px column.
  * There is **no mobile drawer toggle**, no hamburger menu, and no overlay/collapse logic implemented in `page.tsx` or `conversation-sidebar.tsx`.
* **Chat Header**:
  * On mobile, the conversation ID snippet is hidden (`hidden sm:inline`), which is good.
  * However, when an agent badge, storefront button, and escalation badge are all active, the header wraps or squashes buttons on narrow screens.
* **Message Composer (`MessageInput`)**:
  * Input textarea max-height is constrained to 160px with vertical scrolling.
  * Send button is fixed at `h-10 w-10 shrink-0`.
  * Padding adjusts from `p-4 md:p-6`. Works well across sizes, but the surrounding layout squeeze on mobile breaks it.

#### 3. Storefront (`src/app/store/page.tsx`)
* **Desktop ($\ge 1024\text{px}$)**: 3-column grid (`grid-cols-1 lg:grid-cols-3 gap-8`). Catalog on left (2 cols, grid of 2-col product cards), sticky order summary card on right (1 col).
* **Tablet / Mobile ($< 1024\text{px}$)**:
  * Stacks vertically into a single column.
  * Order Summary card drops below the product grid. A customer on mobile must scroll past all products to reach the checkout button and total due.

#### 4. Orders History (`src/app/orders/page.tsx`)
* **Desktop & Tablet**: Max-width container (`max-w-5xl mx-auto`). Order cards display flex top bar (order ID on left, status badge on right) and 2-column detail grid (Total Paid, Shipping Destination).
* **Mobile ($< 640\text{px}$)**:
  * Flex layouts cleanly convert to `flex-col` (`sm:flex-row`).
  * "Ask Agent About This Order" stretches full-width (`items-stretch sm:items-center`).
  * Reasonably responsive, with comfortable touch targets.

#### 5. Platform Ops Conversations Table (`ConversationTable`)
* **Desktop ($\ge 1024\text{px}$)**: 6 columns (ID, Customer, Status, Turns, Last Updated, Actions).
* **Mobile / Tablet ($< 768\text{px}$)**:
  * Uses `overflow-x-auto` around `<table>`.
  * Table scrolls horizontally on mobile. However, no card-view fallback is provided for narrow screens, forcing horizontal swipe navigation to click the "Inspect" button.

#### 6. Trace Inspector (`OpsTraceInspectorPage` & `TraceTimeline`)
* **Desktop & Tablet**: Clean vertical timeline with 24px left padding (`pl-6 pb-6`) and absolute node indicators.
* **Mobile ($< 640\text{px}$)**:
  * Header info wraps cleanly (`flex-col md:flex-row`).
  * Timeline events render comfortably inside `max-w-5xl`.
  * `HandoffBreadcrumbs` wraps horizontally using `flex flex-wrap items-center gap-2`. Fully legible on mobile.

#### 7. Modals (`AuthModal` & `StorefrontModal`)
* **All Viewports**:
  * Centered overlay with `backdrop-blur-sm p-4`.
  * Max-widths: `max-w-md` (`AuthModal`) and `max-w-lg` (`StorefrontModal`).
  * Both enforce `max-h-[90vh]` with internal scroll areas (`overflow-y-auto`).
  * Touch targets exceed $40\times 40\text{px}$, maintaining keyboard and touch usability.

---

## S4. UI-State Matrix

The following state matrix documents every condition, visual presentation, trigger, and functional preservation requirement across major pages and components.

| Component / Surface | UI State | Trigger / Condition | Visual Presentation | Load-Bearing Requirements |
| :--- | :--- | :--- | :--- | :--- |
| **`CustomerChatContent`** (`page.tsx`) | `AUTH_LOADING` | `isAuthLoading \|\| !isAuthenticated` | Dark fullscreen container with spinning `Loader2` + "Authenticating...". | Must not flash unauthenticated content before auth check completes. |
| | `ESCALATED` | `chatState.workflowStatus === 'ESCALATED'` | Rose header badge (`escalated-badge`), rose alert banner (`escalation-alert-banner`), composer locked with lock icon. | Input textarea and send button MUST be disabled. User cannot submit turns. |
| | `RECOVERABLE_ERROR` | `chatState.workflowStatus === 'FAILED'` | Amber alert banner (`error-alert-banner`) with message and "Retry" link. | "Retry" must re-execute `loadConversation(selectedConvId)`. |
| | `TURN_RESOLVED` | `chatState.workflowStatus === 'COMPLETED'` | Emerald header badge (`completed-badge`). Chat input remains enabled for follow-ups. | Input must remain active for follow-up turns. |
| **`ChatFeed`** (`chat-feed.tsx`) | `EMPTY_FEED` | `messages.length === 0 && !isStreaming` | Centered welcome card with `Bot` icon and starter description. | Replaced as soon as first message arrives. |
| | `STREAMING_ACTIVE` | `isStreaming === true` | Live streaming bubble with pulsing `StreamingProgressPill` and text stream. | Streaming text chunks must render smoothly via `MarkdownRenderer`. |
| | `TYPING_PENDING` | `isStreaming && !streamingText && !currentNode && !currentActivity` | Bouncing dot animation (`typing-indicator`). | Indicates network latency before SSE events begin. |
| | `OTP_MASKED` | Message is user role, exactly 6 digits, and preceded by assistant `blockedBy`. | Plain text displayed as `••••••` with monospace tracking. | Plain-text content in state must NEVER be leaked to DOM when condition is met. |
| | `SERVICE_OPTIONS` | `serviceOptions` present on last assistant message and not streaming. | Horizontal row of clickable quick-action pills below last message. | Clicking pill must dispatch `sendMessage(option.message)` immediately. |
| **`MessageInput`** (`message-input.tsx`) | `STREAMING_LOCKED` | `isStreaming === true` | Placeholder: "Agent is thinking...". Send button disabled. | Synchronous ref guard (`isSendingRef`) prevents double-submit. |
| | `ESCALATED_LOCKED` | `workflowStatus === 'ESCALATED'` | Placeholder: "Conversation escalated to human agent". Lock banner below input. | Input disabled; cannot be focused or submitted. |
| | `AUTO_RESIZING` | Content multiline | Textarea height expands dynamically to content up to `160px`. | Must reset height to `auto` after send. |
| **`VerificationPrompt`** (`verification-prompt.tsx`) | `IDLE` | `blockedBy` truthy, step is generic | Neutral alert banner prompting user to follow assistant instructions. | Distinguishes `VERIFICATION_FULL` from partial confirmation. |
| | `SENT_AWAITING_CODE` | `step === 'verify_identity' \|\| 'awaiting_code'` | Amber banner, masked email, countdown timer, key icon, optional dev OTP helper. | Countdown timer updates every second. |
| | `COOLDOWN_ACTIVE` | Resend cooldown active | Amber banner indicating code is active with resend countdown timer. | "Resend code" button disabled until timer reaches 0. |
| | `SEND_FAILED` | Delivery network error | Red banner (`bg-red-50 text-red-900`) with error reason and resend button. | Resend action enabled immediately. |
| | `EXPIRED` | Verification code expired | Red banner prompting user to request a fresh code. | Resend action enabled. |
| | `LOCKED_OUT` | 5 failed attempts exceeded | Red banner stating lockout with resend button to reset attempts. | "Resend code" resets attempts to 0. |
| **`StorePage`** (`store/page.tsx`) | `CATALOG_LOADING` | Products fetching | Centered spinning `Loader2` + "Loading product catalog...". | Initial mount fetch from `fetchProducts()`. |
| | `EMPTY_CART` | Selected quantities sum to 0 | Order Summary: "Your cart is empty. Add items from the catalog." Button disabled. | Checkout button disabled (`disabled:opacity-40`). |
| | `ORDER_PLACING` | `isPlacingOrder === true` | Checkout button disabled with spinning `Loader2` + "Processing Order...". | Prevents duplicate order placement calls. |
| | `ORDER_CONFIRMED` | `placedOrder !== null` | Catalog hidden; replaced by `OrderConfirmationCard` with tracking number. | "Ask Agent" button transfers order ID into chat via query param. |
| **`ConversationTable`** (`conversation-table.tsx`) | `TABLE_LOADING` | Initial load or refresh | Table body displays centered "Loading conversations...". | Triggered on mount or manual refresh button click. |
| | `NO_MATCHES` | Filter/search yields 0 rows | Table body displays "No conversations match the current search and filter." | Triggered when text search or dropdown filter excludes all rows. |
| **`EvalScorecard`** (`eval-scorecard.tsx`) | `BENCHMARK_RUNNING` | Re-running benchmark | Header button shows spinning `RefreshCw` + "Running Benchmark...". | Disables button to prevent re-entrant benchmark execution. |
| | `PERFECT_SCORE` | `passRate >= 1.0` | Pass rate displayed in `text-emerald-400` with green `CheckCircle2` badge. | Emphasizes 100% deterministic score. |
| | `SUBPAR_SCORE` | `passRate < 1.0` | Pass rate displayed in `text-amber-400` with amber `BarChart3` badge. | Flags imperfect benchmark results. |
| **`ToolExecutionCard`** (`tool-execution-card.tsx`) | `COLLAPSED` | Default state | Shows tool name, execution latency (`12ms`), and success/failure badge. | Compact view for dense timelines. |
| | `EXPANDED` | User clicks row | Expands to reveal ISO timestamp and formatted execution error box if failed. | Toggled via internal `isOpen` state. |

---

## S5. Testing & Regression Verification

### S5.1 Exact Test Suite & Script Verification
An independent execution of `npm test --prefix client` verified the test baseline:
* **Test Files**: **28 passed (28)**
* **Tests**: **150 passed (150)**
* **Duration**: ~33–42 seconds in JSDOM environment.
* **Available Scripts** in `client/package.json`:
  * `npm run dev`: `next dev` (Port 3000)
  * `npm run build`: `next build`
  * `npm run start`: `next start`
  * `npm run lint`: `next lint` (verified: 0 errors, 0 warnings)
  * `npm run typecheck`: `tsc --noEmit` (verified: 0 TypeScript errors)
  * `npm test`: `vitest run` (verified: 150 passing tests)

### S5.2 Selector Strategy Breakdown
The initial audit claimed that tests rely heavily on `data-testid`. While `data-testid` is prominent, the test suite actually employs a **multi-layered testing strategy**:

* **Files using `data-testid` / `getByTestId`**: **19 of 28 files** (e.g. `specialist-badge.test.tsx`, `top-nav.test.tsx`, `conversation-table.test.tsx`, `eval-scorecard.test.tsx`).
* **Files using `getByText` / `findByText`**: **17 of 28 files** (asserts user-facing copy such as "Where is my order", "Turn Resolved", "Escalated to Human", "Paid & Processing").
* **Files using ARIA Roles (`getByRole` / `findByRole`)**: **7 files**:
  * `error.test.tsx`: asserts `getByRole('heading', { level: 2 })`, `getByRole('button', { name: /try again/i })`.
  * `auth-modal.test.tsx`: asserts `getByRole('dialog')`.
  * `markdown-renderer.test.tsx`: asserts `getByRole('table')`, `getByRole('link')`.
  * `page.test.tsx`: asserts `getByRole('main')`.
* **Files using Label Text (`getByLabelText`)**: **1 file**:
  * `message-input.test.tsx`: asserts `getByLabelText('Message input')` and `getByLabelText('Send message')`.

### S5.3 Regression Prevention Directive
* **Do NOT rename or delete `data-testid` attributes.**
* **Do NOT change semantic ARIA roles** (`role="dialog"`, `<main>`, `<h2>`, `<button aria-label="...">`).
* **Do NOT alter established text strings** in buttons and status badges without verifying corresponding test assertions.

---

## S6. Separation of Verified Facts from Inferences & Assumptions

To maintain absolute technical precision, the table below classifies all architectural claims made during the audit:

| Subject | Claim | Classification | Evidence / Source |
| :--- | :--- | :--- | :--- |
| **Specialist Agents** | 6 specialists: `order_tracking`, `payment`, `returns`, `refund`, `account_access`, `profile` + `router`. | **Verified directly in frontend code** | Hardcoded in `specialist-badge.tsx` (`AGENT_LABELS`), `handoff-breadcrumbs.tsx` (`AGENT_NAMES`), and asserted in `specialist-badge.test.tsx`. |
| **Agent Routing** | Backend LangGraph router dynamically hands off conversations between specialists. | **Inferred from displayed data** | Observed via SSE `routing` events and trace timeline JSON data contracts (`OpsRoutingEvent`). |
| **SSE Streaming** | Backend streams tokens, node progress, and routing decisions over HTTP event-stream. | **Verified directly in frontend code** | Implemented in `src/lib/api-client.ts` via `ReadableStreamDefaultReader` reading `type: 'start' \| 'node' \| 'activity' \| 'message' \| 'routing' \| 'done' \| 'error'`. |
| **OTP Masking** | 6-digit verification codes are masked cosmetically in chat. | **Verified directly in frontend code** | `shouldMaskOtp()` function in `chat-feed.tsx` lines 46–59 and tested in `chat-feed.test.tsx`. |
| **Ops Route Protection** | `/ops` is an administrative route protected by roles. | **DISPROVEN / Unsupported Assumption** | Frontend audit proves `/ops` has **no frontend auth guards, no redirects, and no role checks**. API calls are unauthenticated on frontend. |
| **Backend Authorization** | Backend rejects unauthenticated requests to `/api/ops/*` in production. | **Backend-dependent (Not Verified)** | Cannot be verified without inspecting server code or running an unauthenticated curl in production mode. |
| **Benchmark Scenarios** | Evaluates 30 scenarios across 8 binary metrics and 5 routing patterns. | **Inferred from displayed data** | Displayed in `eval-scorecard.tsx` copy and mocked in `ops-client.test.ts`. Backend benchmark runner itself is not in `client/`. |
| **Demo / Seed Users** | 5 demo users seeded in Postgres for scenario testing. | **Inferred from contract** | Fallback `DEFAULT_GUEST_USER` exists in `user-context.tsx`. Demo users fetched from `/api/demo-users`. |

---

## S7. Authoritative Redesign Workflow & Directives

When implementation is approved, all work must adhere to the permanent specification in `ORCHESTRAI_DESIGN_SYSTEM.md` and the following operational directives:

1. **Strict Impeccable Skill Usage**:
   * Every redesign prompt and step must invoke the Impeccable skill (`/impeccable`) to enforce visual polish, typographic hierarchy, and design token fidelity.
2. **StageShow Demonstration Protocol**:
   * Utilize the StageShow skill (`npx skills add benjitaylor/skills --skill stageshow`) as part of the visual demonstration workflow where applicable.
   * **Directive**: StageShow demonstrations are **illustrative visuals only**. They are never functioning replacements for real application components, data hooks, or state machines.
3. **Atomic Component Execution**:
   * Redesign exactly **one clearly defined component or page at a time**. Sweeping multi-file rewrites are prohibited.
4. **Preservation of Functional Core**:
   * Preserve all existing application behaviors, data hooks (`useChat`, `useAuth`, `useRequireAuth`), API clients, and data structures.
   * Zero mutations to backend files, database schemas, or Express endpoints.
5. **Approval Gates**:
   * No dependencies may be added or configurations altered without explicit user approval.
   * Every redesign step must verify `npm run lint`, `npm run typecheck`, and `npm test` to ensure 100% green status across all 150 tests.

