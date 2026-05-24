# UI/UX Overhaul Goal

## Objective

Transform this web app into a polished, cohesive, production-quality product experience across the full UI/UX surface.

You may make broad frontend rewrites where they materially improve quality, maintainability, consistency, responsiveness, accessibility, or user experience. Do not merely apply superficial styling. Preserve the app’s core functionality, user flows, data model, API contracts, authentication behavior, data flows, and business logic unless a bug fix clearly requires changing them.

## Operating Mode

Before making changes:

1. Read this file fully.
2. Inspect the app structure, routes, shared components, styling system, and available scripts.
3. Identify the highest-impact UI/UX problems.
4. Create a concise implementation plan.
5. Then begin implementation.

During implementation:

- Prefer cohesive, end-to-end improvements over scattered cosmetic edits.
- Keep working until the acceptance criteria are met or a real blocker is found.
- Validate with the project’s available build, lint, typecheck, test, and formatting commands.
- Fix regressions introduced by the changes.
- Make broad rewrites only when they improve the product or codebase in a meaningful way.

## Primary Outcome

The app should feel:

- Intentionally designed
- Visually unified
- Fast-feeling
- Responsive
- Accessible
- Reliable
- Distinct from a generic template

Users should always understand:

- Where they are
- What is happening
- What they can do next
- What is loading
- What succeeded
- What failed

## Design Direction

Create a tasteful, distinct visual identity. Avoid default framework styling.

Build a cohesive design language across:

- Colors
- Typography
- Spacing
- Layout
- Border radius
- Shadows
- Cards
- Buttons
- Inputs
- Navigation
- Modals
- Tables
- Dashboards
- Empty states
- Loading states
- Error states

The UI should feel calm, clear, polished, and purposeful. Motion should clarify state changes, not distract.

## Scope

Audit and improve the entire app, including:

- All pages and routes
- Shared layout and navigation
- Buttons and calls to action
- Forms, inputs, validation, and focus states
- Cards, lists, tables, dashboards, and content containers
- Modals, dropdowns, menus, toasts, and alerts
- Loading, skeleton, pending, empty, success, and error states
- Page transitions and in-between wait states
- Mobile, tablet, and desktop responsiveness
- Accessibility, keyboard navigation, semantic HTML, and contrast
- Animation quality, hover states, active states, disabled states, and microinteractions
- Visual bugs, overflow bugs, inconsistent spacing, broken alignment, and layout glitches

## Rewrite Permission

You may refactor or rewrite:

- Components
- Styles
- Layout structure
- Frontend architecture
- Shared UI primitives
- Design tokens
- Theme files
- Route/page layout
- File organization

Rewrite when it improves clarity, consistency, maintainability, performance, accessibility, or polish.

Prefer reusable primitives and design tokens over one-off CSS. Consolidate duplicated styling. Remove obsolete UI code when replaced safely. Reorganize frontend files if doing so improves clarity.

## Do Not

Do not:

- Break existing user-facing functionality
- Remove important features
- Change backend/API contracts unless necessary and justified
- Change authentication behavior unless necessary and justified
- Change data flows unless necessary and justified
- Introduce large dependencies without a clear benefit
- Add flashy animation that hurts usability or performance
- Leave the app in a partially migrated visual state
- Ignore build, lint, type, or test failures
- Rewrite backend business logic unless required to fix a bug

## Quality Bar

Good UI for this app means:

- **Clear hierarchy:** users can immediately tell what matters most.
- **Consistency:** the same interaction looks and behaves the same everywhere.
- **Responsiveness:** layouts work cleanly on mobile, tablet, and desktop.
- **Fast perception:** loading states, skeletons, optimistic feedback, and transitions prevent the app from feeling frozen.
- **Feedback:** actions have clear pending, success, error, disabled, hover, focus, and active states.
- **Accessibility:** contrast, focus rings, keyboard support, semantic structure, and readable text are handled properly.
- **Distinctiveness:** the app has a recognizable visual personality, not a generic template feel.
- **Maintainability:** the UI system is easier to extend after this work.

## Implementation Passes

Work in coherent passes:

1. **Design tokens and theme**

   - Unify colors, typography, spacing, radius, shadows, borders, and focus states.
   - Create or refine reusable design tokens where appropriate.

2. **Shared components**

   - Standardize buttons, inputs, cards, badges, modals, dropdowns, alerts, tables, tabs, and page containers.
   - Replace one-off styling with reusable primitives.

3. **Layout and navigation**

   - Improve app shell, navigation, page structure, breadcrumbs if relevant, and responsive behavior.
   - Make the user’s current location and next actions clear.

4. **Page-by-page polish**

   - Improve each major route so it follows the unified system.
   - Fix spacing, alignment, hierarchy, overflow, and visual consistency issues.

5. **Loading, empty, success, and error states**

   - Add skeletons, progress indicators, disabled states, useful empty states, and clear error recovery actions.
   - Ensure waiting periods feel intentional rather than frozen.

6. **Animation and interaction polish**

   - Add tasteful transitions for page changes, modals, dropdowns, hover states, button presses, loading states, success states, and error feedback.
   - Keep animation performant and purposeful.

7. **Responsiveness and accessibility**

   - Test and improve mobile, tablet, and desktop layouts.
   - Improve keyboard navigation, semantic HTML, focus visibility, contrast, and readable text.

8. **Bug fixes and cleanup**
   - Fix obvious UI bugs and layout glitches.
   - Remove dead or obsolete UI code when replaced safely.
   - Ensure the final codebase is cleaner than before.

## Validation

Use the project’s available commands. Look in package scripts, config files, README, or equivalent project documentation.

Run relevant checks such as:

- Build
- Lint
- Typecheck
- Tests
- Formatting

If a command does not exist, do not invent it. Use the commands available in the repo.

Fix any failures caused by the UI/UX work. If failures remain, explain exactly what failed, why it likely failed, and whether it is related to the changes.

## Acceptance Criteria

The goal is complete when:

- The app has one unified visual system.
- Major pages look intentionally designed and consistent.
- Buttons, forms, cards, navigation, modals, and feedback states are standardized.
- Loading and waiting states are smooth and informative.
- Animations are tasteful, useful, and performant.
- The app works across desktop, tablet, and mobile.
- Obvious UI bugs and layout glitches are fixed.
- Accessibility basics are improved.
- The codebase has reusable UI primitives or tokens instead of scattered one-off styles.
- Existing core functionality still works.
- Build, lint, typecheck, test, and formatting checks pass where available, or remaining failures are clearly explained with exact causes.

## Completion Report

When finished, summarize:

- Main UI/UX improvements made
- Components or pages rewritten
- Bugs fixed
- New design system pieces added
- Commands run and their results
- Remaining risks or limitations
- Recommended follow-up work
