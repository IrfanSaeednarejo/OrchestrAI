# Phase 18 Manual Verification Runbook

This runbook guides manual end-to-end verification of the OrchestrAI Platform / Ops UI and observability inspection console (`client/src/app/ops/`) with the backend API (`server/`).

---

## 1. Prerequisites & Environment Setup

### 1.1 Infrastructure
Ensure PostgreSQL (with pgvector) and Redis are running via WSL2 Docker:
```bash
wsl docker compose up -d
wsl docker compose ps
```

### 1.2 Backend Configuration & Startup
In `server/.env`:
```env
PORT=3001
CLIENT_ORIGIN=http://localhost:3000
ENABLE_DEMO_ENDPOINTS=true
```
Start the backend server:
```powershell
cd server
npm run dev
```
Confirm the console output displays:
```
[SERVER] Server listening on port 3001
[DEMO] Dev/Demo routes active (/api/demo-users, /api/dev/verification-code)
```

### 1.3 Frontend Configuration & Startup
In `client/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_DEMO_CODE=true
```
Start the Next.js development server:
```powershell
cd client
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 2. Verification Scenarios

### Scenario 1: Global Navigation & Dual-Mode Switching
*Goal: Verify seamless navigation between Customer Chat and Platform Ops.*

1. **Top Navigation Bar**:
   - Navigate to `http://localhost:3000`.
   - Observe the dark top navigation header showing the `OrchestrAI` brand, `Customer Chat` tab, and `Platform Ops` tab.
   - Click **Platform Ops**.
   - URL updates to `/ops`.
   - The active navigation indicator highlights **Platform Ops**.
   - Sub-navigation bar appears with **Conversations** and **Evaluation Benchmark** links.
2. **Return to Chat**:
   - Click **Customer Chat** in top nav.
   - Returns to `/` with chat state and active conversation preserved.

---

### Scenario 2: Conversation Explorer & Status Filtering
*Goal: Verify multi-tenant conversation listing, search, status filtering, and turn counts.*

1. **Navigate to Explorer**: Open `http://localhost:3000/ops`.
2. **Metrics Bar**:
   - Verify KPI cards display counts: `Total`, `Active`, and `Escalated`.
3. **Search & Filter**:
   - Type `Alice` into the search box. Table filters down to conversations belonging to Alice.
   - Clear search box.
   - In the status dropdown, select `Escalated`. Table displays only conversations with escalated status (rose badge).
   - Switch back to `All Statuses`.
4. **Inspect Action**:
   - Locate any conversation row.
   - Click the **Inspect** button (with right arrow icon).
   - Navigates to `/ops/traces/<conversation-id>`.

---

### Scenario 3: Trace Viewer & Multi-Agent Handoff Trajectory
*Goal: Verify visual routing breadcrumbs, chronological event feed, and tool telemetry.*

1. **Trajectory Breadcrumbs**:
   - Look at the top breadcrumbs card (*Multi-Agent Routing Trajectory*).
   - Verify nodes show routing transitions: e.g., `Supervisor Router ➔ Payments & Billing ➔ Refunds`.
   - The terminal specialist displays an `Active` badge.
2. **Event Timeline**:
   - Scroll down to the *Execution Event Log*.
   - **Routing Decision Nodes (Purple)**:
     - Verify decision type badge (`INITIAL_ROUTE`, `RE_ROUTE`, `HANDOFF`, `ESCALATION`).
     - Route path (`supervisor_router ➔ order_tracking`).
     - Rationale text explaining classification logic.
   - **Agent Execution Nodes (Blue)**:
     - Agent name and status badge (`success`, `failure`).
     - Duration in milliseconds (e.g., `340ms`).
     - List of invoked tools (e.g., `get_order`, `get_payment`).
3. **Collapsible Tool Execution Cards**:
   - Click on any tool execution card.
   - Card expands to reveal exact execution timestamp, duration, and error payload (if failed).
4. **Refresh**:
   - Click **Refresh Trace** in the header. Updates events in-place without page reload.

---

### Scenario 4: Evaluation Benchmark Dashboard
*Goal: Verify 30-scenario benchmark scorecards, domain rates, and evaluator breakdown.*

1. **Navigate to Evals**: In the Ops sub-nav, click **Evaluation Benchmark** (`/ops/evals`).
2. **Top KPI Scorecard**:
   - Displays *30-Scenario Canonical Benchmark*.
   - Overall Pass Rate displays (e.g., `100.0%`, 30 of 30 passed).
3. **Domain Breakdown**:
   - Shows progress bars and pass counts for all domain categories (`order_tracking`, `returns`, `payment`, `refund`, `profile`, `account_access`, `cross_domain`, `safety`).
4. **Evaluator Breakdown**:
   - Shows individual pass rates for the 8 deterministic binary evaluators:
     - `ROUTING_CORRECT`
     - `HANDOFF_CORRECT`
     - `SPECIALIST_SCOPE_CORRECT`
     - `TOOL_SELECTION_CORRECT`
     - `STATE_PRESERVED`
     - `KNOWLEDGE_GROUNDED`
     - `WORKFLOW_COMPLETED`
     - `RESOLUTION_CORRECT`
5. **Scenario Results Grid**:
   - Type `duplicate` in the search filter: filters to duplicate charge scenarios.
   - Use the domain filter dropdown to isolate `returns` or `account_access`.
   - Verify each scenario displays `ID`, `Scenario Name`, `Pattern`, `Evaluators (8/8)`, and `PASS/FAIL` badge.

