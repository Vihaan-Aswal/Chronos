# Redesign brief — Chronos (full app, homepage frozen)

> Source: user brief passed to the design agent. Verbatim except for formatting.

You are a subagent spawned by another session.
Call skill({ name: "impeccable" }) and follow its `Setup` and `Commands` sections to handle

## OPTIONAL INPUTS (left blank; agent infers from repo and docs)

- Key flows that matter most: —
- Off-limits (must stay exactly as is): —
- How to run locally + test accounts/roles/seed data: —
- Product voice in a few words, who the users are: —
- Reference sites I like: —
- Primary device: — (blank means agent decides)

For login-gated pages with no credentials provided, look for seed scripts, fixtures, or test accounts in the repo. If none exist, create local-only fixtures or mocked auth state in the dev environment. If that is impossible, log it and redesign that page from its code and states, noting the limitation.

## GOAL

The homepage is finished and final. It is the design source of truth. Every other page needs a full redesign: UX, flow, information architecture, content, layout, and visual design. These pages must be top tier and feel like the same product as the homepage.

Be bold. You may go beyond the existing .md docs and improve flow, structure, copy, and composition, as long as the app's core functionality and purpose keep working as intended. This is a static redesign only: no animations, transitions, or motion work (the homepage's motion system will be extended to these pages later). Build so that door stays open: clean semantic structure, stable component boundaries, nothing that fights future motion. Basic hover, focus, and pressed states are fine.

Full autonomy over the "how". Use /impeccable's skills throughout: research, UX planning, design system, building, critique, and polish.

## AUTONOMY

- Do not stop to ask. Run every phase through to the final report in one continuous run.
- Every decision: weigh options, choose best by the bar, log in `docs/redesign/decisions.md` (decision, alternatives, reason). When unsure, choose the more conservative, lower-risk option.
- If something fails twice: log in `docs/redesign/04-open-questions.md`, take the safest fallback (ship simpler version or skip), keep going. Never hack around a problem, never stall.
- User review is replaced by stricter self-review: pilot calibration, evidence requirements, critique loops. Treat them as real gates.

## HARD RULES

1. **Homepage is frozen.** Record its commit hash and the files, components, and tokens it depends on. Before editing any shared component or token, check whether the homepage uses it. If it does, create a variant or new component instead, unless you can prove the homepage stays pixel-identical.
2. **Functionality survives.** Auth, data flows, forms, permissions, validation, routing, and API contracts keep working. Do not change backend, database, data model, permissions, auth, or pricing, and do not remove any feature. If a UX improvement would need one of these, don't implement it; log the proposal in `04-open-questions.md` and ship the best design within current functionality.
3. **Never invent facts.** No made-up stats, testimonials, customer names, features, pricing, certifications, or legal text. Copy only from what the product actually does. Where real content is missing, use a clearly marked placeholder and list it in `docs/redesign/placeholders.md`.
4. **Stay non-destructive.** Local/dev environments, fixtures, mocks only. Never run destructive actions against production data or real third-party services. Never print, log, or commit secrets or `.env` contents.
5. **Never weaken tests.** Don't delete, skip, or loosen tests to get green. If a test is genuinely wrong, fix it minimally and log why in `decisions.md`.
6. **URLs and SEO.** Keep existing routes or add redirects. Preserve metadata, analytics, and accessibility landmarks unless improving them.
7. **Git:** new branch, at least one commit per page, logical steps. Never push, merge, or open a PR. Don't commit baseline screenshots, recordings, or traces.
8. **Log every departure from the official docs** in `docs/redesign/deviations.md` with the reason.
9. **Skills are a floor, not a ceiling.** Result must still pass this brief's checks (homepage consistency, functionality, tests, accessibility, evidence). A skill's output is not proof something is done.

## CONTEXT AND MEMORY MANAGEMENT

- First action: save this brief as `docs/redesign/00-brief.md`.
- `docs/redesign/` is durable memory: brief, research, UX plan, design language, design system, decisions, progress, deviations, placeholders, open questions. Anything important only in context will be lost at compaction.
- Keep `03-progress.md` current: current phase, pages done, pages remaining, page in progress + exact status, which /impeccable skills used where, baseline artifact locations, homepage commit hash, how to run dev server and tests, precise "Next action" line.
- **Compact proactively**: after a page, after a phase, context ~400–500K, or when re-reading. Before compaction: update `03-progress.md` and `decisions.md` so a fresh context can resume from files alone. After: re-read `docs/redesign/` (00-brief, design-language, 02-design-system, 03-progress, decisions).
- **Keep context lean.** Targeted reads, grep first, summarize test/build output. View screenshots sparingly and record conclusions in text. Prefer sub-agents for broad exploration or repetitive verification.

## PHASE 0: SETUP

- Verify tooling: dev server runs, Playwright (or equivalent) works for screenshots.
- Confirm clean git state (if dirty, branch from current state and note it), create branch, record homepage commit hash.

## PHASE 1: RESEARCH AND UNDERSTAND (change nothing)

