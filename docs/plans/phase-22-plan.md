# Phase 22 — Mandatory User Authentication, Dedicated Storefront & Order Management Pages — PLAN (status: APPROVED 2026-11-07)

## 1. Goal and How It Fits the Architecture
Phase 22 transitions OrchestrAI into a production-grade consumer application where user authentication is mandatory for accessing customer chat, browsing the store, and managing orders. Visitors without an active session are routed to dedicated `/login` and `/register` pages, and valid sessions persist across page refreshes and browser restarts. The demo identity selector is retired from the end-user sidebar while underlying seed records are retained in PostgreSQL for headless evaluation and test suite continuity.

## 2. Dependencies Satisfied / Missing
- **Phases 1-21**: All complete and verified.
- **Current Baseline Test Count**: Server: 584 passing (67 files); Client: 112 passing (23 files). Total: 696 passing tests.

## 3. Scope IN / Scope OUT
### Scope IN:
1. **Dedicated Authentication Pages (`client/src/app/(auth)/`)**:
   - `/login`: Email & password form, redirect to previous page (or `/`) upon success, link to `/register`.
   - `/register`: Name, email, default shipping address, and password form, automatic session login upon success, redirect to `/store` or `/`.
   - Client route protection: Unauthenticated attempts to access `/`, `/store`, or `/orders` redirect to `/login?redirect=...`.
   - Already-authenticated visits to `/login` or `/register` redirect to `/`.
2. **Session Persistence**:
   - Long-lived session restoration from `localStorage` (`orchestrai_token`) verified via `GET /api/auth/me`.
   - Seamless silent token refresh / verification during initial application hydration.
3. **Dedicated Storefront Page (`/store`)**:
   - Browse catalog products with names, SKUs, and prices.
   - Multi-item quantity adjustments, live cart subtotal calculation.
   - Checkout button invoking `POST /api/orders`.
   - Structured order receipt modal / confirmation with Order ID, Tracking Number, and "Ask Agent About This Order" action.
4. **Dedicated Orders Management Page (`/orders`)**:
   - Fetch authenticated user orders via `GET /api/orders`.
   - Display order cards with Order ID, timestamp, status badge (`paid`, `shipped`, `in_transit`, `delivered`), total amount, and shipping address snapshot.
   - 1-click "Ask Agent About This Order" button on each order card routing directly into the chat interface with pre-loaded inquiry context.
5. **UI Modernization & Demo Cleanup**:
   - Update `TopNav` to feature `Support Chat`, `Store`, and `My Orders` navigation links, plus user identity badge and Sign Out action.
   - Remove the Demo Identity selector and demo disclaimer from the chat sidebar (`conversation-sidebar.tsx`).
   - Retain database seed data for all 14 evaluation scenarios and Vitest automated suites.
6. **Test Coverage**:
   - Unit and integration tests for `/login`, `/register`, `/store`, and `/orders` pages.
   - Zero regression across all 696 existing baseline tests.

### Scope OUT:
- Altering protected backend checkpoint tables or checkpointer setup scripts.
- Removing seed data from PostgreSQL database (retained for headless CI/CD evaluation).
- External OAuth identity providers (Google/GitHub).

## 4. Open Decisions This Phase Must Resolve
### OD-22a: Route Guard Implementation Pattern (Client Component vs Next.js Middleware)
- **Options**:
  - *Option A (Recommended)*: Client-side `AuthGuard` wrapper / `useRequireAuth()` hook utilizing `useAuth()`. Because OrchestrAI operates primarily as a single-page interactive chat and dashboard application backed by an Express REST API with Bearer tokens in `localStorage`, client-side auth guarding avoids cookie-sync synchronization issues and CORS proxy complexity across ports 3000 and 4000.
  - *Option B*: Next.js server-side `middleware.ts` reading HTTP-only cookies. Would require migrating token transport to cross-origin cookies.
- **Recommendation**: Adopt **Option A**.

