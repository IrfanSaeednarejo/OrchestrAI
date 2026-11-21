# OrchestrAI --- Permanent UI Design System

**Version:** 1.0\
**Status:** Authoritative frontend design specification\
**Theme:** Dark only\
**Visual direction:** Modern technical, premium SaaS\
**Typography:** Manrope + Geist Mono

------------------------------------------------------------------------

## 1. Purpose and authority

This document defines the permanent visual and interaction system for
the OrchestrAI frontend. It is the source of truth for every redesigned
page, route, layout, and component.

Antigravity MUST follow this specification whenever it audits, designs,
implements, refactors, or adjusts the frontend.

The objective is to make OrchestrAI feel like a modern, technically
sophisticated AI customer-support platform: focused, precise, cohesive,
readable, and professional. The interface should communicate the
capabilities of a multi-agent system without becoming visually noisy or
resembling a generic chatbot template.

This is a frontend redesign only. The existing product behavior and
backend integration must remain intact.

### 1.1 Product context

OrchestrAI is an AI customer-support platform. Customers interact
through a conversational interface, while six specialist agents handle
different support responsibilities. The interface may expose which
specialist is active and may present agent activity, tracing, and
operational information.

The redesign may rethink how these capabilities are presented,
organized, and interacted with visually. It must not change the
underlying agent behavior, orchestration, data, or business rules.

### 1.2 Design principles

All design decisions must follow these principles, in priority order:

1.  **Clarity over decoration.** Every visual element must help users
    understand, navigate, or complete a task.
2.  **Hierarchy over uniformity.** Important actions and information
    must stand out; secondary information must remain secondary.
3.  **Brand restraint.** Crimson is the brand signature, not the
    background color of every component.
4.  **Consistency over one-off styling.** Shared components must look
    and behave consistently across the product.
5.  **Technical precision.** Dense operational information must remain
    structured, scannable, and legible.
6.  **Functional fidelity.** Visual redesign must preserve existing
    product capabilities and data flows.
7.  **Accessibility by default.** Contrast, keyboard access, focus
    states, and non-color status indicators are mandatory.
8.  **Responsive by design.** Components must remain usable across
    supported desktop, tablet, and mobile widths.

------------------------------------------------------------------------

## 2. Brand identity and visual direction

### 2.1 Brand identity

-   **Product name:** OrchestrAI
-   **Brand palette:** Imperial Crimson and Midnight Burgundy
-   **Theme:** Dark only
-   **Visual direction:** Modern technical
-   **Personality:** Precise, capable, calm, intelligent, dependable,
    and professional

Use the product name exactly as `OrchestrAI`. Do not introduce
alternative spellings or casing.

### 2.2 Visual character

The interface should combine: - The information clarity of a developer
tool. - The usability and consistency of a mature SaaS product. - The
restrained visual polish of a premium software interface.

Avoid making the product look like: - A generic ChatGPT clone. - A neon
cyberpunk dashboard. - A gaming interface. - A wall of cards, borders,
gradients, or glowing effects. - A conventional admin template with
arbitrary blue accents.

The result should feel technical through its information architecture,
typography, precision, and interaction design---not through excessive
decoration.

------------------------------------------------------------------------

## 3. Color system

The original OrchestrAI identity uses: - Imperial Crimson: `#8A0B24` -
Deep Ruby: `#68071A` - Midnight Burgundy: `#420410` - White foreground:
`#FFFFFF`

The following expanded palette refines the original colors for
application-wide use. The additional shades are design-system tokens,
not claims about colors extracted from the logo.

### 3.1 Brand tokens

  -----------------------------------------------------------------------
  Token                   HEX                     Intended use
  ----------------------- ----------------------- -----------------------
  `--brand-primary`       `#8A0B24`               Primary brand action
                                                  and selected
                                                  high-priority emphasis

  `--brand-hover`         `#A8112F`               Hover state for primary
                                                  actions

  `--brand-focus`         `#D1193E`               Focus ring and
                                                  high-visibility active
                                                  indicator

  `--brand-mid`           `#68071A`               Secondary brand tone
                                                  and restrained gradient
                                                  transition

  `--brand-deep`          `#420410`               Pressed state or
                                                  deepest brand treatment

  `--brand-link`          `#FF8FA3`               Readable links and
                                                  inline brand emphasis
                                                  on dark surfaces
  -----------------------------------------------------------------------