- Identify stack, routing, tokens, component library, homepage build. Extract design language precisely (type, color, spacing, grid, radius, density, tone of voice, component patterns, personality) into `docs/redesign/design-language.md`.
- Read all docs and .md files for purpose, audience, intended behavior.
- Inventory every non-home page and route, including system pages: auth, settings, legal, 404/500/error, empty/maintenance, email templates. For each: purpose, content, components, states (empty, loading, error, success, no-permission, edge cases), users, how they arrive/leave.
- Map real user journeys end to end, and data/functionality behind each page.
- Baseline: screenshots of every page at 375 / 768 / 1280 / 1920 px (including authenticated views and states), Lighthouse, bundle size. Store outside version control; record location in `03-progress.md`.
- Protect critical flows: run existing tests; where coverage is thin, write e2e tests for key flows so functionality can be proven preserved.
- Write `docs/redesign/00-research.md`: each page's purpose, what's wrong (UX, flow, content, visual), what the product needs.

## PHASE 2: HOLISTIC UX PLAN

Write `docs/redesign/01-ux-plan.md`:
- Core jobs-to-be-done and ideal journeys across pages.
- Target IA: sitemap, navigation model, hierarchy, how pages connect to homepage and each other. Remove/merge/split/reorder if it improves flow (log deviations with redirects per Hard Rule 6).
- Per page: single main purpose, primary/secondary actions, content hierarchy, sections, required states, definition of success.
- Content strategy in the homepage's voice. No lorem ipsum, no filler, no generic SaaS phrasing, no invented claims.
- Design direction: where pages match homepage exactly, where app pages legitimately need different density/structure (forms, tables, dashboards) while feeling like the same product.
- At least two alternative flow/structure options, weighed, chosen one justified in `decisions.md`.
- Build order with reasoning, and the pilot page: most representative page exercising the most components. Not the simplest, not the riskiest.

Then run a harsh self-review of the plan with the relevant /impeccable skills. Fix it, proceed directly to Phase 3. No approval wait.

## PHASE 3: DESIGN SYSTEM FOUNDATION

Extend homepage language into reusable building blocks. Reuse and extend existing tokens/components. Never fork a second system, no component library.
- Cover what app pages need the homepage doesn't: shells/navigation, forms/inputs, buttons, tables/lists, cards, modals/drawers, tabs, badges, toasts, empty/loading/error states, pagination, filters, as relevant.
- Every component gets all states (default, hover, focus, active, disabled, loading, error), light and dark if supported.
- Consolidate duplicated styles. Document in `docs/redesign/02-design-system.md`.

## PHASE 4: REBUILD, PILOT FIRST, THEN ONE PAGE AT A TIME

Per page:
1. Short page spec (purpose, layout, content, states) in `03-progress.md`.
2. Rebuild UI and content to new UX and design system.
3. Implement every state: empty, loading, error, success, no-permission, long content, many items, zero items, edge cases.
4. Verify 375 / 768 / 1280 / 1920 with real screenshots actually looked at. No horizontal overflow, nothing cramped/awkward between.
5. Verify a11y: semantic HTML, heading order, labels/form errors, keyboard nav with visible focus, contrast, screen-reader sense, touch target sizes.
6. Confirm functionality against protected flows. Run build, lint, typecheck, tests. No console errors/warnings.
7. Critique as ruthless senior design director with /impeccable skills, fix what's weak (up to 2 rounds), update `03-progress.md`, commit, compact if due.

**Pilot calibration.** After the pilot page, critique as if the user saw it first time. Compare side by side with homepage: same product? Generic? Density right? Adjust page and design system, record lessons in `decisions.md`, apply to remaining pages. Only then continue.

## PHASE 5: HOLISTIC REVIEW AND HARDENING

- Walk every key journey as first-time and returning user. Check navigation, repeated patterns, tone, density, consistency. Fix inconsistencies.
- Homepage regression check: diff against recorded commit, compare before/after screenshots at all four widths.
- Re-run full tests, Lighthouse, bundle size vs baseline. Perf and a11y must not regress.
- Final critique over whole app with /impeccable skills (up to 3 rounds, stop early if nothing meaningful remains). Hunt: inconsistent components, weak empty/error states, leftover old styling, dead code, broken links, contrast failures, text overflow, anything generic.
- Delete dead code and unused components from old UI.
- Confirm `placeholders.md`, `deviations.md`, `decisions.md`, `04-open-questions.md` complete and accurate.

## THE BAR

- **Anti-slop:** no template look, no default component-library feel, no filler copy, no decorative clutter, no cards-in-cards, no gradients/effects just because available. Every layout decision from page purpose and user task.
- **Cohesive:** same voice, visual language, quality as homepage.
- **Purposeful UX:** obvious main action, less friction, clear hierarchy and wayfinding, graceful failure.
- **Accessible and responsive:** WCAG AA min; usable on mobile, keyboard, screen reader.
- **Efficient:** no heavier/slower. Add dependency only if it clearly earns it, after checking license, size, maintenance via web search.
- **Proven:** nothing done without evidence: screenshots, passing tests, measured numbers.

## FINAL REPORT

1. New product structure and flow, reasoning
2. Page by page: what changed and why
3. Key decisions, every deviation from docs, every placeholder (point to files)
4. Functionality/route/API changes (minimal/none), redirects, proposals from `04-open-questions.md`
5. Before/after evidence: screenshots, Lighthouse, bundle size, tests, homepage regression
6. Known limitations and manual checks
7. Animation-pass readiness: where motion goes and how structure supports it
