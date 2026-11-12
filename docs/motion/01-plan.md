# 01 — Motion plan

**Phase:** plan (no motion code written yet)
**Branch:** `feat/app-motion-elevation`
**Baseline:** `fb5caff` (e2e lint fix) on top of `2c2094c`; homepage frozen at `426493c`.
**Memory:** `docs/motion/` (brief, design-language, this plan, progress, decisions, deviations, credits, open questions).

## 1. The job

The app pages are tools used repeatedly. Motion must orient, confirm, explain cause and effect, and shorten waits. It must feel like the homepage — paper, forest, cream, sage, gold hairline, Newsreader/Manrope — without turning working screens into a showpiece. Frequent actions stay at 120–180 ms and nearly invisible. Rare moments (first-run auth, the post-class record, empty/error recovery) may be authored.

**One-sentence thesis:** *The record writes itself: paper settles, ink rules draw, and a signal moves only when it has something to say.*

## 2. Directions considered

### A. The Record Writes Itself — **chosen**

**Concept:** The app is a working paper record. Panels settle like sheets placed on a desk; header rules draw once; rows enter like ruled entries; dialogs rise from the paper; the live rail is a working ledger; the post-class record prints itself. The forest live room keeps the homepage's field, with the cream rail as the working page.

**Signature centerpiece:** the **session record print** — the full-screen record opens, its forest header rule draws, the TPI fact row settles, the attention chart draws its line, the distribution band fills, and the follow-up ledger is already there. Rare, post-class, and specific to the product.

**Frequent language:** the **teacher's live rail** — rows enter with a capped stagger, filters swap, a state change is a dot/colour transition, an action note lands, a nudge gives a short pulse. Fast, interruptible, never in the way.

**Attention:** concentrated on the report (rare) and the rail (frequent); auth/404/empty states get a quiet paper settle; dense data stays still.

**Cost:** low–medium. CSS transitions/keyframes plus the already-installed `motion` package for row presence and report orchestration. No new dependency, no canvas, no WebGL, no external asset.

**Risk:** paper metaphors can become skeuomorphic; the report print can feel slow if it exceeds ~700 ms; row presence can reorder/jank if layout animation is careless. Mitigations: transform/opacity only; no per-section reveal; no layout animation on the rail; reduced-motion path.

### B. The Signal Field — declined

**Concept:** a more expressive instrument: a live signal line/waveform across auth and live pages, meters that respond to state, a 3D-ish stage, ambient pulses.

**Signature:** a signal field in the live room.

**Attention:** spread across the whole product; the working UI competes with the graphics.

**Cost:** high. Canvas/SVG per-frame work, more JS, likely a new chart/visual layer; risks 60 fps under 4× CPU and pulls focus from the roster.

**Risk:** turns a calm tool into a dashboard; the brief explicitly warns against ambient motion behind dense working UI; the homepage already owns the showpiece. Declined.

### C. The Quiet Tool — fallback, not chosen

**Concept:** only micro-feedback (button press, focus, error, row state), no authored moments.

**Signature:** none; the product feels precise but not alive.

**Attention:** none beyond the task.

**Cost:** lowest.

**Risk:** fails the "alive and premium" half of the brief; the report and auth first impression remain flat. Kept as the fallback if a richer effect fails the performance budget twice.

### Rejected by rule

- Uniform page/section fade-up; scroll reveals; parallax; tilt; scroll-jacking.
- Bouncy/elastic easing; long working-UI transitions; animated counters.
- 3D/WebGL libraries; a second animation library.
- Motion on the tracker canvas, video tiles, chart axes, or dense table columns.
- New layout/content/graphics that change the approved static design.

## 3. What stays identical, what is calmer/faster

| Homepage | App translation |
|---|---|
| Paper/forest/cream/sage/ink/gold hairline | Exact same palette and material world |
| Newsreader display + Manrope labels | Same; no new type |
| Square buttons, 2 px radius, 10–11 px uppercase labels | Same |
| One arched room window (showpiece) | The live room is the forest field; the cream rail is the working page. No second arch. |
| 620 ms room settle, 420 ms nudge ring | Working UI never uses 620/420; those are reserved for the report/auth first impression |
| 280 ms panel-in | 180–260 ms panel/dialog/rail transitions |
| Ambient live dot | One subtle live dot only; pauses offscreen/hidden |
| Record print | The report print is the app's authored moment; 700 ms max |

