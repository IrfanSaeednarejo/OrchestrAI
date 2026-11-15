# Phase 17 Manual Verification Runbook

This runbook guides manual end-to-end verification of the OrchestrAI customer chat frontend (`client/`) with the backend API (`server/`) across reference scenarios 1, 3, and 5.

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

### Scenario 1: Order Status Query (Alice Johnson)
*Goal: Verify specialist routing, live streaming, safe markdown rendering, and order tracking.*

1. **Identity Setup**: In the bottom sidebar, select `Alice Johnson (alice@example.com)` from the demo identity dropdown.
2. **Observe**: The sidebar header updates to active user `alice@example.com`. Conversation list loads.
3. **Action**: In the chat input, type:
   ```text
   Where is my recent order?
   ```
   Press Enter or click the Send button.
4. **Expected Behaviors**:
   - The input is immediately disabled during streaming.
   - Live node progress pill shows `Working: router...` then `Working: order tracking...`.
   - The assistant stream chunks stream onto the screen with markdown formatting.
   - The top header specialist badge displays `Order Tracking Specialist`.
   - The assistant lists Alice's recent orders with status.
   - Once streaming completes, the message input re-enables.
   - The new conversation appears in the left sidebar list.

---

### Scenario 3: Duplicate Payment / Refund Inquiry (Charlie Brown)
*Goal: Verify multi-agent handoffs, handoff counter badge, and workflow status.*

1. **Identity Setup**: In the bottom sidebar, switch identity to `Charlie Brown (charlie@example.com)`.
2. **Observe**: The conversation list clears and resets to Charlie's conversations.
3. **Action**: Click `+ New Chat`, then send:
   ```text
   I noticed a duplicate charge on my credit card for my recent order. Can I get a refund?
   ```
4. **Expected Behaviors**:
   - The router classifies the financial intent and routes to `Payments & Billing Specialist` or `Refunds Specialist`.
   - The top header reflects the active specialist badge and shows `Handoffs: 1` (or more).
   - Turn resolves cleanly with turn status `Turn Resolved` or `ACTIVE`.

---

### Scenario 5: Account Access & OTP Verification (Alice Johnson)
*Goal: Verify full verification banner, dev OTP helper, cosmetic OTP masking, and secure state handling.*

1. **Identity Setup**: Switch back to `Alice Johnson (alice@example.com)`.
2. **Action**: Start a new chat and submit:
   ```text
   I need to change the email and primary phone number on my account.
   ```
3. **Expected Behaviors**:
   - The router assigns `Account Access & Security Specialist`.
   - The specialist detects an account mutation and initiates full identity verification.
   - An amber banner appears at the bottom of the feed:
     > **Verification Required**: Identity verification required. Please follow the assistant's instructions.
     > *Please enter your 6-digit verification code below.*
   - Since `NEXT_PUBLIC_ENABLE_DEMO_CODE=true` is enabled, a dev helper appears:
     - Click **Peek Dev OTP**.
     - The Redis-stored OTP code (e.g., `849201`) is displayed with a **Copy / Use** button.
4. **Submit Code**:
   - Enter the 6-digit numeric code into the chat input and press Enter.
5. **Cosmetic Masking Assertion**:
   - Look at the user's chat bubble: the text is cosmetically replaced with `••••••`.
   - Inspect network request: the raw 6-digit code was sent over the wire to the graph.
   - The assistant verifies the code and confirms successful authentication.
   - The amber verification banner disappears.

---

## 3. Security & Boundary Checks

1. **HTML Injection & XSS**:
   - Send: `<script>alert('xss')</script> **bold** <img src=x onerror=alert(1)>`.
   - Verify: No scripts execute. HTML tags are treated as plain text or stripped. Markdown formatting renders cleanly.
2. **Ownership Isolation**:
   - Open two browser tabs: Tab A as Alice, Tab B as Bob.
   - Verify Bob's sidebar does not list Alice's conversations.
   - Attempting to directly fetch `/api/conversations/:aliceConvId` with Bob's `x-user-id` returns `403 Forbidden`.

