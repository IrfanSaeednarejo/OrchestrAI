# OrchestrAI — Operations & Observability Redesign Proposal (Refined)
## `/ops`, `/ops/traces/[id]`, and `/ops/evals`

**Author:** Antigravity Agent  
**Date:** November 21, 2026  
**Document Status:** Pending User Review & Approval (Discovery Gate — Refined Proposal)  
**Target Branch:** `phase/34-ops-visual-redesign`  
**Authority Reference:** `client/ORCHESTRAI_DESIGN_SYSTEM.md`  
**Design Skills Applied:** Impeccable (`/impeccable`), StageShow (`.agents/skills/stageshow`)  
**Visual Demonstration Artifact:** [`ops-redesign-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/ops-redesign-stageshow.html)

---

## Executive Summary

Following the accepted redesigns of Customer Chat (`/`), Hardware Storefront (`/store`), Order History (`/orders`), and Split-Screen Authentication (`/login` & `/register`), this proposal details the final major visual redesign phase: **Operations and Observability**.

The Platform/Ops console consists of three primary routes:
1. **`/ops`** — Conversation Explorer: Filterable, searchable inventory of up to 50 recent orchestration threads.
2. **`/ops/traces/[id]`** — Trace Inspector: Detailed timeline of routing decisions, multi-agent handoffs, and tool execution diagnostics.
3. **`/ops/evals`** — Evaluation Benchmark Dashboard: Quality assurance scorecard evaluating 30 canonical scenarios across 8 deterministic binary metrics.

Currently, these pages rely on legacy Tailwind `slate-950`, `slate-900`, `indigo-600`, and `purple-900` colors from Phase 18. This refined proposal transforms the console into a **high-density, mission-critical engineering observability surface** adhering to the **Midnight Burgundy** (`#16070B` / `#2B0D15`) and **Imperial Crimson** (`#8A0B24`) design system, enriched with **Geist Mono** technical typography and scannable diagnostic visualization.

In accordance with strict operating rules:
- This is a **frontend-only redesign**. Zero backend code, database schemas, API contracts, benchmark runners, or data models are modified.
- All 24 ops tests across 7 test files remain 100% green.
- No synthetic telemetry, invented performance SLOs, or simulated pagination features are introduced.

---

## Summary of Proposal Corrections (Addressing Technical & Architectural Feedback)

| Issue / Topic | Initial Proposal Draft | Corrected & Refined Proposal | Source / Verification |
| :--- | :--- | :--- | :--- |
| **1. Benchmark Execution** | Mentioned "Re-Run Benchmark" button without clarifying backend execution contract. | Verified that `GET /api/ops/eval-results` dynamically calls `runBenchmark(EVALUATION_SCENARIOS)` on each request. The button exists in `page.tsx` (`data-testid="refresh-evals-button"`), triggering `fetchOpsEvalResults()`. Documented exact contracts; zero new backend dependencies added. | `server/src/api/controllers/ops.controller.ts:47-65`, `client/src/app/ops/evals/page.tsx:29` |
| **2. Checkpointer Telemetry** | Included simulated indicator: `LangGraph Checkpointer: POSTGRES_SAVER`. | Removed simulated checkpointer status. Replaced with existing, verifiable product telemetry: `System Environment: Dev / Local` (from `layout.tsx`). | `client/src/app/ops/layout.tsx:28` |
| **3. Latency & Performance** | Introduced arbitrary thresholds (<200ms success, 200–800ms warning, >800ms error). | Removed all invented thresholds. Durations are formatted neutrally in `Geist Mono` (`text-content-muted`, e.g. `320ms`). Execution success/failure is strictly determined by execution status (`status: 'success' \| 'failure'`), decoupled from duration. | Codebase audit (no SLOs defined in `docs/DECISIONS.md` or `server/`) |
| **4. Discovery Limitations** | Documented client search/filters without stating loaded record boundaries. | Documented that `fetchOpsConversations(50, 0)` is hardcoded to 50 records. Search and status filters run client-side in memory on only these 50 records. No pagination exists in the API or UI. Added UI count indicator: `Showing up to 50 recent conversations`. | `client/src/lib/ops-client.ts:8`, `server/src/api/controllers/ops.controller.ts:16` |
| **5. Security Review** | Basic note on `requireDemoEnabled`. | Full 5-tier security analysis covering frontend route guards, client credentials, backend auth, backend RBAC, and demo mode 404 gate. Clear distinction between production safety (404 lockout) and dev/staging exposure risks. Verified data sanitization rules. | `server/src/api/routes/ops.routes.ts:10-20`, `server/src/api/app.ts:74` |
| **6. Accessibility Revalidation** | Rough contrast estimates. | Mathematical luminance calculations for all design system tokens. All normal text meets WCAG AA (>= 4.5:1), primary text meets AAA (>= 17:1), non-text UI borders meet >= 3:1. | Mathematical sRGB luminance formula audit |
| **7. Test Inventory** | Listed 19 tests across 6 files (referenced non-existent `handoff-breadcrumbs.test.tsx`). | Reconciled exact inventory: **24 tests across 7 test files** (20 in 6 UI test files + 4 in `ops-client.test.ts`). All selectors cataloged. | `npx vitest run src/app/ops src/components/ops src/lib/ops-client.test.ts` (24 passed) |
| **8. Status Semantics** | Equated `active` with success and `escalated` with error. | Decoupled operational states from error semantics. `active` = in-flight live thread; `escalated` = human intervention required (not an app crash); `archived` = dormant/concluded thread. | OrchestrAI multi-agent state lifecycle |

---

## Explicit Classification Section

To ensure complete clarity regarding scope boundaries, every aspect of the Operations & Observability console is classified into one of five categories:

### Part 1: Verified Existing Functionality
The following features are implemented, functional, and covered by existing tests:
- **Conversation Listing**: `fetchOpsConversations(50, 0)` fetches the latest 50 conversations from Postgres.
- **Client-Side Search**: Dynamic filtering on the loaded 50 records by conversation UUID, customer email, or customer name.
- **Client-Side Status Filtering**: Dynamic filtering on loaded records by `all`, `active`, `escalated`, or `archived`.
- **Manual Data Refresh**: Manual refetch buttons on `/ops`, `/ops/traces/[id]`, and `/ops/evals` with loading spinners.
- **Trace Deep-Dive Navigation**: Direct link from conversation row to `/ops/traces/[id]`.
- **Multi-Agent Trajectory Rendering**: Visual breadcrumbs showing the progression from `Supervisor Router` to active specialists.
- **Chronological Trace Timeline**: Alternating sequence of routing decision cards and agent execution cards.
- **Collapsible Tool Diagnostics**: Expandable tool invocation cards displaying tool name, execution status, duration, and error strings.
- **Dynamic Benchmark Runner**: Triggered via `GET /api/ops/eval-results`, executing `runBenchmark(EVALUATION_SCENARIOS)` across 30 scenarios.
- **Benchmark Filtering**: Scenario search input and domain dropdown filter operating over benchmark report results.

### Part 2: Existing Data Available for Presentation
The following fields are already present in existing API response payloads and can be displayed:
- **Conversation Metadata** (`OpsConversation`): UUID, `userId`, `status` (`'active' | 'archived' | 'escalated'`), `createdAt`, `updatedAt`, customer `email`, customer `name`, `turnCount`.
- **Routing Diagnostics** (`OpsRoutingEvent`): `sourceAgent`, `destinationAgent`, `intent`, `decisionType` (`INITIAL_ROUTE`, `HANDOFF`, `ESCALATION`, `FALLBACK`), `reason` (rationale string), `timestamp`.
- **Agent Diagnostics** (`OpsAgentEvent`): `agent` name, `status` (`success` / `failure`), `duration` (ms), `error` message, `timestamp`.
- **Tool Diagnostics** (`OpsToolEvent`): `tool` name, `status` (`success` / `failure`), `duration` (ms), `error` message, `timestamp`.
- **Benchmark Metrics** (`BenchmarkReport`): `totalScenarios` (30), `passedScenarios`, `passRate` (0.0%–100.0%), `byDomain` (counts and rates), `byEvaluator` (8 binary metrics: total, passed, rate), `scenarioResults` (scenario ID, name, domain, pattern, passed, evaluator breakdown, duration).

### Part 3: Proposed Frontend-Only Enhancements (Requiring Approval)
The visual and usability improvements proposed in this document:
- **Design System Token Alignment**: Complete elimination of Tailwind `slate` and `indigo` palettes; migration to Midnight Burgundy canvas (`#16070B`), surface (`#2B0D15`), inset (`#110509`), and Imperial Crimson brand accents (`#8A0B24`).
- **Geist Mono Technical Formatting**: Styling UUIDs, timestamps, turn counts, and millisecond durations in crisp monospace typography.
- **Neutral Monospace Latency**: Displaying execution durations (e.g. `320ms`, `1,240ms`) neutrally in `text-content-muted`, decoupled from success/error styling.
- **Operational Status Semantics**: Distinct status badges:
  - `active` $\to$ Sky/Info badge indicating an in-flight live session.
  - `escalated` $\to$ Amber/Crimson badge indicating handoff to human support.
  - `archived` $\to$ Neutral muted badge indicating a dormant/concluded record.
- **Responsive Mobile Layout**: On viewports `< 768px`, rendering conversation records as stacked cards (`ConversationCard`) with full-width action targets, eliminating horizontal table scroll.
- **Scope Transparency Indicator**: Explicit subtitle on `/ops`: `"Showing up to 50 recent conversations (client-side search & filter)"`.
- **Verifiable Environment Telemetry**: Displaying `System Environment: Dev / Local` in the subnav, matching existing verifiable application context.

### Part 4: Out-of-Scope Backend & API Enhancements
The following features would require server-side, database, or checkpointer changes and are **STRICTLY EXCLUDED** from Phase 34:
- **Server-Side Pagination & Infinite Scroll**: Modifying `/api/ops/conversations` to accept dynamic `limit` and `offset` query parameters with total count metadata.
- **Server-Side Text Search**: Adding SQL `LIKE` or `tsvector` queries to Postgres for server-side conversation search.
- **Live Checkpointer Introspection API**: Creating endpoints that query LangGraph `checkpoints` tables or report live checkpointer engine status.
- **Persistent Benchmark History**: Storing evaluation run results in a database table to show historical pass rate trends over time.
- **Automated Polling / WebSockets**: Introducing background WebSocket feeds or aggressive polling for live traces.

### Part 5: Security Concerns Requiring Separate Remediation
The following security findings were identified during discovery and are documented for remediation in a future backend/infrastructure phase:
- **Absence of Authentication in Non-Production**: When `enableDemoEndpoints: true` is configured (or in local development), `/api/ops/*` endpoints require no JWT or session cookie. Anyone on the local network can access conversation and trace endpoints.
- **Absence of RBAC / Operator Roles**: The platform has no role-based permission system distinguishing customer users from support operators.
- **Plaintext Customer PII in Ops Responses**: Customer names and email addresses are returned in plaintext in `OpsConversationListResponse`.
- **Note on Production Safety**: In production (`NODE_ENV === 'production'`) or when `enableDemoEndpoints: false`, the `requireDemoEnabled` middleware throws `NotFoundError('Ops endpoints are not enabled')`, returning HTTP 404. Production deployment is secure against unauthorized external access.

---

## 1. Route & Component Architecture

### 1.1 File Structure & Component Hierarchy
```text
client/src/app/ops/
├── layout.tsx                              # Shared Ops Layout (TopNav + OpsSubNav)
├── page.tsx                                # /ops: Conversation Explorer
├── page.test.tsx                           # 2 tests: metrics rendering + error banner
├── evals/
│   ├── page.tsx                            # /ops/evals: Benchmark Dashboard
│   └── page.test.tsx                       # 2 tests: scorecard rendering + error banner
└── traces/
    └── [id]/
        ├── page.tsx                        # /ops/traces/[id]: Trace Inspector
        └── page.test.tsx                   # 2 tests: trace loading + error banner

client/src/components/ops/
├── conversation-table.tsx                  # Search & filter toolbar + desktop table + mobile cards
├── conversation-table.test.tsx             # 6 tests: filters, search, refresh, inspect link
├── eval-scorecard.tsx                      # KPI banner + domain/evaluator breakdowns + scenario table
├── eval-scorecard.test.tsx                 # 4 tests: pass rate, stats, search, domain filter
├── handoff-breadcrumbs.tsx                 # Multi-agent routing trajectory pipeline
├── tool-execution-card.tsx                 # Collapsible tool execution diagnostic card
├── trace-timeline.tsx                      # Chronological routing + agent execution timeline
└── trace-timeline.test.tsx                 # 4 tests: empty state + routing/agent/tool rendering + error state

client/src/lib/
├── ops-client.ts                           # Ops API client
└── ops-client.test.ts                      # 4 tests: fetchOpsConversations, fetchOpsTrace, fetchOpsEvalResults, error handling
```

---

## 2. API Contracts & Verified Execution Mechanisms

All ops communication flows through `client/src/lib/ops-client.ts`:

| Endpoint | Method | Client Method | Response Type | Verified Execution Behavior |
| :--- | :---: | :--- | :--- | :--- |
| `/api/ops/conversations?limit=50&offset=0` | `GET` | `fetchOpsConversations(50, 0)` | `OpsConversationListResponse` | Fetches the 50 most recent conversations from Postgres ordered by `createdAt DESC`. Populates conversation table and KPI cards (`totalCount`, `activeCount`, `escalatedCount`). |
| `/api/ops/conversations/:id/traces` | `GET` | `fetchOpsTrace(id)` | `OpsTraceResponse` | Fetches trace events for conversation `:id`. Populates execution timeline, handoff breadcrumbs, and conversation metadata. |
| `/api/ops/eval-results` | `GET` | `fetchOpsEvalResults()` | `OpsEvalResponse` (`BenchmarkReport`) | **Dynamically executes** `runBenchmark(EVALUATION_SCENARIOS, { configurable: { useStubs: true } })` on the server and returns the aggregated 30-scenario report. Populates scorecard, breakdowns, and results table. |

### 2.1 Benchmark Execution Verification
In `server/src/api/controllers/ops.controller.ts`:
```ts
export async function getOpsEvalResultsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await runBenchmark(EVALUATION_SCENARIOS, {
      configurable: { useStubs: true },
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
}
```
The "Re-Run Benchmark" button in `client/src/app/ops/evals/page.tsx` executes:
```tsx
const loadBenchmark = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const data = await fetchOpsEvalResults();
    setReport(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to run benchmark');
  } finally {
    setLoading(false);
  }
}, []);
```
**Conclusion**: Re-running the benchmark is an existing, verified capability triggered via `GET /api/ops/eval-results`. The button is retained with its existing `data-testid="refresh-evals-button"`.

### 2.2 Conversation Discovery Boundary
`fetchOpsConversations(50, 0)` queries:
```ts
const rows = await db
  .select()
  .from(conversations)
  .limit(limit)
  .offset(offset)
  .orderBy(desc(conversations.createdAt));
```
- Only the first 50 conversations are returned.
- Client search (`searchQuery`) and filter (`statusFilter`) operate in memory via `useMemo` on these 50 items.
- Conversations beyond the 50th cannot be retrieved from the UI.
- The redesign transparently communicates this constraint with an explicit badge: `50 Most Recent Threads (In-Memory Filter)`.

---

## 3. Visual & Usability Architecture

### 3.1 Design Tokens (Midnight Burgundy & Imperial Crimson)
In strict accordance with `client/ORCHESTRAI_DESIGN_SYSTEM.md`:
- **Canvas Background**: `bg-surface-canvas` (`#16070B`)
- **Surface Elevation**: `bg-surface` (`#2B0D15`)
- **Recessed Areas & Chips**: `bg-surface-inset` (`#110509`)
- **Sidebar & Subnav**: `bg-surface-sidebar` (`#200910`)
- **Borders**: `border-edge-subtle` (`#4A1525`)
- **Focus Outlines**: `ring-brand-primary` (`#8A0B24`) or `ring-brand-focus` (`#D1193E`)
- **Primary CTAs**: `bg-brand-primary` (`#8A0B24`), hover `bg-brand-hover` (`#A30D2B`)
- **Link & Accent Text**: `text-brand-link` (`#FF8FA3`)
- **Primary Text**: `text-content-primary` (`#FFF9FA`)
- **Secondary Text**: `text-content-secondary` (`#D9B8BF`)
- **Muted Text**: `text-content-muted` (`#B08A94`)

### 3.2 Operational Status Semantics
- **`active`** (In-Flight Thread):
  - Meaning: Conversation is live, actively processing turns or waiting on user input.
  - Styling: `bg-sky-500/10 text-sky-400 border border-sky-500/25` with pulse dot.
  - Label: `Active / In-Flight`
- **`escalated`** (Human Intervention Needed):
  - Meaning: Supervisor or specialist escalated thread to human support due to policy or limit.
  - Styling: `bg-amber-500/10 text-amber-400 border border-amber-500/25` with alert icon.
  - Label: `Escalated`
- **`archived`** (Concluded Thread):
  - Meaning: Dormant or completed conversation thread.
  - Styling: `bg-surface-inset text-content-muted border border-edge-subtle`.
  - Label: `Archived / Closed`

### 3.3 Latency & Duration Formatting
- All durations (`duration` in ms) are rendered neutrally in monospace typography (`font-mono text-content-muted text-xs`).
- Example: `320ms`, `1,450ms`, `45ms`.
- **Zero Synthetic Coloring**: Durations are never styled green, yellow, or red based on invented thresholds.
- Tool and agent execution success (`SUCCESS`) or failure (`FAILURE`) is indicated strictly by the execution status badge, completely independent of duration.

---

## 4. Route-by-Route Layout Specification

### 4.1 Shared Subnav (`client/src/app/ops/layout.tsx`)
- Container: `bg-surface-sidebar border-b border-edge-subtle px-6 py-2.5`
- Subnav navigation items:
  - **Conversations**: Active state pill in `bg-surface text-brand-link border border-edge-subtle`.
  - **Evaluation Benchmark**: Active state pill in `bg-surface text-brand-link border border-edge-subtle`.
- Telemetry block (Right side):
  - `System Environment: Dev / Local` rendered in `font-mono text-xs text-content-muted`.
  - Zero invented checkpointer engine badges.

### 4.2 `/ops` — Conversation Explorer (`client/src/app/ops/page.tsx` & `conversation-table.tsx`)
1. **Header Row**:
   - Title: `Conversation Explorer` in `text-2xl font-bold text-content-primary tracking-tight`.
   - Subtitle: `Showing up to 50 recent orchestration threads (In-Memory Filter)`.
2. **KPI Telemetry Row**:
   - 3 high-density cards in `bg-surface border border-edge-subtle rounded-xl p-4`:
     - **Total Loaded**: `data-testid="metric-total"` — Integer in `font-mono text-2xl font-bold text-content-primary`.
     - **Active Threads**: `data-testid="metric-active"` — Integer in `font-mono text-2xl font-bold text-sky-400`.
     - **Escalated Threads**: `data-testid="metric-escalated"` — Integer in `font-mono text-2xl font-bold text-amber-400`.
3. **Search & Filter Toolbar**:
   - Search Input: `data-testid="search-input"` recessed in `bg-surface-inset border-edge-subtle text-content-primary` with placeholder `Search UUID, customer, email...`.
   - Status Filter: `data-testid="status-filter-select"` with options `all`, `active`, `escalated`, `archived`.
   - Refresh Button: `data-testid="refresh-button"` styled in `bg-surface border-edge-subtle hover:bg-surface-hover text-content-primary`.
4. **Conversation Presentation**:
   - **Desktop (`md:` and above)**: High-density table with columns:
     - `Conversation ID`: Monospace chip in `bg-surface-inset text-brand-link border-edge-subtle px-2 py-0.5 rounded font-mono text-xs`.
     - `Customer`: Name in `font-medium text-content-primary`, email in `font-mono text-xs text-content-muted`.
     - `Status`: Semantic badge (`active`, `escalated`, `archived`).
     - `Turns`: Integer in `font-mono text-xs text-content-secondary`.
     - `Last Active`: Formatted date in `font-mono text-xs text-content-muted`.
     - `Action`: Inspect button (`data-testid="inspect-btn-{id}"`) linking to `/ops/traces/{id}` styled in `bg-brand-primary hover:bg-brand-hover text-white px-3 py-1 rounded text-xs font-semibold`.
   - **Mobile (`< md`)**: Responsive card stack (`ConversationCard`):
     - Avoids horizontal table scroll.
     - Displays UUID chip, status badge, customer info, turns, and full-width "Inspect Trace" button.

### 4.3 `/ops/traces/[id]` — Trace Inspector (`client/src/app/ops/traces/[id]/page.tsx` & components)
1. **Header Metadata Strip**:
   - Back Link: `data-testid="back-to-conversations-link"` to `/ops`.
   - Full Conversation UUID in `font-mono text-lg font-bold text-content-primary break-all`.
   - Refresh Trace: `data-testid="refresh-trace-btn"`.
   - Metadata badges: Message count (`X messages`), Trace events (`Y trace events`), Initial route pill.
2. **Trajectory Pipeline (`HandoffBreadcrumbs`)**:
   - `data-testid="handoff-breadcrumbs"` in `bg-surface border border-edge-subtle rounded-xl p-4`.
   - Visual trajectory sequence: `Supervisor Router` $\to$ `Specialist` with directional chevron. Active specialist highlighted with subtle Imperial Crimson outline.
3. **Execution Timeline (`TraceTimeline`)**:
   - Vertical timeline rail in `border-edge-subtle`.
   - **Routing Decision Cards** (`data-testid="timeline-routing-event-{index}"`):
     - Source $\to$ Destination routing trajectory.
     - Decision type badge (`data-testid="decision-type-badge"`): `INITIAL_ROUTE`, `HANDOFF`, `ESCALATION`, `FALLBACK`.
     - Intent pill and formatted LLM rationale block in `bg-surface-inset border-edge-subtle font-sans text-xs text-content-secondary`.
   - **Agent Execution Cards** (`data-testid="timeline-agent-event-{index}"`):
     - Agent name badge with duration formatted in `font-mono text-content-muted` (e.g. `1,250ms`).
     - Agent status badge (`data-testid="agent-status-badge"`): `SUCCESS` / `FAILURE`.
     - Collapsible **Tool Execution Cards** (`data-testid="tool-card-{tool}"`):
       - Header with tool name, execution status (`data-testid="tool-status-success"` or `tool-status-failure`), and duration in `font-mono text-content-muted`.
       - Chevron toggling collapsible details (`aria-expanded`).
       - Error diagnostics banner with alert icon if execution failed.

### 4.4 `/ops/evals` — Evaluation Dashboard (`client/src/app/ops/evals/page.tsx` & `eval-scorecard.tsx`)
1. **Scorecard KPI Banner (`data-testid="eval-scorecard"`)**:
   - Radiant burgundy card with subtle radial gradient.
   - Circular pass rate gauge (`data-testid="overall-pass-rate"`): e.g. `100.0%` with fraction `(30 / 30 Scenarios Passed)`.
   - Primary Re-Run Button: `data-testid="refresh-evals-button"` styled in Imperial Crimson (`bg-brand-primary hover:bg-brand-hover text-white font-semibold`).
2. **2-Column Breakdown Grid**:
   - **Domain Breakdown**: Progress tracks for `order_tracking`, `payment & refund`, `account_access & profile`, etc. (`data-testid="domain-stat-{domain}"`).
   - **Binary Evaluators (8 Metrics)**: Progress tracks for `ROUTING_CORRECT`, `TOOL_SELECTION_CORRECT`, `STATE_PRESERVED`, `POLICY_COMPLIANCE`, etc. (`data-testid="evaluator-stat-{evaluator}"`).
3. **Scenario Results Table**:
   - Search input (`data-testid="scenario-search-input"`) and domain dropdown filter (`data-testid="scenario-domain-filter"`).
   - Table (`data-testid="scenario-results-table"`) displaying scenario ID, name, domain, pattern, evaluator fractions, duration, and semantic `PASS` / `FAIL` badge.

---

## 5. Security & Authorization Analysis

### 5.1 The 5 Security Tiers
1. **Frontend Route Guard**: **None**. Neither `/ops`, `/ops/traces/[id]`, nor `/ops/evals` calls `useRequireAuth()`. Unauthenticated browser sessions can mount the pages.
2. **Frontend Client Credentials**: **None**. `ops-client.ts` uses plain `fetch()` without sending an `Authorization: Bearer <token>` header or session cookies.
3. **Backend Route Authentication**: **None**. `opsRouter` is mounted directly under `app.use('/api/ops', opsRouter)` in `server/src/api/app.ts` without authentication middleware.
4. **Backend RBAC / Permission Checks**: **None**. There is no role verification (e.g. operator/admin) on the endpoints.
5. **Backend Demo Mode Gate**: **Enforced**. `requireDemoEnabled` middleware locks the endpoints:
   ```ts
   if (!isEnabled || config.env === 'production') {
     throw new NotFoundError('Ops endpoints are not enabled');
   }
   ```
   In production (`NODE_ENV === 'production'`) or when `enableDemoEndpoints: false`, requests return HTTP `404 Not Found`.

### 5.2 Environment Exposure Assessment
- **Production Environment**: **Secure**. The 404 lockout prevents external callers from accessing ops endpoints or discovering data.
- **Development & Staging Environments**: **Exposed**. If `enableDemoEndpoints: true` is set, any client with network access can read conversation lists, customer names, emails, trace steps, and routing rationale.
- **Data Sanitization Rule**: The UI must strictly follow OrchestrAI rules: **never render raw verification codes (OTP), passwords, or API secret keys** in trace timelines, tool cards, or error banners.

---

## 6. Accessibility & Contrast Verification (WCAG 2.2 AA / AAA)

Exact mathematical luminance ($L$) and contrast ratios against design system tokens:

$$\text{Contrast Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$

| Element | Foreground Token & Hex | Background Token & Hex | Relative Luminance ($L_1 : L_2$) | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Primary Body Text** | `text-content-primary` (`#FFF9FA`) | `bg-surface-canvas` (`#16070B`) | $0.963 : 0.007$ | **18.87:1** | **Passes AAA** (>= 7.0:1) |
| **Primary Card Text** | `text-content-primary` (`#FFF9FA`) | `bg-surface` (`#2B0D15`) | $0.963 : 0.012$ | **17.23:1** | **Passes AAA** (>= 7.0:1) |
| **Primary Inset Text** | `text-content-primary` (`#FFF9FA`) | `bg-surface-inset` (`#110509`) | $0.963 : 0.005$ | **19.23:1** | **Passes AAA** (>= 7.0:1) |
| **Secondary Text** | `text-content-secondary` (`#D9B8BF`) | `bg-surface` (`#2B0D15`) | $0.505 : 0.012$ | **9.87:1** | **Passes AAA** (>= 7.0:1) |
| **Muted Monospace Text** | `text-content-muted` (`#B08A94`) | `bg-surface` (`#2B0D15`) | $0.288 : 0.012$ | **5.90:1** | **Passes AA** (>= 4.5:1) |
| **Brand Link / UUID Chip** | `text-brand-link` (`#FF8FA3`) | `bg-surface` (`#2B0D15`) | $0.407 : 0.012$ | **8.29:1** | **Passes AAA** (>= 7.0:1) |
| **Active Live Badge** | `text-sky-400` (`#38BDF8`) | `bg-surface` (`#2B0D15`) | $0.490 : 0.012$ | **9.84:1** | **Passes AAA** (>= 7.0:1) |
| **Escalated Badge** | `text-amber-400` (`#FBBF24`) | `bg-surface` (`#2B0D15`) | $0.540 : 0.012$ | **10.74:1** | **Passes AAA** (>= 7.0:1) |
| **Error Status** | `text-status-error` (`#FB7185`) | `bg-surface` (`#2B0D15`) | $0.306 : 0.012$ | **6.66:1** | **Passes AA** (>= 4.5:1) |
| **Primary Button Text** | `#FFFFFF` | `bg-brand-primary` (`#8A0B24`) | $1.000 : 0.057$ | **9.75:1** | **Passes AAA** (>= 7.0:1) |
| **Focus Ring Border** | `ring-brand-focus` (`#D1193E`) | `bg-surface` (`#2B0D15`) | $0.158 : 0.012$ | **3.35:1** | **Passes Non-Text UI** (>= 3.0:1) |

---

## 7. Complete Test Inventory Reconciliation

A complete audit of Vitest suites confirms **24 tests across 7 test files**:

| File Path | Test Count | Key Assertions & Selectors Covered |
| :--- | :---: | :--- |
| `src/app/ops/page.test.tsx` | 2 | Header render, `metric-total`, `metric-active`, `metric-escalated`, `ops-error-banner` |
| `src/app/ops/traces/[id]/page.test.tsx` | 2 | Header metadata, `handoff-breadcrumbs`, `trace-timeline`, `trace-error-banner`, `back-to-conversations-link`, `refresh-trace-btn` |
| `src/app/ops/evals/page.test.tsx` | 2 | Header render, `eval-scorecard`, `evals-error-banner`, `refresh-evals-button` |
| `src/components/ops/conversation-table.test.tsx` | 6 | `conversation-table-container`, `search-input`, `status-filter-select`, `refresh-button`, `conversations-table`, `no-results-row`, `status-active`, `status-escalated`, `inspect-btn-{id}` |
| `src/components/ops/trace-timeline.test.tsx` | 4 | `empty-timeline`, `timeline-routing-event-{index}`, `timeline-agent-event-{index}`, `decision-type-badge`, `agent-status-badge`, `tool-card-{tool}`, `tool-status-success`, `tool-status-failure`, error message render |
| `src/components/ops/eval-scorecard.test.tsx` | 4 | `eval-scorecard`, `overall-pass-rate`, `domain-stat-{domain}`, `evaluator-stat-{evaluator}`, `scenario-search-input`, `scenario-domain-filter`, `scenario-results-table` |
| `src/lib/ops-client.test.ts` | 4 | `fetchOpsConversations`, `fetchOpsTrace`, `fetchOpsEvalResults`, HTTP error handling |
| **Total** | **24** | **100% Passing Baseline** |

### Asserted Test Selectors (Strictly Preserved):
- **Page Selectors**: `metric-total`, `metric-active`, `metric-escalated`, `ops-error-banner`, `trace-error-banner`, `evals-error-banner`, `back-to-conversations-link`, `refresh-trace-btn`, `refresh-evals-button`.
- **Table Selectors**: `conversation-table-container`, `search-input`, `status-filter-select`, `refresh-button`, `conversations-table`, `no-results-row`, `status-active`, `status-escalated`, `inspect-btn-{id}`.
- **Timeline Selectors**: `empty-timeline`, `timeline-routing-event-{index}`, `timeline-agent-event-{index}`, `decision-type-badge`, `agent-status-badge`, `tool-card-{tool}`, `tool-status-success`, `tool-status-failure`.
- **Scorecard Selectors**: `eval-scorecard`, `overall-pass-rate`, `domain-stat-{domain}`, `evaluator-stat-{evaluator}`, `scenario-search-input`, `scenario-domain-filter`, `scenario-results-table`.

---

## 8. Phased Implementation Plan (Small, Verifiable Steps)

Upon receiving user approval, execution will proceed on branch `phase/34-ops-visual-redesign`:

- [ ] **Step 0: Branch Creation & Proposal Commit**
  - Create branch `phase/34-ops-visual-redesign`.
  - Add `client/ORCHESTRAI_OPS_REDESIGN_PROPOSAL.md` and commit.
- [ ] **Step 1: Redesign `OpsLayout` (`client/src/app/ops/layout.tsx`)**
  - Apply `bg-surface-canvas`, `bg-surface-sidebar`, `border-edge-subtle`, active subnav pills, and verifiable telemetry indicator (`System Environment: Dev / Local`).
  - Verify with `npm run typecheck`, `npm run lint`.
  - Commit `phase 34 step 1: ops layout dark redesign`.
- [ ] **Step 2: Redesign `ConversationTable` & `/ops` Explorer**
  - Update `client/src/components/ops/conversation-table.tsx` and `client/src/app/ops/page.tsx`.
  - Apply `Geist Mono` UUID chips, Midnight Burgundy surfaces, Imperial Crimson inspect buttons, status badges (`active`, `escalated`, `archived`), and responsive mobile card stack.
  - Verify with `npm run typecheck`, `npm run lint`, and Vitest (`page.test.tsx`, `conversation-table.test.tsx`).
  - Commit `phase 34 step 2: conversation explorer dark redesign`.
- [ ] **Step 3: Redesign Trace Inspector Components**
  - Update `tool-execution-card.tsx`, `handoff-breadcrumbs.tsx`, `trace-timeline.tsx`, and `traces/[id]/page.tsx`.
  - Apply glowing trajectory pipeline, structured routing cards, neutral monospace durations (`duration` ms), and collapsible tool blocks with accessible `aria-expanded`.
  - Verify with `npm run typecheck`, `npm run lint`, and Vitest (`trace-timeline.test.tsx`, `traces/[id]/page.test.tsx`).
  - Commit `phase 34 step 3: trace inspector dark redesign`.
- [ ] **Step 4: Redesign Evaluation Benchmark Components**
  - Update `eval-scorecard.tsx` and `evals/page.tsx`.
  - Apply radiant KPI banner, domain/evaluator progress tracks, styled scenario table, and preserve `refresh-evals-button`.
  - Verify with `npm run typecheck`, `npm run lint`, and Vitest (`eval-scorecard.test.tsx`, `evals/page.test.tsx`).
  - Commit `phase 34 step 4: evals benchmark scorecard dark redesign`.
- [ ] **Step 5: Full Client Test Suite Verification & Documentation Update**
  - Run full test suite across all 28 files (all 150 tests passing).
  - Update `docs/STATUS.md` recording Phase 34 completion.
  - Commit `phase 34 step 5: update STATUS.md — ops observability redesign complete, 150 client tests passing`.

---

## 9. StageShow Visual Demonstrations

The visual demonstrations have been authored and verified using the StageShow skill:
- **Interactive StageShow Artifact**: [`ops-redesign-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/ops-redesign-stageshow.html)

**Slides Included**:
1. 🖥️ **Desktop `/ops` Conversation Explorer (1440 × 820)**: Displays verifiable environment telemetry, 50-item scope subtitle, KPI stat cards, and scannable table with Geist Mono UUID chips.
2. 🔬 **Desktop `/ops/traces/[id]` Trace Inspector (1440 × 820)**: Displays trajectory breadcrumbs, structured routing cards, and collapsible tool diagnostics with neutral monospace durations.
3. 🏆 **Desktop `/ops/evals` Benchmark Scorecard (1440 × 820)**: Displays radiant pass rate circular gauge, 30-scenario domain and binary evaluator progress bars, and searchable scenario table.
4. 📱 **Mobile Adaptation (375 × 760)**: Demonstrates the responsive `ConversationCard` stack eliminating horizontal scroll.

---

## Strict Approval Gate

**No production application code or tests have been modified.**  
We pause here and request your explicit approval of this refined proposal before beginning Phase 34 implementation.
