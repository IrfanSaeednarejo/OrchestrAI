# OrchestrAI Client — Frontend Agent Operating Guide

## What this workspace is
The `client/` workspace contains the customer-facing chat frontend for OrchestrAI, built with Next.js 14 (App Router), React 18, TypeScript, and Tailwind CSS. It communicates with the OrchestrAI Express backend (`server/`) via REST and Server-Sent Events (SSE).

## Architectural Boundaries & Principles
1. **Direct Backend API**: All data fetching uses `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`).
2. **No Direct Database Access**: The client never connects to Postgres or Redis directly. All persistence is managed by the backend Express API.
3. **Dual-Mode Communication**:
   - Standard REST: conversation lifecycle (`/api/conversations`), message history (`/api/conversations/:id/messages`), and demo users (`/api/demo-users`).
   - SSE Streaming: message dispatch (`POST /api/conversations/:id/messages` with `Accept: text/event-stream`).

## Strict Security & Rendering Rules
- **Markdown Security (Load-Bearing)**:
  - Raw HTML rendering is strictly prohibited. Never install or use `rehype-raw`.
  - Markdown rendering must sanitize links: block `javascript:` and other executable URI schemes.
  - Links must force `target="_blank"` and `rel="noopener noreferrer"`.
  - Remote images must not be autoloaded; render them as safe links rather than `<img>` tags.
- **User Messages**:
  - Always rendered as plain text, never through the Markdown renderer.
- **OTP Verification Privacy**:
  - User messages matching `/^\d{6}$/` are cosmetically rendered as `••••••` if and only if the immediately preceding assistant message had a non-null `blockedBy`.

## State & Interaction Discipline
- **Synchronous Send Lock**: Double-submission must be prevented synchronously via a React `useRef` guard (`isSendingRef.current`), preventing race conditions before state updates flush.
- **Workflow Status Locks**:
  - `ESCALATED`: permanently locks input (human handoff triggered).
  - `COMPLETED`: turn resolved; input remains open for follow-up turns; status badge displayed.
  - `BLOCKED`: action blocked by verification or requirements; banner and guidance displayed.
- **Specialist Badges**: Unknown or unmapped agent names must be handled gracefully with a neutral fallback badge; never crash on unexpected backend specialist names.

## Development & Test Commands
From `client/`:
- `npm run dev`: launch local development server on port 3000.
- `npm run typecheck`: run TypeScript compiler check (`tsc --noEmit`).
- `npm run lint`: run ESLint check.
- `npm test`: run Vitest component test suite.