### 3.2 Background and surface tokens

  -----------------------------------------------------------------------
  Token                   HEX                     Intended use
  ----------------------- ----------------------- -----------------------
  `--bg-canvas`           `#16070B`               Main application canvas

  `--bg-sidebar`          `#20090F`               Sidebar and persistent
                                                  navigation surfaces

  `--bg-surface`          `#2B0D15`               Standard cards, panels,
                                                  and input containers

  `--bg-elevated`         `#36121C`               Menus, popovers,
                                                  dialogs, and elevated
                                                  panels

  `--bg-hover`            `#421724`               Hovered rows, cards,
                                                  and selectable items

  `--bg-inset`            `#110509`               Code areas, recessed
                                                  fields, and inset
                                                  content
  -----------------------------------------------------------------------

Use these surfaces to establish depth. Do not add a border to every
component merely to make it visible.

### 3.3 Text tokens

  -----------------------------------------------------------------------
  Token                   HEX                     Intended use
  ----------------------- ----------------------- -----------------------
  `--text-primary`        `#FFF9FA`               Main headings and
                                                  primary content

  `--text-secondary`      `#D9B8BF`               Descriptions,
                                                  supporting copy, and
                                                  secondary labels

  `--text-muted`          `#B08A94`               Metadata and less
                                                  prominent information

  `--text-disabled`       `#80616A`               Disabled content only;
                                                  never use for essential
                                                  information
  -----------------------------------------------------------------------

Do not use low-contrast text for important instructions, labels, or
controls. Check actual foreground/background contrast rather than
assuming a color is accessible because it appears bright.

### 3.4 Border tokens

  -----------------------------------------------------------------------
  Token                   HEX                     Intended use
  ----------------------- ----------------------- -----------------------
  `--border-subtle`       `#52202D`               Quiet separators and
                                                  low-emphasis outlines

  `--border-strong`       `#753044`               Component boundaries
                                                  that need stronger
                                                  definition

  `--border-focus`        `#D1193E`               Keyboard and input
                                                  focus treatment
  -----------------------------------------------------------------------

Borders should be subtle and purposeful. Prefer tonal surface separation
for ordinary cards and panels. Use stronger borders for selected,
focused, or structurally important elements.

### 3.5 Semantic status colors

Semantic colors communicate system state and are not alternate brand
colors. Use them consistently and sparingly.

  -----------------------------------------------------------------------------------
  State             Foreground        Suggested subtle background   Meaning
  ----------------- ----------------- ----------------------------- -----------------
  Success           `#34D399`         `rgba(52, 211, 153, 0.12)`    Completed,
                                                                    healthy, verified

  Warning           `#FBBF24`         `rgba(251, 191, 36, 0.12)`    Pending,
                                                                    attention
                                                                    required

  Error             `#FB7185`         `rgba(251, 113, 133, 0.12)`   Failed, blocked,
                                                                    invalid

  Information       `#93C5FD`         `rgba(147, 197, 253, 0.12)`   Informational or
                                                                    neutral system
                                                                    guidance

  Active / Brand    `#D1193E`         `rgba(209, 25, 62, 0.12)`     Active brand
                                                                    state or current
                                                                    activity
  -----------------------------------------------------------------------------------

Never communicate status through color alone. Pair color with a label,
icon, shape, or other clear visual cue.

### 3.6 Gradient policy

The brand gradient may be used selectively:

`radial-gradient(circle at center, #8A0B24 0%, #68071A 50%, #420410 100%)`

Appropriate uses: - A restrained brand or authentication focal area. - A
carefully designed empty-state illustration background. - A rare,
high-priority brand moment.

Do not use it as the default background for cards, chat messages,
navigation items, or every agent panel. Avoid large, intense red glows.

### 3.7 Color anti-patterns

-   Do not use generic Tailwind gray, slate, or zinc palettes as the
    default application theme.
-   Do not introduce unrelated blue, purple, or teal accents for primary
    actions or navigation.
-   Semantic status colors are permitted for their defined meanings.
-   Do not use pure black as the default canvas.
-   Do not use crimson text on dark burgundy surfaces when contrast is
    insufficient.
-   Do not use crimson borders on every card.
-   Do not make every button, icon, badge, or active element red.
-   Do not create gradients or glow effects without a clear functional
    or brand purpose.