**Calibration:** app motion is **faster and quieter** than the homepage by default. The report and auth are the only places allowed to feel "authored" for more than 300 ms. Nothing loops behind the teacher roster or student signals.

## 4. What we will deliberately not animate

- LCP elements (page titles/headlines) — never opacity 0, never delayed.
- Dense data text, table columns, chart axes, video tiles, tracker canvas.
- Every section on scroll; no uniform fade-up; no reveal-on-scroll library.
- No parallax, tilt, scroll-jacking, particles, blobs, gradient text, glass.
- No infinite loop except the live connection dot; it pauses offscreen/hidden.
- No counting numbers; TPI/report values are static facts.
- No layout properties in transitions (width/height/top/left/margins).
- No motion that delays navigation, input, focus return, or dialog dismissal.
- No animation of the `100ms` video internals or the camera canvas.
- No new layout/content/copy or decorative graphics that change the static design.

## 5. Motion language and choreography

Tokens are adopted exactly from `docs/homepage-motion-plan.md` (see `design-language.md`). One source:
- `src/styles/motion.css` — tokens, keyframes, global kill switch, reduced-motion, primitives.
- `src/components/motion/` — `MotionProvider`/`useMotionPreference`, `PageRule`, `PresenceList` helpers; no magic numbers in page components.
- `src/components/app/motion.js` — JS constants mirroring the tokens for `motion` sequences (named, no inline numbers).

### Shared primitives

| Primitive | Behaviour | Timing |
|---|---|---|
| `PageRule` | The existing header/room-bar hairline draws from left to right on route mount. No page fade-up. | 260 ms `--ease-arrive` |
| `Button`/link feedback | Colour/border transition; active scale 0.985; focus ring immediate | 120 ms `--ease-state` |
| `Dialog`/`Modal` | Panel rises 6 px + fades; backdrop fades; close instant; focus return unchanged | 180 ms `--ease-arrive` |
| `Notice`/error | Rises 4 px + fades; no layout animation | 180 ms |
| `Rail` (mobile) | Slides/fades in when opened; display:none on close (no exit delay) | 220 ms `--ease-arrive` |
| `Row` | Entrance 160 ms + 18 ms stagger, capped 8 rows; exit 120 ms; no layout animation | 160 ms |
| `LoadingRule` | 1 px ruled progress line under loading text; 1.2 s loop; static under reduced motion | 1.2 s |
| `LiveDot` | Opacity/scale pulse only when live and visible | 2.4 s loop |

### Route / page transitions

- **Paper pages** (`/signin`, `/signup`, `/choose-role`, `/readiness`, `/teacher` desk, `/records`, 404): header hairline draws 260 ms; content is visible immediately; no full-page fade. The page's first meaningful block may settle 4 px / 180 ms **only on first-run auth**, never on every route.
- **Live rooms** (`/teacher` live, `/student` live, `/meeting`): room bar hairline draws 260 ms; stage/rail are visible immediately; no page entrance that delays the video.
- **Auth**: the LCP headline is static; the aside facts stagger 60 ms (max 3); the form fields rise 4 px / 180 ms; success/error notices animate.
- **404**: header rule draw + button feedback only; no new graphic.

### Page specs

#### `/signin`
- Aside facts: 60 ms stagger, 420 ms total; h1 static.
- Form: fields/button settle 4 px / 180 ms; focus transition 120 ms.
- Error notice: 180 ms rise; focus moves to it (existing).
- Eye toggle: 120 ms colour.

#### `/signup`
- Same shell; mismatch field error 180 ms; success panel 220 ms "stamp" (opacity/scale 0.99→1); auto-redirect unchanged.
- No change to the 2.2 s timer.

#### `/choose-role`
- Two columns settle 4 px with 18 ms stagger; buttons 120 ms feedback. H1 static.

