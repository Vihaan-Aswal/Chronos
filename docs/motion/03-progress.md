# 03 — Progress

**Phase:** 2 — foundation + pilot `/teacher` live complete; pilot calibrated. Next: `/signin`, `/signup`.
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
| `/signin`, `/signup` | next — CSS auth first impression + notices |
| `/choose-role` | not started |
| `/readiness` + JoinScreen | not started |
| `/student` live | not started |
| `/records` + session record | not started |
| `/teacher` desk | not started |
| `/meeting`, 404, error boundary | not started |
| Holistic review / homepage regression | not started |

## Pilot spec — `/teacher` live

- **Rows:** 180 ms entrance, 18 ms stagger, max 8; no exit/layout animation. Instant removal on filter; state badges/dots transition 180 ms.
- **Dialogs:** 180 ms rise/fade; native focus containment; close instant.
- **Rail:** mobile entrance 180 ms; close instant.
- **Live dot:** 2.4 s pulse only when connected; pauses hidden.
- **Action notes:** 180 ms rise.
- **Header/room bar:** 260 ms hairline draw.
- **Fallback:** `?motion=off` / `data-motion="off"` disables all; reduced motion zeroes travel/stagger, keeps 120–180 ms fades.
- **Evidence:** `.impeccable/motion-after/app/pilot-*.png`, 353-frame sequence in `.impeccable/motion-after/app/frames/teacher-live/`, 1x and 4x traces in `.impeccable/motion-after/app/traces/`.

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

## Skills used

- `impeccable context` (setup; loaded PRODUCT, DESIGN, surface brief).
- `reference/animate.md` (motion playbook) and `reference/craft-floor.md` before the plan.
- Baseline capture/audit with Playwright, Lighthouse 12.8.2, CDP traces.

## Next action

Build the foundation in `src/styles/motion.css` + `src/components/motion/` with the exact homepage tokens, a global kill switch, reduced-motion path, and shared primitives. Then build `/teacher` live as the pilot and run pilot calibration before touching any other page.
