# Phase 21 — Real User Accounts, Authentication & Storefront Integration — PLAN (status: APPROVED 2026-11-07)

## 1. Goal and How It Fits the Architecture
Phase 21 transitions OrchestrAI from a demo/seeded evaluation harness into an end-to-end self-service customer support platform. Real users can register, sign in, sign out, browse catalog products, place live orders, and converse with the autonomous multi-agent system to resolve their inquiries (tracking, returns, refunds, payment issues, profile updates) in real time. The architecture preserves 100% backwards compatibility with existing benchmark evaluation scenarios and test suites.

## 2. Dependencies Satisfied / Missing
- **Phases 1-20**: All complete and verified.
- **Current Baseline Test Count**: Server: 563 passing (65 files); Client: 98 passing (20 files). Total: 661 passing tests.

## 3. Scope IN / Scope OUT
### Scope IN:
1. **Database Schema Enhancement (`server/src/persistence/db/schema.ts`)**:
   - Add `passwordHash: text('password_hash')` to `users` table (nullable to preserve seeded test users).
   - Drizzle kit generate & migrate (`npm run db:generate`, `npm run db:migrate`).
2. **Security & Session Services (`server/src/services/`)**:
   - `auth.service.ts`: Cryptographically secure password hashing and verification using Node.js built-in `crypto.scrypt` (salt + derived key) with zero external dependencies.
   - `token.service.ts`: Stateless signed HMAC-SHA256 session token generation and verification with expiry timestamp.
3. **Authentication API Endpoints (`server/src/api/routes/auth.routes.ts`)**:
   - `POST /api/auth/register`: Create new user with hashed password; return session token and user profile.
   - `POST /api/auth/login`: Validate credentials; return session token and user profile.
   - `POST /api/auth/logout`: Invalidate / client-side session clearance.
   - `GET /api/auth/me`: Return authenticated profile.
   - Update `auth.middleware.ts` to inspect `Authorization: Bearer <token>` while preserving `x-user-id` header for benchmark test suites.
4. **Commerce & Storefront API Endpoints (`server/src/api/routes/order.routes.ts`)**:
   - `GET /api/products`: List available catalog products with pricing.
   - `GET /api/orders`: List orders belonging to the authenticated user.
   - `POST /api/orders`: Place a real order for catalog products; automatically creates order, order items, captured payment, and initial tracking shipment.
5. **Frontend User Authentication & Storefront UI (`client/src/`)**:
   - Auth modal/drawer: Clean tabs for "Sign In" and "Create Account" with error handling.
   - Storefront modal/drawer: Browse products with "Buy / Place Order" button.
   - Order history pill: View placed orders with a 1-click "Ask Agent About This Order" action.
   - Client auth state: Token stored in `localStorage` with reactive `useAuth()` hook.
6. **Testing & Quality Assurance**:
   - Server integration tests for registration, login, logout, order creation, and agent resolution.
   - Client component tests for Auth modal, Storefront modal, and session switching.
   - Zero regression across all 661 existing tests and 14 REFERENCE evaluation scenarios.

### Scope OUT:
- Third-party OAuth providers (Google / GitHub) — self-contained local authentication is prioritized.
- Real external payment processing (Stripe / PayPal) — payments are captured internally in Postgres.
- Splitting `server/src/persistence/db/schema.ts` (violates hard rule).

## 4. Open Decisions This Phase Must Resolve
### OD-21a: Password Hashing & Security Service
- **Options**:
  - *Option A (Recommended)*: Use Node.js standard `crypto.scrypt` with random 16-byte salt and constant-time `crypto.timingSafeEqual`. Requires ZERO external packages, avoids `node-gyp` native build issues on Windows, and provides cryptographic security.
  - *Option B*: Install `bcrypt` or `argon2`. Introduces binary dependencies and potential native compile friction.
- **Recommendation**: Adopt **Option A**.

### OD-21b: Session Token Format & Transport
- **Options**:
  - *Option A (Recommended)*: Signed Bearer token (`Authorization: Bearer <token>`) created via HMAC-SHA256 in `token.service.ts`. `auth.middleware.ts` prioritizes `Bearer <token>` and falls back to `x-user-id` header (preserving existing evaluation runners).
  - *Option B*: HTTP-only cookies only. Can complicate cross-port localhost CORS in development.
- **Recommendation**: Adopt **Option A**.

### OD-21c: Order & Shipment Initialization on Checkout
- **Options**:
  - *Option A (Recommended)*: When a user places an order via `POST /api/orders`, automatically create:
    1. `orders` row (`status: 'paid'`).
    2. `order_items` rows for each item.
    3. `payments` row (`status: 'captured'`).
    4. `shipments` row (`status: 'in_transit'` with simulated carrier and tracking number).
    This immediately empowers the customer to ask the agents to track their shipment, request returns, or check billing without requiring manual ops intervention.
  - *Option B*: Create order only with `status: 'pending'`, requiring separate manual fulfillment endpoints.