#### `/readiness`
- Camera stage/panel visible immediately; no entrance over the video.
- Each check row: 180 ms colour/border transition when its state changes; icon swap instant (no layout).
- Result panel: 180 ms rise; focus unchanged.
- Primary button label/disabled state: 120 ms colour; no spinner animation (the label already says "Checking…").
- Retry: 120 ms feedback.

#### `/teacher` desk
- Embedded readiness panel as above; records row/section settle 4 px / 180 ms; "Open records" 120 ms.

#### `/teacher` live — **pilot**
- Room bar: no entrance; segmented controls 120 ms; "Check engagement"/"End session" 120 ms.
- KPI strip: counts change instantly; flagged count colour transition 120 ms (no number roll).
- Rail: rows enter 160 ms + 18 ms stagger (max 8); filter change exits/enters rows (presence, 120/160 ms); action notes rise 4 px; row hover 120 ms.
- Dialogs: 180 ms rise; backdrop fade; message composer focus unchanged.
- Rail toggle on mobile: 220 ms entrance; no exit delay.
- Live dot: 2.4 s pulse only when connected and visible.
- Report open: see session record.
- No motion on the video stage except its own third-party states; do not wrap the stage in page transitions.

#### `/student` live
- State title/copy crossfade 180 ms; signal strip cells transition background 180 ms; new cell fill 180 ms.
- Nudge note: rises 8 px / 220 ms; auto-dismiss timer unchanged.
- Liveness/auto-nudge/tab-switch dialogs: 180 ms via shared Dialog.
- Rail toggle: 220 ms entrance; tracker canvas untouched.

#### `/records`
- Loading: existing text + 1 px progress line (loop 1.2 s; static reduced motion).
- List: rows enter 160 ms + 18 ms stagger (max 8); hover 120 ms; open button 120 ms.
- Error/empty: 180 ms rise; retry 120 ms.
- Record open: the report print (below).

#### Session record — **signature**
- Native `<dialog>` opens: backdrop fade 180 ms; record sheet rises 8 px / 260 ms.
- Forest header rule draws 420 ms; TPI/facts settle 60 ms stagger (max 4); charts draw once (Recharts `animationDuration` 420 ms, `ease-out`); distribution band segments scaleX 420 ms from the left; follow-up ledger static.
- No section-by-section reveal; the body below the head is readable immediately.
- Save: 120 ms button state; success notice 180 ms; no redirect.
- Per-student details: 180 ms fade/rise; no height animation; user-triggered layout change is acceptable.
- Reduced motion: no chart/band animation; final values immediate.

#### `/meeting`
- Room bar rule draw; stage state transitions (loading/error/live) 180 ms opacity; no motion on the video itself.

#### 404 / error
- Header rule draw; button feedback. No decorative graphic; the page is already a designed recovery state.

## 6. Performance budget

Baseline is in `.impeccable/motion-baseline/app/` (Lighthouse JSON, screenshots, traces) and `.impeccable/motion-baseline/` (frozen homepage baseline).

| Page | Desktop perf floor | Mobile perf floor | LCP ceiling | CLS ceiling | TBT ceiling |
|---|---:|---:|---:|---:|---:|
| `/` frozen | 87 | 57 | prior 1.3 s / 5.9 s | 0.002 / 0.016 | 0 / 240 ms |
| `/signin` | 94 | 63 | 1.1 s | 0.001 | 0 |
| `/signup` | 94 | 63 | 1.1 s | 0.001 | 0 |
| `/choose-role` | 94 | 63 | 1.1 s | 0.004 | 0 |
| `/records` | 93 | 63 | 1.2 s | 0.001 | 0 |
| `/meeting` | 94 | 62 | 1.1 s | 0.006 | 0 |
| 404 | 94 | 63 | 1.1 s | 0.001 | 0 |
| `/readiness` | 63 | n/a (camera-heavy) | 1.1 s | 0.006 | 6,050 ms |
| `/teacher` desk | 60 | n/a | 1.4 s | 0.008 | 4,890 ms |
| `/student` join | 61 | n/a | 1.4 s | 0.000 | 4,480 ms |
| live shells | trace only | trace only | — | no new shift over 0.136/0.161 | no motion long task > 50 ms |