------------------------------------------------------------------------

## 4. Typography system

### 4.1 Font families

Use exactly two font families across the application:

**Primary UI font: Manrope** - Use for headings, body copy, navigation,
buttons, labels, forms, and general interface text. - Preferred weights:
400, 500, 600, and 700. - Use variable font files where available.

**Technical font: Geist Mono** - Use for execution logs, code, JSON,
identifiers, timestamps where alignment matters, tool names, technical
payloads, and other machine-oriented content. - Preferred weights: 400,
500, and 600.

Do not use generic `sans-serif` or `serif` as the chosen visual design.
A generic system fallback is acceptable only as a technical fallback if
a font fails to load.

Suggested CSS:

``` css
:root {
  --font-sans: "Manrope", sans-serif;
  --font-mono: "Geist Mono", monospace;
}

html,
body {
  font-family: var(--font-sans);
}

code,
pre,
kbd,
samp,
[data-font="mono"] {
  font-family: var(--font-mono);
}
```

Load the fonts locally or through the project's approved font-loading
mechanism. Avoid introducing multiple competing font-loading methods.

### 4.2 Type scale

Use the following desktop scale as the default. Adjust responsively
where needed.

  Role                      Size     Weight   Typical line height
  ------------------- ---------- ---------- ---------------------
  Page title            28--32px        700                   1.2
  Page subtitle         14--15px        400                   1.5
  Section heading       18--20px        600                  1.35
  Card heading          15--16px        600                   1.4
  Body                  14--15px        400                  1.55
  Supporting text       13--14px        400                   1.5
  Labels                12--13px   500--600                   1.4
  Metadata              11--12px        500                   1.4
  Technical content     12--13px   400--500                   1.5

### 4.3 Typography rules

-   Maintain a clear hierarchy between page titles, section headings,
    body text, and metadata.
-   Avoid making all text bold or semibold.
-   Avoid excessive letter spacing.
-   Use uppercase sparingly for compact technical labels, not for every
    heading.
-   Keep paragraph line lengths comfortable.
-   Use tabular numerals for values that need vertical alignment, such
    as durations, counts, and metrics.
-   Do not use Geist Mono for normal paragraphs or long-form explanatory
    text.
-   Do not use multiple font families for decorative variation.

------------------------------------------------------------------------

## 5. Layout, spacing, and geometry

### 5.1 Spacing scale

Use a consistent 4px-based spacing scale:

  Token            Value
  -------------- -------
  `--space-1`        4px
  `--space-2`        8px
  `--space-3`       12px
  `--space-4`       16px
  `--space-5`       20px
  `--space-6`       24px
  `--space-8`       32px
  `--space-10`      40px
  `--space-12`      48px
  `--space-16`      64px

Use spacing consistently. Do not introduce arbitrary values when an
existing token is appropriate.

### 5.2 Corner radius

  Component                             Radius
  --------------------------------- ----------
  Main containers and dialogs             12px
  Cards and panels                    10--12px
  Message surfaces                        10px
  Inputs and buttons                       8px
  Small tags and compact controls       6--8px
  Avatars and status dots             Circular

Avoid excessive pill-shaped controls. Pills are appropriate for compact
status tags or elements whose meaning benefits from a capsule shape, not
as the default shape for every control.

### 5.3 Borders and shadows

-   Prefer subtle borders and tonal surface changes.
-   Use shadows only when they help communicate elevation, such as menus
    and dialogs.
-   Avoid large black shadows, intense red glows, and layered decorative
    shadows.
-   Maintain consistent border thickness, generally 1px.
-   Ensure focus indicators remain visible independently of ordinary
    borders.

### 5.4 Layout rules

-   Use a consistent alignment grid across pages.
-   Maintain predictable content widths and panel spacing.
-   Keep navigation, content, and supporting operational information
    visually distinct.
-   Avoid unnecessary nested cards.
-   Do not compress information to the point that controls become
    difficult to use.
-   Use whitespace to establish grouping and hierarchy.
-   Do not make every section full-width if its content benefits from a
    narrower reading width.

------------------------------------------------------------------------

## 6. Component design standards

These are system-wide standards. Detailed page and component redesigns
may define more specific layouts, but must not contradict these rules.

### 6.1 Buttons

Define consistent primary, secondary, tertiary, and destructive
variants.

