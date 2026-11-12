# Baseline — app pages before motion

Branch: `feat/app-motion-elevation`  
Baseline commit: `fb5caff` (e2e Node-globals fix) on `2c2094c`  
Homepage frozen: `426493c7ffd874b32a8c9cdf4f2b882b14fdf0de`  
Artifacts: `.impeccable/motion-baseline/app/` (gitignored)

## Bundle

- Main JS: **3,090.33 kB raw / 862.30 kB gzip** (Vite); zlib-9: 3,090,327 / 859,607 B.
- CSS: **83.65 kB / 15.25 kB gzip**; zlib-9: 83,651 / 15,131 B.
- Total dist (zlib-9): **3,699,783 B raw / 1,027,691 B gzip**.
- No new runtime dependencies in this pass.

## Lighthouse 12.8.2 — desktop (production preview)

| Page | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| home | 89 | 100 | 96 | 91 | 1.5 s | 0.002 | 0 ms |
| signin | 96 | 100 | 96 | 91 | 1.1 s | 0.001 | 0 ms |
| signup | 96 | 100 | 96 | 91 | 1.1 s | 0.001 | 0 ms |
| choose-role | 96 | 100 | 96 | 91 | 1.1 s | 0.004 | 0 ms |
| records | 95 | 100 | 96 | 91 | 1.2 s | 0.001 | 0 ms |
| meeting | 96 | 100 | 96 | 91 | 1.1 s | 0.006 | 0 ms |
| not-found | 96 | 100 | 96 | 91 | 1.1 s | 0.001 | 0 ms |
| readiness | 65 | 100 | 96 | 91 | 1.1 s | 0.006 | 6,050 ms |
| teacher desk | 62 | 100 | 96 | 91 | 1.4 s | 0.008 | 4,890 ms |
| student join | 63 | 100 | 96 | 91 | 1.4 s | 0.000 | 4,480 ms |

## Lighthouse — mobile (production preview)

| Page | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| home | 59 | 100 | 96 | 91 | 6.1 s | 0.002 | 240 ms |
| signin | 65 | 100 | 96 | 91 | 5.6 s | 0.000 | 70 ms |
| signup | 65 | 100 | 96 | 91 | 5.6 s | 0.000 | 60 ms |
| choose-role | 65 | 100 | 96 | 91 | 5.7 s | 0.011 | 0 ms |
| records | 65 | 100 | 96 | 91 | 5.7 s | 0.001 | 10 ms |
| meeting | 64 | 100 | 93 | 91 | 5.9 s | 0.000 | 50 ms |
| not-found | 65 | 100 | 96 | 91 | 5.6 s | 0.000 | 30 ms |

Mobile skipped for readiness/teacher/student: JoinScreen's MediaPipe/face-api stack dominates (8.5 MiB, ~42 s TTI). Desktop values stand in.

## Traces (dev server, reduced motion)

| Interaction | Long tasks | Layout shifts | Shift value |
|---|---:|---:|---:|
| signin error | 1 (227 ms) | 2 | 0.0012 |
| teacher live filter + mark engaged | 3 (221/304/323 ms) | 4 | 0.1357 |
| student live nudge | 8 (65–239 ms) | 4 | 0.1609 |
| records open + details | 4 (59–232 ms) | 3 | 0.0006 |

The live-shell shifts come from the existing video/stage load, not new UI. Motion must add no shifts.

## Audit and tests

- 48 page/width combinations (375/768/1280/1920): no overflow, no nameless controls, no heading skips, no unexpected console errors.
- Known console entry: `Permissions policy violation: unload is not allowed in this document.` (100ms SDK).
- 26 Playwright tests pass (36.9 s), reduced motion emulated, fake camera.
- Build 53.5 s; lint 0 errors / 6 pre-existing hook warnings.

## Screenshots

70 stills at `.impeccable/motion-baseline/app/screenshots/`: all pages at 375/768/1280/1920 plus signin error, readiness denied, records report, teacher dialogs, empty live room, student nudge.

## Known limitations

- Live shells are `import.meta.env.DEV` only; no production Lighthouse. Dev traces used.
- Real 100ms video tiles/token endpoint unavailable; stage error states captured.
- Error boundary not reachable without a render crash; code-reviewed only.