- Lighthouse performance may drop at most 2 points from baseline; LCP/CLS/TBT must not regress.
- Bundle delta: **JS ≤ 6 kB gzip, CSS ≤ 4 kB gzip**; no new dependency.
- 60 fps under 4× CPU; motion long tasks ≤ 50 ms; no scroll handlers.
- Animate only transform/opacity/filter (bounded); no layout properties; zero added CLS.
- Pause loops offscreen/hidden; clean up listeners/observers/animations on unmount.
- LCP element never gated behind motion.
- Reduced motion: instant or 120 ms opacity/colour; no travel/stagger/loop; charts static; dialogs instant.
- Global switch: `data-motion="off"` (and `?motion=off`) disables all transitions/animations and chart animation; `data-motion="reduced"` gives the reduced path. Exposed as `window.chronosMotion` for manual QA and tests.
- Save-data / coarse pointer: no hover lift; no ambient loop; keep state feedback.

## 7. Pilot and build order

**Pilot:** `/teacher` live — the most representative working surface: forest room bar, cream rail, rows, filters, actions, dialogs, empty/all-clear, live dot, report handoff. It exercises the most component types and states.

**Build order:**
1. Foundation: motion tokens/CSS, global switch, reduced-motion, `PageRule`, Dialog, Notice, Row presence, LoadingRule, LiveDot. No page-specific motion yet.
2. Pilot `/teacher` live; record a motion spec, implement, capture, measure, critique.
3. **Pilot calibration:** compare with homepage feel; check timings, row stagger, rail toggle, dialogs, reduced motion, 4× CPU; adjust shared system; record lessons in `decisions.md`.
4. `/signin`, `/signup`.
5. `/choose-role`.
6. `/readiness` + `JoinScreen`.
7. `/student` live + nudge + tracker rail.
8. `/records` + **session record print** (signature).
9. `/teacher` desk.
10. `/meeting`, 404, error boundary.
11. Holistic review, homepage regression, cleanup, final report.

One commit per page/step, logical; no baseline artifacts committed.

## 8. Evidence plan

- Baseline: `.impeccable/motion-baseline/app/` (screenshots 375/768/1280/1920, Lighthouse JSON, traces, audit, tests). Frozen homepage: `.impeccable/motion-baseline/`.
- After: `.impeccable/motion-after/app/` — same screenshots, Lighthouse, traces, videos/frame sequences.
- Motion evidence: `Page.startScreencast` or Playwright video for load, route change, teacher filter/nudge/dialog, student nudge, records open/report print, settings; frame sequences + contact sheets.
- Traces: teacher live filter/nudge, student nudge, report open/details, signin error; 4× CPU trace.
- Tests: `npm run test:e2e` (26) after each page; reduced motion is already emulated.
- Lighthouse: production preview, desktop for every page; mobile for non-camera-heavy pages; live shells via dev trace (production fixture is DEV-only) — log this limitation.
- Homepage regression: `git diff 426493c -- home-page.jsx components/home/* home-page.css chronos-mark.jsx index.css index.html` empty; screenshots and Lighthouse compared to the frozen baseline; recordings before/after.
- Hard cases: reduced motion, 4× CPU, slow 4G, WebGL off, keyboard, fast/repeated navigation, rapid clicks/interruption, resize/orientation, tab hidden/visible, route away/back, leak audit.
- Critique: up to 3 harsh rounds; cut anything that does not earn its place.

## 9. Risks

- The camera pages already have 4.5–6 s TBT and 8.5 MiB model loading; any extra JS must be trivial. Keep motion CSS-first and lazy.
- Recharts default animation may be slow; tune to 420 ms and disable under reduced motion, or disable entirely if it regresses.
- Row presence in the teacher rail can reorder/jank; no layout animation, capped stagger, no exit delay on actions.
- Native `<dialog>` close is instant; accept entrance-only for frequent dialogs. The report can use a 180 ms close delay only if focus return remains correct; otherwise instant.
- The report print is the signature; if it exceeds 700 ms or shifts layout, cut it to a header/TPI/facts print and leave charts static.
- The homepage is frozen; do not add tokens to `.home` or edit its files. Shared tokens live under `.app` or a new `motion.css` that only app pages import.