### OD-22b: Pre-filling Chat Message from Store & Orders
- **Options**:
  - *Option A (Recommended)*: When user clicks "Ask Agent About This Order", route to `/?orderId=<orderId>` or pass state to pre-fill the chat input (`Where is my order <orderId>?`) and focus the message input.
  - *Option B*: Automatically send the message immediately upon navigation.
- **Recommendation**: Adopt **Option A** (allows user to review/adjust the message before submitting).

## 5. Ordered Steps

### Step 1: Authentication Guard Hook & Dedicated Auth Routes (`client/`)
- **Files touched**:
  - `client/src/hooks/use-require-auth.ts`: Hook redirecting unauthenticated users to `/login`.
  - `client/src/app/login/page.tsx`: Clean, focused login page with error alerts.
  - `client/src/app/register/page.tsx`: Registration page with address and password requirements.
  - Component tests for login and register pages.
- **Protected files affected**: None.

### Step 2: Global Navigation & Sidebar Clean-up (`client/`)
- **Files touched**:
  - `client/src/components/navigation/top-nav.tsx`: Add navigation links for `Chat`, `Store`, `My Orders`, active user profile, and Sign Out.
  - `client/src/components/sidebar/conversation-sidebar.tsx`: Remove demo user selector dropdown and demo disclaimer; display real user identity and "+ New Chat".
  - Update `conversation-sidebar.test.tsx` and `top-nav.test.tsx`.
- **Protected files affected**: None.

### Step 3: Dedicated Storefront Page (`/store`) (`client/`)
- **Files touched**:
  - `client/src/app/store/page.tsx`: Product catalog grid, quantity controls, cart summary panel, checkout confirmation modal with Order ID & Tracking Number.
  - Tests in `client/src/app/store/page.test.tsx`.
- **Protected files affected**: None.

### Step 4: Dedicated Order Management Page (`/orders`) (`client/`)
- **Files touched**:
  - `client/src/app/orders/page.tsx`: Order history cards with status pills, order details, and "Ask Agent" CTA.
  - Tests in `client/src/app/orders/page.test.tsx`.
- **Protected files affected**: None.

### Step 5: Chat Pre-fill Integration & Page Routing Guard (`client/`)
- **Files touched**:
  - `client/src/app/page.tsx`: Guard chat with `useRequireAuth()`; inspect `orderId` search param to pre-fill prompt.
  - Update `client/src/app/page.test.tsx`.
- **Protected files affected**: None.

### Step 6: Full Verification, Documentation & Closeout
- **Files touched**:
  - `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`.
  - Full suite run: `npm run lint`, `npm run typecheck`, `npm test` across server and client.
- **Protected files affected**: None.

## 6. Functional Requirements
- Unauthenticated users attempting to access `/`, `/store`, or `/orders` are automatically redirected to `/login`.
- A user can register on `/register` and is immediately logged in and routed to `/store` or `/`.
- A user can log in on `/login` and is redirected back to their intended page (or `/`).
- Sessions persist on page refresh and when closing/reopening the browser tab.
- Users can browse products, select quantities, and place orders on `/store`, receiving an Order ID and Tracking Number.
- Users can view all placed orders on `/orders` with real-time status and click to query the support agent.
- Clicking "Ask Agent About This Order" transitions to `/` with the inquiry populated in chat.
- All demo identity elements are removed from the client UI.

## 7. Non-Functional Requirements
- Passwords never logged, stored in plaintext, or visible in URL parameters.
- Client tests achieve 100% pass rate.
- Server test suite (584 tests) maintains 100% pass rate with zero regressions.

## 8. Acceptance Criteria
- `/login` and `/register` pages render and process authentication requests correctly.
- `/store` page allows placing orders and displays order confirmation.
- `/orders` page displays order history and routes order inquiries to chat.
- Unauthenticated access redirects to `/login`.
- Reopening domain in same browser maintains authenticated session.
- 696+ tests passing across server and client.

## 9. Risks and Stop Triggers
- Any regression in existing benchmark evaluation scenarios -> Stop and investigate.
- Any Next.js router hydration mismatches -> Stop and resolve.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/OPEN-DECISIONS.md`

STOP here and request approval.

