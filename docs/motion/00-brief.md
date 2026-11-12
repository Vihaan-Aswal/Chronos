# Motion elevation — brief

> Saved from the user's brief. This folder is the run's memory.

# STATE OF THE REPO (read this before the brief)

- Branch `redesign/app-pages` at `2c2094c`. All non-home pages were redesigned statically and are final. Redesign docs: `docs/redesign/` (decisions D1–D33, deviations, placeholders, open questions).
- Homepage files (`src/pages/home-page.jsx`, `src/components/home/`, `src/styles/home-page.css`) are byte-identical to `426493c` and must stay that way.
- **Correction to the brief's premise:** the homepage's motion *plan* is written (`docs/homepage-motion-plan.md`, untracked) but its implementation was never merged — the homepage code is static, and no motion tokens exist in it. Do not modify the homepage. Treat the plan's tokens and choreography as the source of truth, and build the shared motion system for the app pages from them, in a central place the homepage can adopt later. Log this gap and your resolution in `docs/motion/decisions.md`.
- The plan's tokens, to be adopted exactly: `--motion-instant` 120ms, `--motion-fast` 180ms, `--motion-base` 260ms, `--motion-slow` 420ms, `--motion-authored` 620ms, `--motion-print` 700ms; `--ease-arrive cubic-bezier(0.16,1,0.3,1)`, `--ease-state cubic-bezier(0.4,0,0.2,1)`, `--ease-exit cubic-bezier(0.4,0,1,1)`; `--stagger-desk` 18ms, `--stagger-chain` 60ms. No bounce or elastic curves; exits faster than entrances; total stagger under 360ms.
- `motion` 12.38 is installed. Playwright is installed with 26 e2e tests (`npm run test:e2e`, config `e2e/playwright.config.js`, own dev server on 5176, reduced-motion emulated, fake camera). Build ~25s. Lint is 0 errors / 6 warnings (I fixed a Node-globals error in the e2e config; it is uncommitted — commit it as part of your baseline).
- Dev server at http://localhost:5173. Baseline artifacts for the homepage live in `.impeccable/motion-baseline/`; redesign screenshots in `main/app/frontend/.impeccable/redesign/`. Both gitignored.
- No backend, auth, permission, data or API changes. Never print or commit `.env` contents.

# THE BRIEF

# OPTIONAL INPUTS (leave blank to let the agent decide)
- Moments I most want to feel special:
- Must not animate:
- Motion taste: calmer than the homepage / same / more expressive in specific places:

# GOAL

The homepage is finished, with its motion system, and is my source of truth. Every other page has been redesigned statically and is final in layout, content, and UX. Now bring those pages to life with smooth animations, transitions, and 2D/3D graphics so the whole product feels like one authored experience with the homepage.

This is an elevation, not a redesign. Don't change layout, content, copy, flows, or visual design. The redesign docs' animation-readiness notes and component boundaries exist for this, so start from them.

**The philosophy is different from the homepage.** The homepage is a showpiece. These pages are tools people use repeatedly. Motion here serves the task: it orients, confirms, explains cause and effect, and makes waiting feel shorter. Frequent actions stay fast and nearly invisible. Rare, emotional, or first-impression moments (first-run, success, empty states, auth, 404, demo) can be richer. The target is a product that feels alive, precise, and never slow.

You have full autonomy over the "how". You may install libraries, use web search, and pull from boilerplates, demos, docs, and asset sources, but extend what the homepage already uses before adding anything new. Use /impeccable's skills throughout, wherever they apply: research, ideation, building, critique, and polish.

# AUTONOMY (run end to end in one go)

- **Do not stop to ask me anything.** There are no checkpoints. Run every phase, all pages, through to the final report in one continuous run.
- When you face a decision, weigh the options, choose the best one by the bar below, and log it in `docs/motion/decisions.md` (decision, alternatives considered, reason). When unsure, choose the more conservative, lower-risk option.
- If something fails twice, log it in `docs/motion/open-questions.md`, take the safest fallback (usually: ship the simpler version, or skip that effect), and keep going. Never hack around a problem, and never stall.
- Your substitute for my review is stricter self-review: the pilot calibration, the evidence requirements, and the critique loops below. Treat them as real gates, not formalities.

# HARD RULES