-   **Primary:** Imperial Crimson fill with high-contrast text.
-   **Secondary:** Surface background with a subtle border.
-   **Tertiary / Ghost:** Transparent background with clear hover
    feedback.
-   **Destructive:** Semantic error treatment, visually distinct from
    ordinary brand actions.

Every button must have default, hover, pressed, focus-visible, disabled,
and loading states where applicable.

Buttons must have clear labels or accessible names. Icon-only buttons
require tooltips where appropriate and accessible labels.

### 6.2 Inputs and forms

-   Use the standard surface and border tokens.
-   Use clear labels rather than relying only on placeholders.
-   Provide visible focus states.
-   Show validation messages close to the relevant field.
-   Distinguish error, disabled, read-only, and loading states.
-   Preserve existing validation behavior and form submission logic.
-   Ensure controls remain usable with keyboard and assistive
    technology.

### 6.3 Cards and panels

-   Use cards to group related information, not as a default wrapper for
    every element.
-   Keep padding consistent.
-   Use tonal elevation before adding visible borders.
-   Establish a clear title, content, and optional action hierarchy.
-   Avoid unnecessary nested panels and decorative headers.

### 6.4 Badges and status indicators

-   Use compact badges for meaningful states and categories.
-   Avoid using badges as decoration.
-   Keep status colors consistent with the semantic color table.
-   Pair color with readable status text or an accessible label.
-   Use a consistent size and shape system.

### 6.5 Icons

-   Use one consistent icon family throughout the application.
-   Prefer simple, recognizable outline icons.
-   Keep icon sizes and stroke weights consistent.
-   Do not mix unrelated icon styles.
-   Do not use emoji as a substitute for interface icons.
-   Icons must support comprehension; avoid decorative icon clutter.

### 6.6 Dialogs, dropdowns, and popovers

-   Use the elevated surface token.
-   Keep layering and focus behavior predictable.
-   Support keyboard navigation and Escape-to-close where appropriate.
-   Prevent dialogs from exceeding the viewport.
-   Maintain readable spacing and clear action hierarchy.
-   Preserve existing actions and data behavior.

### 6.7 Empty, loading, error, and success states

Every major component should have intentional states: - Empty: Explain
what belongs here and, when appropriate, what action to take. - Loading:
Show progress without shifting the layout unnecessarily. - Error:
Explain the issue clearly and expose an existing retry or recovery
action where available. - Success: Confirm completion without excessive
celebration or animation.

Do not fabricate data or imply an operation succeeded when the
underlying system has not confirmed it.

------------------------------------------------------------------------

## 7. OrchestrAI-specific interface guidance

The following guidance concerns presentation only. Existing capabilities
and data must remain unchanged.

### 7.1 Application shell and navigation

-   Establish a consistent application shell across authenticated pages.
-   Keep navigation hierarchy clear and predictable.
-   Use the sidebar surface and subtle separator.
-   Make the current location easy to identify without overusing
    crimson.
-   Preserve all existing routes and navigation actions.
-   Ensure the shell adapts cleanly to narrower screens.

### 7.2 Chat experience

The chat interface may be redesigned substantially, but must preserve
existing behavior.

Visual requirements: - Prioritize conversation readability. - Keep user
and assistant messages visually distinct without making the entire
conversation crimson. - Use Manrope for conversational content. - Use
Geist Mono for technical content and machine-oriented details. - Keep
timestamps and secondary metadata understated but readable. - Make the
composer easy to find and operate. - Design clear streaming, pending,
error, and completed states. - Avoid excessive bubble decoration and
unnecessary borders.

Functional requirements: - Preserve message submission and response
behavior. - Preserve streaming behavior if currently implemented. -
Preserve conversation history and switching behavior. - Preserve
existing attachments, actions, and interactive controls. - Do not change
message payloads, API contracts, or state management semantics.

### 7.3 Specialist-agent activity and tracing

Agent activity and tracing can receive a new information design. They
should be presented as structured operational information, not
decorative animations.

Visual requirements: - Make the active specialist identifiable. -
Distinguish queued, running, completed, and failed states. - Present
execution steps in a scannable hierarchy. - Keep technical details
compact and accessible. - Use Geist Mono for IDs, tool names, payloads,
and logs. - Use semantic colors for execution status. - Avoid constant
pulsing, excessive glow, and unnecessary motion.

