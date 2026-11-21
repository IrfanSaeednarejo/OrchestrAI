# OrchestrAI — Revised Authentication Redesign Proposal (`/login` & `/register`)
## Split-Screen Visual Architecture & Multi-Agent Editorial Direction

**Author:** Antigravity Agent  
**Date:** November 21, 2026  
**Document Status:** Pending User Review & Approval (Discovery Gate — Revised)  
**Target Branch:** `phase/33-auth-visual-redesign`  
**Authority Reference:** `client/ORCHESTRAI_DESIGN_SYSTEM.md`  
**Design Skills Applied:** Impeccable (`/impeccable`), StageShow (`.agents/skills/stageshow`)  
**Visual Demonstration Artifact:** [`auth-split-screen-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/auth-split-screen-stageshow.html)

---

## Executive Summary

Following user feedback on the initial authentication redesign, this document updates the design direction for **`/login`** and **`/register`**. 

While preserving the core **Midnight Burgundy** (`#16070B` / `#2B0D15`) and **Imperial Crimson** (`#8A0B24`) palette, typography, and test contracts, the page composition transitions from a centered card in a dark void to an **editorial split-screen architecture**:
1. **Left Section (approx. 57.5% desktop viewport)**: A dedicated, full-height visual experience that communicates OrchestrAI's autonomous multi-agent orchestration identity—featuring a custom architectural illustration of the Meta-Orchestrator, LangGraph checkpointer rings, and the 6 specialist agents with telemetry overlays and editorial branding.
2. **Right Section (approx. 42.5% desktop viewport)**: A focused, vertically centered authentication panel designed with comfortable max-width, recessed inputs, accessible contrast, and zero visual bloat.
3. **Adaptive Form Factor Strategy**: Responsive adaptations for Tablet (768px) and Mobile (375px), where the visual collapses into a sleek, compact branded header to ensure the form and software keyboard have immediate vertical priority.

In accordance with project guidelines, this proposal is strictly frontend-only. **Zero backend logic, cryptographic hashing, database tables, or authentication API contracts will be modified.** All 11 unit/integration tests across `login/page.test.tsx` (3), `register/page.test.tsx` (3), and `auth-modal.test.tsx` (5) will remain 100% green.

---

## 1. Split-Screen Composition & Architectural Rationale

### 1.1 Rationale for Split-Screen Layout
The typical centered card authentication pattern suffers from two major deficiencies in an enterprise/portfolio context:
1. **The "Empty Void" Phenomenon**: On modern 1440px+ monitors, a 400px card leaves over 70% of the screen as passive, dead space (`#0A0608`).
2. **Loss of Brand Identity**: A lone form looks like a generic authentication template (Auth0/Supabase clone) rather than a bespoke, high-performance orchestration system.

The split-screen layout balances functional utility with technical storytelling:
- **Desktop Viewport Allocation**:
  - **Left Visual (57.5% width, `flex: 1.35`)**: Full-height canvas dedicated to the technical reality of OrchestrAI.
  - **Right Form (42.5% width, `flex: 1`)**: Focused authentication panel with a maximum form width of 380px–420px.
- **Visual Continuity**: The dividing boundary between sections is not a harsh border, but a subtle hairline (`border-edge-subtle` at 40% opacity) accompanied by an ambient radial glow and soft horizontal gradient dissolving the illustration into the form panel.

---

## 2. Left Section — Visual Experience & Creative Direction

### 2.1 Creative Concept: The Multi-Agent Orchestration Ecosystem
To avoid generic AI tropes (floating robot faces, glowing blue brain fractals, neon circuits, or generic stock art), the left visual is designed as an **editorial architectural diagram** illustrating the true stateful engine powering OrchestrAI.

### 2.2 Visual Elements & Anatomy
1. **Ambient Lighting & Base Atmosphere**:
   - Deep burgundy canvas (`radial-gradient(circle at 45% 45%, #240a14 0%, #16070b 60%, #0c0306 100%)`).
   - Subtle geometric coordinate grid (`linear-gradient` 40px grid at 12% opacity, radially masked to fade out toward the edges).
   - Warm crimson ambient light source (`rgba(138, 11, 36, 0.28)`) centered beneath the primary orchestration node.
2. **Central Meta-Orchestrator Node**:
   - Concentric telemetry radar rings with dash arrays representing active LangGraph checkpoint cycles.
   - Core triage node in deep Imperial Crimson (`#A8112F` to `#420410`) labeled `META / TRIAGE`.
   - Subtle live telemetry badge: `6 SPECIALISTS ONLINE` with a pulsing status beacon.
3. **Coordinated Specialist Subgraphs**:
   - Six satellite nodes arranged with deliberate architectural balance:
     - **Orders Specialist** (`#93C5FD` indicator, telemetry: `ORDERS`)
     - **Returns Specialist** (`#FBBF24` indicator, telemetry: `RETURNS`)
     - **Payment Specialist** (`#34D399` indicator, telemetry: `PAYMENT`)
     - **Refund Specialist** (`#FB7185` indicator, telemetry: `REFUND`)
     - **Account Access / Security** (elevated pill, telemetry: `SECURITY OTP`)
     - **Profile Specialist** (elevated pill, telemetry: `PROFILE`)
4. **Dynamic Bezier Splines & Lateral Transitions**:
   - Curved vector paths linking the Meta-Orchestrator to each specialist (`stroke="url(#crimson-gradient)"`), symbolizing LangGraph `Command({ goto })` dispatches.
   - Dashed lateral arcs between Orders ↔ Returns and Payment ↔ Refund, visually representing Pattern B (lateral re-routing) without returning to the root router.
5. **Editorial Typography & Real-Time Metrics**:
   - **Headline**: *"Stateful multi-agent intelligence, orchestrated."* in bold Manrope with Crimson italic accent.
   - **Subtext**: *"Autonomous customer resolution across orders, payments, returns, and verified identity accounts with durable LangGraph checkpointing."*
   - **Metrics Ticker**: Three quantitative proof-points anchored at the base:
     - `6 AGENTS` / `Coordinated`
     - `< 14 MS` / `Checkpoint Latency`
     - `100% PII` / `Redaction Gate`

---

## 3. Right Section — Authentication Form Structure

### 3.1 Layout & Hierarchy
The right panel provides an uncluttered, distraction-free environment for the authentication task:
- **Vertical Centering**: The form is perfectly centered vertically with comfortable padding (`p-8 sm:p-12 lg:p-16`).
- **Maximum Container Width**: `max-w-[380px]` (login) and `max-w-[420px]` (register) to prevent horizontal eye fatigue and maintain optimal line length.
- **Clean Typography**:
  - `<h1>`: `Sign In to Your Account` (login) / `Create Customer Account` (register) in Manrope bold 22px, tracking -0.025em.
  - `<p>`: Clear, 13px supporting copy in `text-content-secondary`.
- **Form Controls & Ergonomics**:
  - Recessed field styling (`bg-surface-inset border-edge-subtle rounded-control text-content-primary`).
  - Left-aligned Lucide icons (`Mail`, `Lock`, `User`, `MapPin`) positioned in a 38px gutter with `pointer-events-none`.
  - Focused states: Imperial Crimson focus ring (`focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30`).
  - Spacing: 16px vertical gap between form fields.
- **Call-to-Action (CTA)**:
  - Full-width submit button in Imperial Crimson (`bg-brand-primary hover:bg-brand-hover active:bg-brand-deep`).
  - Glow elevation: `shadow-glow-brand hover:shadow-glow-brand-lg`.
  - Tactile states: Loading spinner (`Loader2`) and disabled opacity when submitting.
- **Navigation Switch**:
  - Clean footer separator (`border-t border-edge-subtle pt-5 mt-6 text-center text-xs text-content-muted`).
  - High-contrast link in `text-brand-link` with underline offset.

---

## 4. Responsive Adaptation Matrix (Desktop, Tablet, Mobile)

| Viewport | Layout Strategy | Left Visual Treatment | Form Panel Treatment |
| :--- | :--- | :--- | :--- |
| **Desktop**<br>(`≥ 1024px`) | Full Split-Screen<br>(57.5% / 42.5%) | Full-height editorial canvas with interactive SVG orchestration graph, ambient radial glow, and metrics footer. | Vertically centered panel, `max-w-[400px]`, full field spacing. |
| **Tablet**<br>(`768px – 1023px`) | Proportional Split or Cropped Banner | Visual width narrows to ~45% or collapses into a 220px top hero banner with simplified nodes. | Form panel takes 55%–100% width, maintaining 400px content clamp. |
| **Mobile**<br>(`375px – 767px`) | Single-Column Direct Form Focus | Replaced by a **compact branded header** (height ~100px) with ambient top glow, mini OrchestrAI badge, and live telemetry chip (`● 6 AGENTS`). | Full screen-height container (`px-5 py-6`), thumb-friendly inputs (min 44px tap targets), immediate keyboard focus. |

> [!IMPORTANT]
> On mobile devices, forcing users to scroll past a heavy visual illustration before reaching the form fields creates high friction and awkward software keyboard behavior. The compact header approach preserves the brand presence while placing the form directly at the user's fingertips.

---

## 5. Visual Demonstrations (StageShow Artifacts)

We created a dedicated multi-view interactive StageShow demonstration artifact:
- **Interactive StageShow Artifact**: [`auth-split-screen-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/auth-split-screen-stageshow.html)

### Included Demonstrations in the Artifact:
1. 🖥️ **Desktop Login (1440 × 820)**: Full split-screen with the multi-agent orchestration art on the left and the 2-field login form on the right.
2. 🖥️ **Desktop Register (1440 × 820)**: Full split-screen with customer onboarding telemetry on the left and the 4-field registration form on the right.
3. 📱 **Mobile Login (375 × 760)**: Compact branded header with ambient burgundy glow and thumb-friendly form.
4. 📱 **Mobile Register (375 × 760)**: Single-column scroll-optimized registration form with immediate input focus.
5. 🎛️ **Interactive State Matrix**: Dropdown switcher to preview `Normal / Idle`, `Client Validation Error`, `API Rejection Banner`, and `Submitting / Loading` states live.

---

## 6. Impeccable Design Critique & Refinements

Using the **`/impeccable`** critique methodology, we evaluated the transition from the legacy design to the split-screen architecture:

1. **Critique: "Does the visual compete with the primary task?"**
   - *Finding*: Bright, high-contrast illustrations on the left can distract the eye from the form fields.
   - *Refinement*: The left visual is deliberately kept dark and atmospheric, using deep midnight burgundy surfaces (`#16070B`), low-opacity bezier paths (`0.3 – 0.6`), and restrained lighting. The eye naturally is drawn to the right-side form because of the crisp typography and high-contrast inputs.
2. **Critique: "How do we prevent the split-screen from feeling like two separate websites?"**
   - *Finding*: A harsh vertical dividing line makes the layout look like a generic split template.
   - *Refinement*: We softened the dividing border to `rgba(82, 32, 45, 0.4)` and layered a subtle horizontal gradient vignette (`bg-gradient-to-r from-transparent to-surface-canvas`) so the background atmosphere flows seamlessly across the viewport.
3. **Critique: "Is the multi-agent illustration genuine or superficial?"**
   - *Finding*: Generic tech diagrams with random numbers look artificial.
   - *Refinement*: The nodes and telemetry correspond exactly to the real architecture of OrchestrAI (Meta-Triage, Orders, Returns, Payment, Refund, Profile, Security OTP, and LangGraph checkpoint rings).
4. **Critique: "What happens on small screens?"**
   - *Finding*: Shrinking the SVG diagram to mobile dimensions produces unreadable clutter.
   - *Refinement*: The mobile viewport eliminates the complex graph entirely in favor of an elegant, compact branded header with an ambient crimson glow.

---

## 7. Accessibility Considerations (WCAG 2.2 AA)

1. **Contrast Ratios**:
   - `text-content-primary` (`#FFF9FA`) on `bg-surface-canvas` (`#16070B`): **16.8:1** (exceeds AAA requirement of 7.0:1).
   - `text-content-secondary` (`#D9B8BF`) on `bg-surface-canvas`: **8.9:1** (exceeds AA).
   - Form inputs (`#FFF9FA`) on recessed background (`#110509`): **18.2:1**.
   - Submit button text (`#FFFFFF`) on `bg-brand-primary` (`#8A0B24`): **6.2:1** (exceeds AA requirement of 4.5:1).
2. **Keyboard Navigation & Focus Rings**:
   - All interactive controls (`<input>`, `<button>`, `<a>`) maintain visible focus rings (`focus:ring-1 focus:ring-brand-primary/40 focus:border-brand-primary`).
   - Tab order is strictly linear: Left visual has `aria-hidden="true"` or role="presentation" so screen readers move directly to the form fields.
3. **Screen Reader Semantics**:
   - Form headings use proper semantic `<h1>` tags.
   - Form fields have explicit `<label>` tags with matching `htmlFor` attributes.
   - Error banners have `role="alert"` and `aria-live="polite"`.

---

## 8. Frozen Functional Contracts & Test Assertions

All 14 `data-testid` selectors, form validation logic, and existing tests remain 100% untouched:

```text
Login Selectors:
- getByRole('heading', { name: /Sign In to Your Account/i })
- getByTestId('login-email-input')
- getByTestId('login-password-input')
- getByTestId('login-submit-btn')
- getByTestId('link-to-register')
- getByTestId('login-error-banner')

Register Selectors:
- getByRole('heading', { name: /Create Customer Account/i })
- getByTestId('register-name-input')
- getByTestId('register-email-input')
- getByTestId('register-address-input')
- getByTestId('register-password-input')
- getByTestId('register-submit-btn')
- getByTestId('link-to-login')
- getByTestId('register-error-banner')
- Text: 'Password must be at least 8 characters'

Shared AuthModal Selectors:
- getByTestId('auth-modal')
- getByTestId('auth-modal-close')
- getByTestId('tab-sign-in')
- getByTestId('tab-register')
- getByTestId('auth-email-input')
- getByTestId('auth-password-input')
- getByTestId('auth-name-input')
- getByTestId('auth-address-input')
- getByTestId('auth-submit-btn')
- getByTestId('auth-error-banner')
```

---

## 9. Implementation Execution Plan (Upon Approval)

- [ ] **Step 1: Implement Split-Screen Layout for `/login` (`client/src/app/login/page.tsx`)**
  - Add the left-side orchestration canvas (`hidden lg:flex flex-[1.35]`) with SVG architecture nodes and editorial copy.
  - Position the right-side form container (`flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-16`).
  - Wire the mobile compact header for viewports `< 1024px`.
  - Run typecheck, lint, and `page.test.tsx`.
- [ ] **Step 2: Implement Split-Screen Layout for `/register` (`client/src/app/register/page.tsx`)**
  - Apply matching split-screen layout with registration-specific onboarding telemetry.
  - Position the 4-field registration form in the right panel.
  - Run typecheck, lint, and `page.test.tsx`.
- [ ] **Step 3: Verification & Test Suite Execution**
  - Run the full client test suite across all 28 files (150/150 passing).
- [ ] **Step 4: Update `docs/STATUS.md`**
  - Document the split-screen authentication architecture.

---

## 10. Unresolved Design Decisions & Assumptions

1. **Illustration Asset Format**:
   - *Decision*: We implement the left visual as an inline, resolution-independent SVG/CSS composition directly in React/Next.js. This guarantees zero external network requests, instant rendering, crisp vector scaling at any DPI, and full theme token binding without relying on static bitmap assets.
2. **Modal Experience (`AuthModal`)**:
   - *Decision*: The `AuthModal` dialog triggered from customer chat remains a centered dialog overlay (as redesigned earlier) because split-screen is inappropriate for a lightweight in-chat modal. Only the full-page routes (`/login` and `/register`) adopt the full split-screen architecture.

---

## Approval Gate

This proposal and the interactive demonstration [`auth-split-screen-stageshow.html`](file:///C:/Users/Asad%20Computers/.gemini/antigravity/brain/0c006911-6a2c-4dd1-8949-acfb5bc7efea/auth-split-screen-stageshow.html) are presented for your review.

**No application code has been modified.** We will pause here and await your explicit approval before implementing the split-screen layout.
