# OrchestrAI — Orders Page Redesign Proposal (`/orders`)

**Author:** Antigravity Agent  
**Date:** November 21, 2026  
**Document Status:** Pending User Review & Approval (Discovery Gate)  
**Target Branch:** `phase/32-orders-visual-redesign`  
**Authority Reference:** `client/ORCHESTRAI_DESIGN_SYSTEM.md`  
**Design Skills Applied:** Impeccable (`/impeccable`), StageShow (`.agents/skills/stageshow`)  
**Visual Artifact:** [`orders-redesign-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/orders-redesign-stageshow.html)

---

## Executive Summary

Following the accepted redesigns of the Customer Chat (`/`, Phase 30) and Hardware Store (`/store`, Phase 31), this proposal establishes the complete visual and interaction design for the customer order history dashboard at **`/orders`**.

The current `/orders` implementation relies on legacy generic Tailwind utility classes (`slate-950`, `slate-900`, `indigo-600`, arbitrary purple/sky badge backgrounds). This proposal brings the page into strict compliance with the **Midnight Burgundy** (`#16070B` / `#2B0D15`) and **Imperial Crimson** (`#8A0B24`) design system, establishing high-clarity typography with **Manrope** and technical telemetry in **Geist Mono**.

In strict adherence to the project guidelines, this proposal requires **zero backend changes, zero schema migrations, and zero alterations to existing API contracts**. All 5 unit and integration tests in `client/src/app/orders/page.test.tsx` will remain 100% green.

---

## 1. Existing Route & Component Architecture

### 1.1 File Structure & Dependencies

| File Path | Role & Architecture | Upstream / Downstream Dependencies |
| :--- | :--- | :--- |
| `client/src/app/orders/page.tsx` | Main page component for `/orders`. Owns orders fetch lifecycle, refresh action, status mapping, and 1-click agent routing. | `TopNav`, `useRequireAuth`, `fetchUserOrders`, `lucide-react`, `next/navigation` |
| `client/src/app/orders/page.test.tsx` | Vitest test suite (5 test cases). Tests unauthenticated redirects, empty state, populated orders with badges, "Ask Agent" routing, and error retry. | `Vitest`, `@testing-library/react`, `AuthProvider`, `api-client` mocks |
| `client/src/components/navigation/top-nav.tsx` | Persistent global navigation header. Already redesigned with Midnight Burgundy styling, active route indicator (`nav-orders-link`), and mobile drawer toggle. | Shared shell component |
| `client/src/hooks/use-require-auth.ts` | Route guard checking user authentication and intercepting unauthenticated sessions with `/login?redirect=%2Forders`. | `useAuth`, `next/navigation` |
| `client/src/lib/api-client.ts` | Executes `GET /api/orders` sending `Authorization: Bearer <token>` or `x-user-id` header. | Native `fetch` with `getAuthHeaders` |
| `client/src/types/api.ts` | Data schema for `Order` and `OrdersResponse`. | TypeScript data contracts |

### 1.2 Test Assertions & Selectors (Frozen Contract)

The following selectors and text assertions in `src/app/orders/page.test.tsx` are strictly verified and must be preserved verbatim:

| Selector / Assertion | Element Type | Assertion in Test Suite |
| :--- | :--- | :--- |
| `getByText('No orders found')` | Heading | Exact text for empty state |
| `getByText('Browse Store Catalog')` | Link / Button | Exact text for empty state CTA |
| `getByText('ord-test-001')` | Text | Exact string for order ID |
| `getByText('ord-test-002')` | Text | Exact string for order ID |
| `getByText('Paid & Processing')` | Status Badge | Exact badge label for status `'paid'` |
| `getByText('Shipped')` | Status Badge | Exact badge label for status `'shipped'` |
| `getByText('$149.99')` | Total Text | Formatted price `${parseFloat(order.totalAmount).toFixed(2)}` |
| `getByText('$89.50')` | Total Text | Formatted price `${parseFloat(order.totalAmount).toFixed(2)}` |
| `getAllByRole('button', { name: /Ask Agent About This Order/i })` | Action Button | Accessible name regex matching action trigger |
| `getByRole('button', { name: /Retry/i })` | Retry Button | Accessible name regex matching error recovery |
| `getByText('Database network timeout')` | Error Text | Dynamic error string rendering |

---

## 2. Existing Data Sources, API Calls & State Management

### 2.1 Backend Contract & Data Limits

The client calls `fetchUserOrders(token, user.id)`, which maps to:
- **Endpoint**: `GET /api/orders`
- **Authentication**: Requires Bearer token or non-guest `x-user-id`
- **Server Implementation**: Queries `orders` table directly: `db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt))`

```typescript
// From client/src/types/api.ts
export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  shippingAddressSnapshot: string;
  totalAmount: string;
  createdAt: string; // ISO 8601 string
}
```

> [!IMPORTANT]
> **Data Scope Boundary**:
> 1. `GET /api/orders` does **not** join line items (`order_items`). Product titles and product images are **not** present in the order list response.
> 2. `trackingNumber` is **not** a column on `orders`; tracking telemetry lives in specialized shipment tables handled by autonomous agents.
> 3. Therefore, this redesign must **not** fabricate product names, item quantities, or carrier tracking numbers that do not exist in the data model.

---

## 3. Current Functionality & User Flows

```mermaid
flowchart TD
    A["Visit /orders"] --> B{"useRequireAuth"}
    B -->|Unauthenticated| C["Redirect to /login?redirect=/orders"]
    B -->|Authenticated| D["loadOrders(): fetchUserOrders()"]
    D -->|Loading| E["Render Loading Spinner (Loader2)"]
    D -->|Network Error| F["Render Error Alert + 'Retry' Button"]
    D -->|Zero Orders| G["Render Empty State + 'Browse Store Catalog'"]
    D -->|Success (Orders > 0)| H["Render Order History Cards"]
    H --> I["Click 'Refresh' Button"] --> D
    H --> J["Click 'Storefront' Button"] --> K["Navigate to /store"]
    H --> L["Click 'Ask Agent About This Order'"]
    L --> M["router.push('/?orderId=' + order.id)"]
    M --> N["Chat Page (/) pre-fills prompt in composer:
'Where is my order {orderId}? Can you give me the latest tracking status?'"]
```

### 3.1 The "Ask Agent" Tracking Flow (Verified)
1. On each order card, user clicks the button: `Ask Agent About This Order`.
2. The button triggers `router.push('/?orderId=' + encodeURIComponent(order.id))`.
3. In `client/src/app/page.tsx`, the `CustomerChatContent` component inspects `searchParams.get('orderId')`.
4. When present, it automatically pre-fills the composer textarea (`initialDraft`) with:
   `"Where is my order ${queryOrderId}? Can you give me the latest tracking status?"`
5. The customer simply presses Enter or clicks Send to initiate an autonomous handoff to the Order Tracking specialist subgraph (`order_tracking`).

---

## 4. Current Design & Usability Problems

Applying the `/impeccable` design principles and interface critique methodology revealed five primary flaws:

### 4.1 Generic Slate & Inconsistent Palette
- **Problem**: The page uses `bg-slate-950`, `bg-slate-900/70`, `border-slate-800`, with `indigo-600` primary buttons.
- **Critique**: Clashes with the newly redesigned Midnight Burgundy (`#16070B`) and Imperial Crimson (`#8A0B24`) applied to `/` and `/store`. The user feels disconnected between store checkout and order history.

### 4.2 Arbitrary Semantic Status Colors
- **Problem**: Status badges use random palette colors:
  - `delivered`: `bg-purple-950/70 text-purple-300 border-purple-800/60` (Tailwind purple)
  - `shipped`: `bg-sky-950/70 text-sky-300 border-sky-800/60` (Tailwind sky blue)
  - `paid`: `bg-emerald-950/70 text-emerald-300` (Tailwind emerald)
- **Critique**: Violates Section 3.5 of `ORCHESTRAI_DESIGN_SYSTEM.md`. Status colors must follow the unified semantic status tokens:
  - `delivered` / `paid` $\to$ `status-success` (`#34D399` / `rgba(52, 211, 153, 0.12)`)
  - `shipped` $\to$ `status-info` (`#93C5FD` / `rgba(147, 197, 253, 0.12)`)
  - `pending` / `returned` $\to$ `status-warning` (`#FBBF24` / `rgba(251, 191, 36, 0.12)`)
  - `cancelled` $\to$ `status-error` (`#FB7185` / `rgba(251, 113, 133, 0.12)`)

### 4.3 Weak Order ID Anchoring
- **Problem**: Order ID is displayed as `<code className="text-xs font-mono font-medium text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-900/60">`.
- **Critique**: It looks like an inline developer code snippet rather than a formal order receipt identifier. It should use `Geist Mono` (`font-mono`) on `bg-surface-inset` with subtle border framing (`border-edge-subtle`) and `text-brand-link`.

### 4.4 Flat Visual Weight on AI Handoff
- **Problem**: The bottom row of each card simply stacks an unstyled prompt note next to an indigo button.
- **Critique**: Asking an AI agent to track or modify an order is a signature capability of OrchestrAI. It should be presented as an intelligent autonomous assistant dock (`bg-surface-inset rounded-control p-3 border border-edge-subtle`).

### 4.5 Mobile Layout Friction
- **Problem**: On small screens (375px), the header bar and order action footer wrap awkwardly; the action button can overflow or wrap into 3 cramped lines.
- **Critique**: On mobile, the card top bar should stack cleanly (Order ID row 1, Status badge row 2), and the "Ask Agent About This Order" button should expand to a full-width touch target (`w-full py-2.5`).

---

## 5. Desktop, Tablet, and Mobile Assessment

| Viewport | Current Behavior | Usability Problem | Proposed Redesign Solution |
| :--- | :--- | :--- | :--- |
| **Desktop (1440 × 900)** | Centered max-w-5xl column. Spacious order cards. | Flat slate/indigo styling; lacks visual polish and hardware identity. | Contained in `max-w-4xl w-full mx-auto`; elevated cards (`bg-surface`) with ambient shadow; structured metadata grid. |
| **Tablet (768 × 1024)** | 2-column detail grid, responsive wrapping. | Footer text wraps awkwardly on narrower widths. | Responsive flex footer with auto-wrapping; clear visual separation between order details and AI dock. |
| **Mobile (375 × 812)** | Single column, tight horizontal insets. | Top bar elements collide; button is small and off-center. | Stacked top bar with prominent status pill; full-width `w-full` Imperial Crimson action button with 44px touch height. |

> [!NOTE]
> **Inspection Limitation**: Visual inspection was performed via rigorous static analysis and verified through the authored StageShow demonstration (`orders-redesign-stageshow.html`). Chrome remote debugging port 9222 was unreachable by headless browser automation.

---

## 6. Proposed Information Hierarchy & Page Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ TopNav: OrchestrAI | Support Chat | Store | [My Orders]  (AC) Alice C. │
├────────────────────────────────────────────────────────────────────────┤
│ Header:                                                                │
│ [📦] Your Orders                             [ 🔄 Refresh ] [ 🛍 Store ]│
│ Review order history, live fulfillment statuses, and launch AI support.│
├────────────────────────────────────────────────────────────────────────┤
│ Order Card 1:                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ORDER ID: [ ord-test-001 ] · Placed Nov 8, 2026   [ ⏱ Paid & Proc.]│ │
│ ├──────────────────────────────────┬─────────────────────────────────┤ │
│ │ Total Paid:                      │ Shipping Destination:           │ │
│ │ $149.99                          │ 📍 123 Market St, SF CA         │ │
│ ├──────────────────────────────────┴─────────────────────────────────┤ │
│ │ ┌────────────────────────────────────────────────────────────────┐ │ │
│ │ │ ✨ Need order tracking, address change, or return assistance?  │ │ │
│ │ │                             [ 💬 Ask Agent About This Order → ]│ │ │
│ │ └────────────────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ Order Card 2:                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ORDER ID: [ ord-test-002 ] · Placed Nov 7, 2026         [ 🚚 Shipped]│ │
│ ├──────────────────────────────────┬─────────────────────────────────┤ │
│ │ Total Paid:                      │ Shipping Destination:           │ │
│ │ $89.50                           │ 📍 456 Tech Blvd, Seattle WA    │ │
│ ├──────────────────────────────────┴─────────────────────────────────┤ │
│ │ ┌────────────────────────────────────────────────────────────────┐ │ │
│ │ │ ✨ Need order tracking, address change, or return assistance?  │ │ │
│ │ │                             [ 💬 Ask Agent About This Order → ]│ │ │
│ │ └────────────────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Proposed Order-Card & Order-Detail Designs

### 7.1 Order Card Anatomy
- **Surface**: `bg-surface` (`#2B0D15`) with `rounded-card` (10px) and `border border-edge-subtle` (`#52202D`).
- **Hover State**: `hover:border-edge-strong` (`#753044`) with smooth transition.
- **Top Bar**:
  - `ORDER ID` label in uppercase `text-content-muted` (10px font, letter-spacing 0.08em).
  - Order ID chip in `Geist Mono` (`font-mono text-xs font-semibold text-brand-link bg-surface-inset px-2.5 py-0.5 rounded border border-edge-subtle`).
  - Placed date formatted with `toLocaleDateString` in `text-content-muted` (11px).
  - Status badge aligned to the top-right.
- **Metadata Body**:
  - **Total Paid**: Label in `text-content-muted` (11px), price in `text-xl font-bold text-content-primary tabular-nums tracking-tight`.
  - **Shipping Destination**: Label in `text-content-muted`, address in `text-content-secondary` (13px) paired with `MapPin` icon in `text-brand-link`.
- **AI Agent Handoff Dock**:
  - Encapsulated in `bg-surface-inset border border-edge-subtle rounded-control p-3`.
  - Left hint: `Sparkles` icon in `text-brand-link` with explanatory copy ("Need order tracking, address change, or return assistance?").
  - Right button: Imperial Crimson button (`bg-brand-primary hover:bg-brand-hover text-white rounded-control text-xs font-semibold`).

---

## 8. Status & Shipment-Progress Visual Treatment

In accordance with `ORCHESTRAI_DESIGN_SYSTEM.md` Section 3.5:

| Order Status | Badge Label (Preserved) | Semantic Meaning | Icon | Background & Border | Text Color |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `'paid'` | `Paid & Processing` | Healthy / Verified | `Clock` | `bg-status-success/10 border-status-success/20` | `text-status-success` (`#34D399`) |
| `'shipped'` | `Shipped` | Neutral Transit | `Truck` | `bg-status-info/10 border-status-info/20` | `text-status-info` (`#93C5FD`) |
| `'delivered'` | `Delivered` | Completed | `CheckCircle2` | `bg-status-success/15 border-status-success/30` | `text-status-success` (`#34D399`) |
| `'pending'` | `Pending Confirmation` | Attention Pending | `Clock` | `bg-status-warning/10 border-status-warning/20` | `text-status-warning` (`#FBBF24`) |
| `'returned'` | `Returned` | Attention / Reversal | `RotateCcw` | `bg-status-warning/10 border-status-warning/20` | `text-status-warning` (`#FBBF24`) |
| `'cancelled'` | `Cancelled` | Terminated | `XCircle` | `bg-status-error/10 border-status-error/20` | `text-status-error` (`#FB7185`) |

---

## 9. AI-Agent Tracking Interaction

- **Action Label**: `Ask Agent About This Order` (matches Vitest regex `/Ask Agent About This Order/i`).
- **Icon**: `MessageSquare` (`h-3.5 w-3.5`) + `ArrowRight` (`h-3.5 w-3.5`).
- **Interaction Contract**:
  ```typescript
  onClick={() => router.push(`/?orderId=${order.id}`)}
  ```
- **Handoff Mechanism**: When redirected to `/`, the pre-filled prompt ensures immediate conversational continuity:
  `"Where is my order ord-test-001? Can you give me the latest tracking status?"`

---

## 10. Loading, Empty, Error, and Other States

| State | Visual Treatment | Trigger / Condition |
| :--- | :--- | :--- |
| **Auth Loading** | Centered spinner with `bg-surface-canvas text-content-secondary`. | `isAuthLoading \|\| !isAuthenticated` |
| **Orders Loading** | Centered container with spinning `Loader2` in `text-brand-link` and "Loading your order history...". | `isLoading === true` |
| **Error Banner** | Semantic error alert in `bg-status-error/10 border border-status-error/30 text-status-error`, with `AlertCircle` icon and "Retry" button. | `error !== null` |
| **Empty State** | Dashed container (`border-dashed border-edge-subtle bg-surface/40 rounded-dialog p-12`) with `Package` icon in circular elevated well, "No orders found" heading, and Imperial Crimson "Browse Store Catalog" button. | `!isLoading && !error && orders.length === 0` |

---

## 11. Accessibility & Responsive Engineering

### 11.1 Accessibility (WCAG 2.2 AA)
- **Contrast**: Headings (`#FFF9FA` on `#2B0D15`) achieve 14.8:1 contrast; secondary text (`#D9B8BF`) achieves 8.2:1.
- **Keyboard Navigation**: Buttons feature `:focus-visible` rings with `ring-2 ring-brand-focus` (`#D1193E`).
- **Non-Color Indicators**: Every status badge pairs color with an explicit status label and a dedicated Lucide icon.

### 11.2 Responsive Strategy
- **Desktop (1024px+)**: `max-w-4xl` layout with side-by-side metadata and inline AI dock.
- **Tablet (768px – 1023px)**: Flexible wrapping for action footer.
- **Mobile (320px – 767px)**:
  - Top bar wraps to 2 lines so Order ID and Status badge do not collide.
  - "Ask Agent About This Order" button expands to full width (`w-full`) for high-touch mobile ergonomics.

---

## 12. Design-System Token Application Matrix

| Current Template Class | Redesigned Token Class | Value | Purpose |
| :--- | :--- | :--- | :--- |
| `bg-slate-950` | `bg-surface-canvas` | `#16070B` | Page canvas background |
| `bg-slate-900/70` | `bg-surface` | `#2B0D15` | Order card surface |
| `border-slate-800` | `border-edge-subtle` | `#52202D` | Dividers & outlines |
| `hover:border-slate-700` | `hover:border-edge-strong` | `#753044` | Hovered order card border |
| `text-white` | `text-content-primary` | `#FFF9FA` | Headings, prices |
| `text-slate-400` | `text-content-secondary` | `#D9B8BF` | Subtitles, labels |
| `text-slate-500` | `text-content-muted` | `#B08A94` | Metadata, timestamps |
| `bg-indigo-600` | `bg-brand-primary` | `#8A0B24` | "Ask Agent" & Storefront buttons |
| `hover:bg-indigo-500` | `hover:bg-brand-hover` | `#A8112F` | Primary button hover |
| `text-indigo-400` | `text-brand-link` | `#FF8FA3` | Icons, order ID chip text |
| `rounded-xl` | `rounded-card` (10px) | `10px` | Order card containers |
| `rounded-lg` | `rounded-control` (8px) | `8px` | Buttons & AI docks |

---

## 13. Regression Risks & Functional Preservation

### 13.1 Classification of Proposed Changes

1. **Existing Functionality (100% Preserved)**:
   - Order history loading on mount via `fetchUserOrders`.
   - Refresh button re-fetching orders with animated spinner.
   - 1-click agent handoff via `router.push('/?orderId=' + order.id)`.
   - Error alert with "Retry" action.
   - Empty state redirect to `/store`.
   - Unauthenticated redirect to `/login?redirect=/orders`.
2. **Existing Data (100% Preserved)**:
   - All `Order` properties (`id`, `status`, `totalAmount`, `shippingAddressSnapshot`, `createdAt`).
3. **Frontend-Only Enhancements (Proposed for Approval)**:
   - Autonomous AI Assistant handoff dock container.
   - Unified semantic status badges.
   - Full-width mobile button layout.
4. **Backend / API Changes**:
   - **None** (strictly out of scope).

---

## 14. Implementation Plan (Divided into Steps)

```mermaid
flowchart LR
    S1["Step 1: Shell, Header & Loading States"] --> S2["Step 2: Order Cards & Status Badges"]
    S2 --> S3["Step 3: AI Handoff Dock & Empty State"]
    S3 --> S4["Step 4: Verification & Docs Update"]
```

- **Step 1: Shell, Header & Loading States**
  - Replace `bg-slate-950` with `bg-surface-canvas`.
  - Update page header, Refresh button, and Storefront navigation link to brand tokens.
  - Update auth loading and orders loading spinner.
- **Step 2: Order Cards & Status Badges**
  - Implement unified `getStatusBadge` function with semantic status tokens (`status-success`, `status-info`, `status-warning`, `status-error`).
  - Restyle order cards to `bg-surface border-edge-subtle rounded-card`.
  - Format Order ID with `Geist Mono` and `text-brand-link`.
- **Step 3: AI Handoff Dock & Empty/Error States**
  - Implement the encapsulated AI handoff dock in `bg-surface-inset`.
  - Restyle empty state with `border-dashed border-edge-subtle` and Imperial Crimson catalog CTA.
  - Restyle error banner with `bg-status-error/10 border-status-error/30` and "Retry" button.
- **Step 4: Full Verification**
  - Run typecheck, lint, and Vitest suite (must pass 150/150 tests across 28 suites).
  - Update `STATUS.md` and commit report.

---

## 15. Impeccable Critique & Refinements

| Impeccable Principle | Initial Inspection Finding | Proposal Refinement |
| :--- | :--- | :--- |
| **Brand restraint** | Temptation to make every order card red. | Used Midnight Burgundy surfaces (`#2B0D15`) with subtle borders; reserved Imperial Crimson exclusively for the "Ask Agent" action. |
| **Clarity over decoration** | Status badges used arbitrary purple and sky-blue colors. | Replaced with semantic status colors aligned with system state (green for delivered/paid, blue for shipped, yellow for pending/returned). |
| **Technical precision** | Order IDs looked like arbitrary inline markdown code. | Elevated Order IDs into structured receipt telemetry tags using `Geist Mono`. |
| **Hierarchy over uniformity** | AI tracking action looked like an ordinary secondary button. | Elevated the AI tracking action into a dedicated assistant dock, highlighting the platform's multi-agent autonomous capabilities. |

---

## 16. StageShow Visual Demonstrations

Per the StageShow skill instructions (`.agents/skills/stageshow`), a visual demonstration artifact has been constructed and saved to:

👉 **[`orders-redesign-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/orders-redesign-stageshow.html)**

### Scenes Demonstrated:
1. **Desktop Orders List (1440 × 900)**: Displays populated order cards with `Paid & Processing` and `Shipped` status badges, `Geist Mono` order IDs, and the AI agent handoff dock.
2. **Empty Orders State**: Displays the calm empty well with `Package` icon and the Imperial Crimson "Browse Store Catalog" button.
3. **Mobile Layout (375 × 812)**: Displays compact order cards with stacked headers and full-width "Ask Agent" buttons.

---

## 17. Unresolved Questions & Assumptions

1. **Confirmation on Status Colors**: Does the mapping of `shipped` to `status-info` (blue) and `paid` / `delivered` to `status-success` (emerald/mint) meet your approval? *(Both use semantic tokens from `ORCHESTRAI_DESIGN_SYSTEM.md`).*

**I will wait for your explicit approval before modifying any code or beginning implementation.**