Functional requirements: - Preserve all six specialist agents. -
Preserve the existing source of agent status and execution data. -
Preserve event ordering, tracing details, and operational meaning. - Do
not invent additional agent states or imply execution steps that did not
occur. - Do not modify orchestration, agent selection, or tool
execution.

### 7.4 Operation components

Operation-related components may be reorganized visually for clarity.

-   Group related operation details.
-   Make status, operation name, and relevant outcome easy to scan.
-   Separate summary information from expandable technical details where
    appropriate.
-   Use consistent layouts for comparable operation types.
-   Preserve all existing operation data and actions.
-   Do not change operation execution or business rules.

### 7.5 Login and signup

Authentication pages must use the same design system as the
authenticated product.

-   Maintain consistent typography, colors, form controls, and
    interaction states.
-   Use brand treatments selectively.
-   Keep the form hierarchy clear and focused.
-   Ensure validation and authentication feedback remain understandable.
-   Preserve existing authentication flows, API calls, validation,
    redirects, and session behavior.
-   Do not redesign authentication by changing how it works.

------------------------------------------------------------------------

## 8. Motion and interaction

Motion should communicate cause and effect, not decorate the interface.

Suggested durations: - Hover and focus transitions: 150--200ms. -
Dropdown and popover transitions: 150--200ms. - Panel and dialog
transitions: 200--300ms. - Larger layout transitions: use only when they
improve orientation.

Rules: - Prefer subtle opacity, color, and small position transitions. -
Avoid unnecessary scale and bounce effects. - Avoid continuous animation
when nothing is changing. - Avoid constant agent pulsing or glowing. -
Respect `prefers-reduced-motion`. - Do not delay important interactions
for decorative animation. - Keep animations smooth and consistent.

------------------------------------------------------------------------

## 9. Accessibility and usability requirements

Accessibility is mandatory, not optional polish.

-   Target WCAG 2.2 AA where applicable.
-   Normal text should target at least 4.5:1 contrast.
-   Large text should target at least 3:1 contrast.
-   Meaningful interface boundaries and focus indicators should have
    sufficient contrast.
-   All interactive controls must be keyboard accessible.
-   Use visible `:focus-visible` states.
-   Provide accessible names for icon-only controls.
-   Do not use color as the only indicator of status.
-   Use semantic HTML elements.
-   Associate form labels and validation messages with their controls.
-   Ensure dialogs manage focus appropriately.
-   Support reduced-motion preferences.
-   Avoid text smaller than 12px for essential interface information.
-   Test important screens at realistic zoom levels and viewport sizes.

If a proposed palette combination fails contrast checks, adjust the
foreground or background token usage while preserving the overall brand
identity. Do not sacrifice readability to preserve an exact color
pairing.

------------------------------------------------------------------------

## 10. Responsive design

The application must work across desktop, tablet, and mobile layouts.

-   Do not assume a desktop-only viewport.
-   Navigation should collapse or adapt without losing access to
    existing routes.
-   Panels should stack or become appropriately collapsible on narrow
    screens.
-   Chat messages and technical details must not overflow horizontally.
-   Tables and logs should use a deliberate responsive strategy.
-   Dialogs must fit within the viewport.
-   Buttons and touch targets must remain comfortably usable.
-   Avoid fixed widths that break common viewport sizes.
-   Test at narrow mobile, tablet, laptop, and wide desktop widths.

Responsive changes must preserve all existing functionality.

------------------------------------------------------------------------

## 11. Technical implementation rules for Antigravity

### 11.1 Frontend-only boundary

This redesign is strictly limited to the frontend.

**Do not modify:** - Backend source code. - API routes, endpoint
contracts, or request/response schemas. - Database schemas, migrations,
or stored data. - Agent prompts, tools, or orchestration logic. -
Specialist-agent behavior or routing. - Business rules and workflow
logic. - Authentication backend behavior. - Environment variables,
secrets, or deployment configuration. - Existing integrations or
infrastructure.

Do not make backend changes to simplify frontend implementation.

### 11.2 Preserve existing behavior

-   Inspect the current implementation before changing a component.
-   Identify the data source, props, events, state, and API interactions
    used by that component.
-   Preserve existing behavior and integration points.
-   Do not replace real data with mock data.
-   Do not remove a control or feature because it is difficult to
    redesign.