- **Recommendation**: Adopt **Option A**.

## 5. Ordered Steps

### Step 1: Database Schema Enhancement & Migration (`server/`)
- **Files touched**:
  - `server/src/persistence/db/schema.ts`: Add `passwordHash: text('password_hash')` to `users`.
  - Migration generated and applied (`npm run db:generate`, `npm run db:migrate`).
- **Protected files affected**: None (`schema.ts` is the single source of truth; edit approved via this plan).
- **Failure cases**: Ensure existing seed users without `passwordHash` query cleanly.

### Step 2: Auth & Token Services with REST Endpoints (`server/`)
- **Files touched**:
  - `server/src/services/auth.service.ts`: `hashPassword()`, `verifyPassword()`.
  - `server/src/services/token.service.ts`: `createToken()`, `verifyToken()`.
  - `server/src/api/routes/auth.routes.ts`: `register`, `login`, `logout`, `me` endpoints.
  - `server/src/api/middleware/auth.middleware.ts`: Add Bearer token resolution.
  - `server/src/api/auth.test.ts`: Test register, login, invalid credentials, token verification.
- **Protected files affected**: None.

### Step 3: Storefront & Live Order Placement Endpoints (`server/`)
- **Files touched**:
  - `server/src/api/routes/order.routes.ts`: `GET /api/products`, `GET /api/orders`, `POST /api/orders`.
  - `server/src/persistence/repositories/order.repository.ts`: Helpers for placing orders.
  - `server/src/api/order-placement.test.ts`: Test product listing and multi-item order placement.
- **Protected files affected**: None.

### Step 4: Frontend Authentication, Storefront UI & Real User Chat (`client/`)
- **Files touched**:
  - `client/src/context/auth-context.tsx`: `AuthProvider`, `useAuth()` hook managing token and active user.
  - `client/src/components/auth/auth-modal.tsx`: Sign In / Register dialog.
  - `client/src/components/store/storefront-modal.tsx`: Product list and "Order Now" action.
  - `client/src/components/sidebar/conversation-sidebar.tsx`: Show authenticated user profile, logout button, and "Store" button.
  - `client/src/app/page.tsx`: Bind chat directly to authenticated user ID.
  - Tests in `client/src/components/auth/` and `client/src/components/store/`.
- **Protected files affected**: None.

### Step 5: Full Verification, Documentation & System Closeout
- **Files touched**:
  - `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN-DECISIONS.md`.
- **Run verification**: `npm run lint`, `npm run typecheck`, `npm test` in both workspaces.

## 6. Functional Requirements
- A visitor can register with email, name, default address, and password.
- A registered user can log in with their email and password and receive an authenticated session.
- A logged-in user can log out, which clears the session and resets the chat transcript.
- A logged-in user can browse products and place an order, receiving an order ID.
- The user can type into the chat (e.g. "Where is order <orderId>?") and the agent tracks their real order.
- Existing benchmark scenarios and test suites using `x-user-id` continue functioning with 100% compatibility.

## 7. Non-Functional Requirements
- Passwords must be hashed using salt + scrypt; plaintext passwords must never be stored or logged.
- Zero extra external runtime dependencies installed.
- Maintain 100% test pass rate across baseline tests.

## 8. Acceptance Criteria
- Unit tests pass for password hashing and token validation.
- Integration tests pass for `/api/auth` and `/api/orders`.
- Component tests pass for frontend auth modal and storefront.
- End-to-end user journey succeeds: Register -> Place Order -> Ask Agent in Chat -> Resolved.

## 9. Risks and Stop Triggers
- Any failure in database migration -> Stop and report.
- Any regression in the 14 reference evaluation scenarios -> Stop and inspect.

## 10. Docs to Update on Completion
- `docs/STATUS.md`
- `docs/ROADMAP.md` (mark Phase 21 complete)
- `docs/DECISIONS.md` (record OD-21a, OD-21b, OD-21c)
- `docs/OPEN-DECISIONS.md` (resolve OD-21)

## 11. Execution Status
Phase 21 executed and verified on branch `phase/21-real-user-auth-and-storefront` on 2026-11-07.
- Database migration applied (`0007_milky_talkback.sql`) adding `passwordHash` to `users`.
- `auth.service.ts` (crypto.scrypt + salt) and `token.service.ts` (stateless HMAC-SHA256 Bearer tokens).
- REST API routes mounted: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/products`, `/api/orders`.
- Client `AuthProvider`, `useAuth()`, `AuthModal`, `StorefrontModal`, and sidebar integration.
- Test suites: Server 584 passing (67 files), Client 112 passing (23 files) = 696 total tests passing (0 regressions).