1. **Homepage is frozen.** Record its commit hash up front. Shared tokens, primitives, and providers may be extended but must not change how the homepage looks, moves, or performs. Verify with before/after recordings and metrics at the end.
2. **One motion system, not two.** Find the homepage's tokens, primitives, and conventions and extend them in the same central place. No second set of easings or durations, and no second library doing the same job.
3. **Static design is final.** Don't change layout, content, copy, routes, flows, or functionality, or touch data, auth, permissions, or API contracts. If motion truly needs a structural tweak, keep it minimal and log it in `docs/motion/deviations.md`. Final resting states must match the approved static design.
4. **Never weaken tests.** Don't delete, skip, or loosen tests to get green. If animation makes a test flaky, fix its waiting strategy or disable motion in the test environment through the global kill switch. Don't remove the test.
5. **Non-destructive.** Local/dev environments and fixtures only. Never print, log, or commit secrets or `.env` contents.
6. **Licensing.** Before adding any library or asset, verify license (commercial use OK), maintenance status, bundle size, and framework compatibility via current web search. Don't rely on memory. Log every external asset, boilerplate, or snippet with source URL and license in `docs/motion/credits.md`. Never ship anything unclear or restrictive.
7. **Git:** new branch, at least one commit per page, logical steps. Never push, merge, or open a PR. Don't commit baseline recordings, screenshots, or traces.
8. **Skills are a floor, not a ceiling.** A skill's approval is not proof of done. Only the evidence below is.

# HOW I WANT YOU TO WORK

**1. Setup and memory.**
First action: save this prompt as `docs/motion/00-brief.md`. `docs/motion/` is your memory across a long run: brief, research, plan, motion language, decisions, progress, deviations, credits, open questions. Keep `docs/motion/03-progress.md` current (phase, pages done, /impeccable skills used where, and a "Next action" line). Re-read the whole folder at the start of each phase and after every page so decisions don't drift. Also read `docs/redesign/` and the homepage's motion docs. Confirm the dev server runs and Playwright (or equivalent) can capture screenshots, video, and performance traces. Create the branch.

**2. Understand the existing motion language precisely.**
Extract the homepage's motion tokens (durations, easings/springs, staggers, distances, scroll offsets), reusable primitives, libraries, reduced-motion handling, graphics approach, lazy-loading and fallback strategy, and overall feel into `docs/motion/design-language.md`. Inventory every non-home page and its states (loading, empty, error, success, no-permission, long lists, modals, drawers, tabs, toasts, forms), and for each note what is abrupt, jarring, or lifeless, and which moments the user cares about.

**3. Baseline before touching anything.**
Record, for every page: production bundle size, Lighthouse, Core Web Vitals (LCP, CLS, INP/TBT), screenshots at 375 / 768 / 1280 / 1920 px, and a performance trace of one or two representative interactions on each key page. Record that the existing test suite passes. Store all artifacts outside version control.

**4. Ideate properly, then decide.**
Write `docs/motion/01-plan.md`. Think like a motion director for a product. Explore at least two distinct directions for how the homepage's language translates to app pages (what stays identical, what is deliberately calmer or faster, and why), pick one, and justify it. Evaluate every category for every page:
- **Route and page transitions**: entering and leaving, shared elements where they aid orientation, nav and active indicators, theme toggle if present.
- **Load choreography**: hierarchy-aware entrances, not uniform fades.
- **Component motion**: buttons, inputs, tabs, menus, popovers, modals, drawers, accordions, tooltips, toasts, selects, table and list changes (add/remove/reorder), filters, pagination.
- **State feedback**: skeletons, progress, optimistic updates, validation, success and error confirmations, saved states, inline status changes.
- **Scroll and layout**: sticky behavior, expand/collapse without jank, scroll-linked effects only where genuinely useful.
- **Graphics (2D/3D)**: only where they earn their place: auth, empty states, first-run, 404, demo, success moments, data viz that clarifies. Pick the signature graphic moments deliberately; most app pages need none.
- **Ambient**: subtle life only where it fits the page's purpose, never behind dense working UI.

Rank by (impact on perceived quality) ÷ (cost in performance, complexity, risk). Build high-ratio items first. Explicitly list what you will NOT animate and why. Choose a pilot page (most representative, exercises the most component types and states) and a build order (shared foundation first).

**5. Build the foundation, then the pilot.**
Extend the central tokens and primitives only as needed (route transition wrapper, presence and list helpers, skeleton and feedback patterns, reduced-motion hook). No magic numbers in components. SSR/hydration safe, with no `window`/`document` at module scope. Add a single global switch to disable or tone down all motion (for tests and for me). Document the system, usage rules, and choreography hierarchy in `docs/motion/02-system.md`. Then build the pilot page fully.

**6. Pilot calibration (replaces a human checkpoint).**
After the pilot, critique it harshly as if you were me seeing it for the first time, check it against the homepage's feel, and measure it. Adjust timing character, intensity, and the shared system based on what you find, and record the lessons in `docs/motion/decisions.md`. Only then roll out to the remaining pages, applying those lessons.

