# Progress

**Phase:** 3 — design system foundation (next: pilot `/teacher` live room)
**Branch:** `redesign/app-pages`
**Homepage commit (frozen):** `426493c7ffd874b32a8c9cdf4f2b882b14fdf0de` on `feat/homepage-motion-elevation`
**Homepage files (do not edit):** `src/pages/home-page.jsx`, `src/styles/home-page.css`,
`src/components/home/*`, `src/components/chronos-mark.jsx` (shared read-only),
`src/index.css` (Tailwind + legacy tokens — new work must not change it).

## How to run
- Dev server: `cd main/app/frontend && npm run dev` (currently on **http://localhost:5176**; Vite picks the next free port).
- Production preview: `npm run preview -- --port 4173`.
- Build: `npm run build`. Lint: `npm run lint`.
- E2E: `npx playwright test` (config in `e2e/`, dev server expected at `http://localhost:5176`).
- Capture: `node e2e/capture.mjs <outDir> <baseUrl>`.
- Mock auth: seed `sessionStorage.chronos_user = {id,email}` and `chronos_role`.
- Dev-only live fixture: `/teacher?preview=live`, `/student?preview=live` (DEV builds only).

## Artifacts (outside version control)
- Baseline screenshots (36): `main/app/frontend/.impeccable/redesign/baseline/`
- Baseline Lighthouse JSON: `main/app/frontend/.impeccable/redesign/lighthouse-baseline/`
- Baseline bundle: JS 3,240.79 kB (gzip 908.20), CSS 109.63 kB (gzip 20.61)
- Baseline Lighthouse: home 98/100/96/91 · signin 88/96/96/91 · signup 88/96/96/91

## Pages
| Page | Status |
|---|---|
| Foundation (system CSS + primitives) | done |
| `/teacher` live (pilot) | done — pilot calibration recorded in `decisions.md` |
| `/signin`, `/signup` | done |
| `/choose-role` | done |
| `/readiness` + JoinScreen | done |
| `/student` live | done |
| `/records` + report | done |
| `/teacher` class desk | done |
| `/meeting`, 404, error boundary | done |
| Cleanup + final review | in progress — legacy CSS/components removed, final audit next |

## Skills used
- `impeccable context` (setup), `craft-floor` (before UI edits).
- Pilot critique: craft-floor checks (contrast, spacing, states, browser surfaces) + homepage comparison; findings recorded in `decisions.md`.
- Page critiques: records/report, student room, auth, readiness; fixes recorded in `decisions.md` D24–D30.

## Next action
Phase 5: homepage regression proof, full-page overflow/console audit at 375/768/1280/1920,
Lighthouse + bundle comparison, final critique, then update the report docs and commit.

