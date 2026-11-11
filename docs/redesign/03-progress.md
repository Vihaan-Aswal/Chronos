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
| Foundation (system CSS + primitives) | not started |
| `/teacher` live (pilot) | not started |
| `/signin`, `/signup` | not started |
| `/choose-role` | not started |
| `/readiness` + JoinScreen | not started |
| `/student` live | not started |
| `/records` + report | not started |
| `/teacher` class desk | not started |
| `/meeting`, 404, error boundary | not started |
| Cleanup + final review | not started |

## Skills used
- `impeccable context` (setup), `craft-floor` (before UI edits).
- To run per page: `critique` + `audit` + `polish` passes (recorded per page below).

## Next action
Write `src/styles/app-system.css` and the shared primitives in `src/components/app/`,
then build the pilot `/teacher` live room.