**7. Build the rest, one page at a time.**
Finish each page before starting the next. For each page:
- Write a short motion spec (what moves, why, timing, fallback) in `03-progress.md`.
- Implement with the shared system as progressive enhancement: the page is fully readable and usable if JS, WebGL, or all motion fails.
- Cover every state transition, not just the happy path: loading to loaded, empty to populated, error, success, modal/drawer open and close, tab switches, list add/remove/reorder.
- **Prove the motion.** Stills can't show motion quality, so record video or capture frame sequences of the key transitions and interactions, and use performance traces to check for dropped frames and long tasks. Also screenshot resting states at 375 / 768 / 1280 / 1920 px and confirm they match the static design.
- Run build, lint, typecheck, and the full test suite. No console errors or warnings.
- Critique with the relevant /impeccable skills as a ruthless senior motion/design director. List what's janky, slow, generic, or overdone, fix it (up to 2 rounds), update progress, commit.

**8. Holistic review and hardening.**
- Walk every key journey end to end as a first-time and as a returning user. Check that route transitions, repeated patterns, timing, and tone are consistent across pages and with the homepage. Fix stray easings, mismatched durations, pages that feel dead or overdone.
- Homepage regression check: compare before/after recordings and metrics against the recorded commit.
- Re-measure everything against baseline. Report exact JS delta (initial and per-route).
- Final critique over the whole app with /impeccable's skills, up to 3 rounds, stopping early if nothing meaningful remains.
- Test the hard cases: reduced-motion emulation, 4x CPU throttle, slow 4G, WebGL disabled, keyboard-only use, fast and repeated navigation, rapid clicking and interrupting animations mid-flight, resize and orientation change, tab switching, and route-away-and-back repeatedly (watch for leaks).
- Self-audit for: listener and RAF leaks, unmount warnings, layout shift, flash of unanimated content, janky first paint, text unreadable over animated backgrounds, z-index and stacking bugs, mobile overflow, sticky elements on short viewports.
- Delete unused animation code and dead dependencies.

# THE BAR

- **Anti-slop:** no uniform "everything fades up on scroll", no motion on every element, no gratuitous parallax, no scroll-jacking, no bouncy or sluggish easing in a work context, no effects that exist because they're possible. Vary choreography by importance. Motion must guide attention, confirm interaction, show cause and effect, or strengthen the story, or it gets cut.
- **Feels like the homepage:** same motion language and quality, calibrated for functional UI. It should feel like one product.
- **Never in the way:** frequent actions are fast (roughly under 200ms and near-invisible). Nothing blocks input, delays navigation, or makes the user wait for an animation to finish. Animations are interruptible, and rapid repeated actions never queue up or stutter.
- **Performance (hard pass/fail):** LCP, CLS, and INP/TBT must not regress versus baseline on any page, and Lighthouse performance may not drop more than 2 points. The LCP element is never gated behind an animation or heavy script. Sustain ~60fps, including under 4x CPU throttling. Animate only compositor-friendly properties (transform, opacity, filter sparingly), never layout properties. Zero layout shift. Pause offscreen and hidden-tab work. Clean up all loops, listeners, and GPU resources on unmount. Heavy graphics are code-split, lazy-loaded, capped in pixel ratio, and degrade gracefully on weak devices or without WebGL. If a page fails a limit, fix it or cut the effect.
- **Accessible:** WCAG AA minimum. `prefers-reduced-motion` gives a genuinely calm experience (instant or simple fades, no parallax, no autoplay motion, static fallback for 3D), not a half-disabled one. No flashing. Focus is always visible and never obscured by animation, with no scroll or focus traps. Decorative graphics are `aria-hidden`. Contrast holds in every animated state. Screen readers still get announcements for toasts and status changes.
- **Robust:** works on touch (no hover-dependent affordances) and across Chrome, Safari (including iOS quirks such as 100vh and WebGL limits), and Firefox, with fallbacks for unsupported APIs.
- **Proven:** nothing is done without evidence: recordings or frame sequences, traces, passing tests, measured numbers.

# FINAL REPORT (concise, written when everything is done)

1. The motion concept, what you built page by page, and what you deliberately skipped
2. Libraries and assets added (name, version, size, license, reason)
3. Before/after metrics (bundle delta, Lighthouse, Web Vitals) and evidence for the tests above, including the homepage regression check
4. Key decisions and any structural deviations from the static design (point to `decisions.md` and `deviations.md`)
5. Unresolved items from `open-questions.md`
6. Anything I should check manually on a real device (especially iOS Safari and a low-power Android phone)
7. Where to tune intensity and speed, and how to disable any effect quickly

# TOOLS

- The in-app browser is available again, but screenshots can fail if the desktop window is not visible. Headless Chrome over CDP works: harnesses in `C:\Users\vihaa\AppData\Local\Temp\opencode\` (`shot.js` full-page PNGs + overflow, `audit.js` contrast/small text/console, `scrolled.js`), plus `Page.startScreencast` for motion evidence and the `Tracing` domain for traces. Copy and extend them.
- Playwright is installed: `npm run test:e2e` (26 tests, ~32s, reduced-motion emulated).
- Lighthouse via `npx lighthouse` against `vite preview` (production build), not the dev server. Do not add it as a dependency.
- Web search is available; verify any new library's license, size and maintenance before adding it.
