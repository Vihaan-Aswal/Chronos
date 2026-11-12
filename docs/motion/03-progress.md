# 03 — Progress

**Phase:** complete — shared system, all app surfaces, pilot calibration, measurement, hardening, homepage regression.
**Branch:** `feat/app-motion-elevation`
**Baseline commit:** `fb5caff` (e2e lint fix) on top of `2c2094c`; homepage frozen at `426493c`.
**Dev server:** `http://localhost:5173` (running); production preview `http://localhost:4174` (running).
**Tests:** 26 Playwright tests pass (baseline, 36.9 s). Build 53.5 s baseline.

## Memory map

| File | Purpose |
|---|---|
| `00-brief.md` | The brief, verbatim |
| `design-language.md` | Homepage tokens/primitives, app inventory, constraints |
| `01-plan.md` | Directions, chosen direction, page specs, budget, build order |
| `02-system.md` | Written after the foundation; usage rules and primitives |
| `03-progress.md` | This file; phase, pages, next action |
| `decisions.md` | Decision log |
| `deviations.md` | Structural deviations (none yet) |
| `credits.md` | Libraries/assets/snippets and licenses |
| `open-questions.md` | Unresolved items / manual checks |
| `baseline.md` | Baseline numbers and artifact paths |

## Pages

| Page | Status |
|---|---|
| Foundation / motion system | done — tokens, switch, reduced motion, primitives |
| `/teacher` live (pilot) | done — CSS row entrance, dialog, rail, live dot; calibrated |
| `/signin`, `/signup` | done — first impression, notices, success |
| `/choose-role` | done — column settle + header rule |
| `/readiness` + JoinScreen | done — panel, checks, result; camera untouched |
| `/student` live | done — state keyed fade, strip, nudge, dialogs, rail |
| `/records` + session record | done — loading rule, rows, report print, charts |
| `/teacher` desk | done — panel + records row |
| `/meeting`, 404, error boundary | done — rule/buttons; stage states static |
| Holistic review / homepage regression | done — screenshots byte-identical; Lighthouse home unchanged/improved |

## Pilot spec — `/teacher` live

- **Rows:** 180 ms entrance, 18 ms stagger, max 8; no exit/layout animation. Instant removal on filter; state badges/dots transition 180 ms.
- **Dialogs:** 180 ms rise/fade; native focus containment; close instant.
- **Rail:** mobile entrance 180 ms; close instant.
- **Live dot:** 2.4 s pulse only when connected; pauses hidden.
- **Action notes:** 180 ms rise.
- **Header/room bar:** 260 ms hairline draw.
- **Fallback:** `?motion=off` / `data-motion="off"` disables all; reduced motion zeroes travel/stagger, keeps 120–180 ms fades.
- **Evidence:** `.impeccable/motion-after/app/pilot-*.png`, 353-frame sequence in `.impeccable/motion-after/app/frames/teacher-live/`, 1x and 4x traces in `.impeccable/motion-after/app/traces/`.

## Page specs — remaining surfaces

- **`/signin`:** h1 static (LCP); aside facts 60 ms stagger / 420 ms; form fields 4 px / 180 ms; provider error notice 180 ms; eye/button feedback 120 ms.
- **`/signup`:** same; inline mismatch 180 ms; success notice + actions 180 ms; 2.2 s redirect unchanged.
- **`/choose-role`:** header rule 260 ms; two columns 180 ms with 18 ms second delay; buttons 120 ms; h1 static.
- **`/readiness`:** panel 180 ms; each check colour/border 180 ms; result notice 180 ms; camera/video untouched; primary button feedback 120 ms.
- **`/student` live:** state title/copy keyed 180 ms; signal cells 180 ms; nudge note 260 ms; liveness/auto-nudge/tab-switch dialogs 180 ms; mobile rail 180 ms; tracker canvas untouched.
- **`/records`:** loading rule 1.2 s loop (static reduced); rows 180 ms + 18 ms stagger; empty/error 180 ms; open button 120 ms.
- **Session record:** sheet 260 ms; header rule 420 ms; facts 180 ms + 60 ms stagger; band scaleX 420 ms; charts 420 ms ease-out; details 180 ms; save notice 180 ms; no section reveal.
- **`/teacher` desk:** readiness panel + records row 180 ms; header rule 260 ms.
- **`/meeting`:** room bar rule 260 ms; stage states static (the stage error is the LCP on this page; no opacity gate).
- **404 / error:** header rule 260 ms; button feedback; no new graphic.

## Pilot calibration