-   Do not silently change loading, error, or success semantics.
-   Do not introduce a new dependency unless it is justified and
    approved.
-   Do not rewrite working components unnecessarily.

### 11.3 Reuse and architecture

-   Reuse the existing framework, component architecture, and styling
    conventions where practical.
-   Establish shared design tokens and reusable primitives.
-   Avoid duplicated styles and one-off component implementations.
-   Keep components modular and maintainable.
-   Do not create a parallel design system.
-   Do not introduce a second state-management or data-fetching approach
    without approval.
-   Keep UI presentation separate from business logic.

### 11.4 Design-system compliance

-   Use the defined color tokens rather than hardcoding arbitrary
    colors.
-   Use Manrope and Geist Mono according to the typography rules.
-   Follow the spacing, radius, and component standards.
-   Use semantic status colors only for their intended meanings.
-   Do not introduce unapproved fonts, palettes, gradients, or icon
    families.
-   If a design requirement appears to conflict with this specification,
    explain the conflict and ask before changing the permanent system.

### 11.5 Critical-change approval

Before making any change that could affect application architecture,
routing, data flow, state semantics, API integration, authentication
behavior, or shared component contracts:

1.  Explain the proposed change.
2.  Explain why it is necessary.
3.  Identify the files and functionality it may affect.
4.  State whether it risks crossing the frontend-only boundary.
5.  Wait for explicit approval before proceeding.

Do not interpret a general redesign request as permission to make
critical architectural changes.

------------------------------------------------------------------------

## 12. Required workflow for every redesign task

Antigravity must work incrementally.

### Step 1 --- Inspect

Before editing: - Locate the relevant page and components. - Read the
existing implementation. - Identify dependencies and shared
components. - Understand current behavior and data connections. -
Identify responsive and accessibility considerations.

### Step 2 --- Plan

Before implementation: - Summarize the current component structure. -
Describe the proposed visual changes. - Identify reusable primitives or
tokens. - List the files expected to change. - Explicitly confirm that
the planned work is frontend-only.

For substantial changes, present the plan and wait for approval.

### Step 3 --- Implement

-   Implement only the requested scope.
-   Follow this design specification.
-   Reuse existing logic and integrations.
-   Avoid unrelated refactors.
-   Keep changes focused and modular.

### Step 4 --- Verify

After implementation: - Run the relevant linting, type-checking, and
tests available in the project. - Check the component in the actual
application. - Verify default, hover, focus, disabled, loading, error,
and success states where relevant. - Check responsive behavior. -
Confirm that existing interactions still work. - Inspect for console
errors and broken layouts.

### Step 5 --- Report

Provide a concise implementation report: - What changed visually. -
Which files changed. - Which existing functionality was preserved. -
Which checks were run and their results. - Any known issues or follow-up
work. - Any deviations from this design system, with reasons.

Never claim a test passed unless it was actually run and passed.

------------------------------------------------------------------------

## 13. Definition of done

A redesign task is complete only when:

-   The requested component matches the established visual direction.
-   Colors and typography follow this specification.
-   Layout and spacing are consistent with the system.
-   Responsive behavior has been checked.
-   Accessibility states have been considered.
-   Existing functionality and data integrations remain intact.
-   No backend or business-logic changes were made.
-   Relevant checks have been run and reported accurately.
-   No unrelated files or components were modified unnecessarily.

------------------------------------------------------------------------

## 14. Final non-negotiable directives

Antigravity MUST treat this document as the permanent design authority
for the OrchestrAI frontend.

1.  Do not redesign the entire application in one uncontrolled
    operation.
2.  Work one approved page or component at a time.
3.  Do not change backend behavior, APIs, schemas, agents, or
    orchestration.
4.  Do not remove existing features or controls.
5.  Do not invent data, statuses, or capabilities.
6.  Do not introduce arbitrary colors, fonts, or visual styles.
7.  Do not sacrifice readability for aesthetics.
8.  Do not make critical architectural changes without explicit
    approval.
9.  Do not use mock data in place of real application data.
10. Verify each implementation before moving to the next task.

**The permanent design direction is: Manrope + Geist Mono, dark-only
Imperial Crimson and Midnight Burgundy, modern technical, restrained,
readable, consistent, and functionally faithful.**

When uncertain, prioritize preserving existing functionality, following
the established design tokens, and asking for clarification rather than
making assumptions.