- CSS entrance + stagger reads as a ledger; keep.
- `motion` row presence cost 40.8 kB gzip; cut. CSS-only entrance is 0.56 kB JS + 1.35 kB CSS.
- Layout animation on live rows would churn every score update; cut. Reorder is instant.
- 4× CPU interactions produced no motion-attributable long task; page-load long tasks are the existing camera/video stack.
- CLS after motion on the same trace setup: 0.1065 vs baseline 0.1357; no added shift from rows/dialog.
- Next pages apply the same lessons: CSS first, no presence library, no layout animation.

## Baseline artifacts (gitignored)

- `.impeccable/motion-baseline/app/screenshots/` — 70 stills at 375/768/1280/1920 plus states.
- `.impeccable/motion-baseline/app/lighthouse-*.json` — desktop for 10 pages, mobile for 7 non-camera pages.
- `.impeccable/motion-baseline/app/traces/` — signin error, teacher live, student nudge, records report.
- `.impeccable/motion-baseline/app/dist-assets.json` — 3,699,783 raw / 1,027,691 gzip total; main JS 3,090,327 / 859,607; CSS 83,651 / 15,131.
- `.impeccable/motion-baseline/app/audit-baseline.txt` — 48 page/width combinations clean.
- `.impeccable/motion-baseline/app-tests-baseline.txt` — 26 passed.
- `.impeccable/motion-baseline/` — frozen homepage baseline (from the prior motion plan).

## After measurement (production preview)

- **Bundle:** main JS 3,092.31 kB raw / 862.86 kB gzip vs 3,090.33 / 862.30 baseline: **+1.98 kB raw / +0.56 kB gzip**. All JS gzip **+0.57 kB**; CSS 92,989 raw / 16,514 gzip vs 83,651 / 15,131: **+1.38 kB gzip**. Total dist gzip **1,029,631 vs 1,027,691: +1.94 kB**. No new runtime dependency.
- **Lighthouse perf:** desktop 96→95 signin, 96→95 choose, 65→64 readiness, 96→96 meeting, 95→95 records, 96→96 signup, 62→65 teacher desk, 63→65 student join; mobile 65→65 signin/signup/records, 64→64 meeting, 65→65 404, 65→64 choose. All within ±2 except improvements on camera pages.
- **LCP:** all LCP elements are static headings/paragraphs; meeting LCP fixed from 5.91 s → 5.76 s by removing the stage opacity gate. Remaining deltas (+37–149 ms) are Lighthouse run variance on static LCP elements.
- **CLS:** no added shift; records mobile 0, choose mobile 0.008 (baseline 0.011), readiness desktop 0.0002. Comparable traces: teacher 0.1357 and student 0.1609, the same as baseline (the earlier pilot 1× run's 0.1065 was a different capture, not the comparison trace).
- **TBT:** no regression; camera pages improved (readiness 6,045→3,446; teacher desk 4,885→3,748; student 4,477→3,634).
- **Homepage regression:** homepage screenshots at 375/768/1280/1920 are **byte-identical** (SHA-256) to the baseline; `git diff 426493c -- home-page.jsx components/home home-page.css chronos-mark.jsx index.css index.html` is empty. Lighthouse home 89 desktop / 64 mobile (baseline 89/59; variance, frozen code).
- **Tests:** 26 Playwright tests pass with reduced motion emulated; no new console errors beyond the existing 100ms `unload` policy entry.
- **Evidence:** `.impeccable/motion-after/app/screenshots/` (70 stills), `frames/` (teacher live 353, signin 57, signup 55, choose 18, readiness 52, student nudge 123, record print 79), `traces/` (teacher 1×/4×, signin, student, records), Lighthouse JSON + `lighthouse-compare.json`.
- **Static design:** all 70 after screenshots have the same dimensions as baseline; visual diff is limited to 1px header rules/text antialiasing, not layout or copy.
- **Hardening:** reduced motion (`rise 0`, rules/loops off), `?motion=off` (all animations/transitions none), 4× CPU, WebGL off (no motion errors, 0 overflow), rapid 10× filter + 3× dialog interruption (3 rows, no open dialog), 375→1280 resize (0 overflow), hidden-tab pause (`animation-play-state: paused`), 14-route fast loop (no console errors). Evidence: `.impeccable/motion-after/app/hardening.json`.
- **Deviation:** `D-M-DEV1` fixes the student nudge toast's inherited 100vh height; the note now sits at the intended `bottom: 24px` and the private-nudge motion is visible.

## Skills used

- `impeccable context` (setup; loaded PRODUCT, DESIGN, surface brief).
- `reference/animate.md` (motion playbook) and `reference/craft-floor.md` before the plan.
- Baseline capture/audit with Playwright, Lighthouse 12.8.2, CDP traces.

## Next action

Build the foundation in `src/styles/motion.css` + `src/components/motion/` with the exact homepage tokens, a global kill switch, reduced-motion path, and shared primitives. Then build `/teacher` live as the pilot and run pilot calibration before touching any other page.
