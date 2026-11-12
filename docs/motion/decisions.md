# Decisions

Format: decision — alternatives — reason. Newest first.

## D-M1 — Build the app motion system from the homepage plan; do not modify the homepage
- **Alternatives:** (A) implement the homepage motion plan first, then extend it; (B) build a separate app motion language; (C) do nothing to the homepage and treat the plan as the contract.
- **Reason:** the homepage code is frozen and byte-identical to `426493c`; its motion plan exists but was never merged. The plan's tokens are the committed language, so the app pages adopt them exactly in a central `motion.css`/`motion` module the homepage can later import. No second set of easings or durations.
- **Cost:** the homepage remains static for now; the shared system is app-first. Logged as a known gap, not a redesign.

## D-M2 — Direction: “The Record Writes Itself”
- **Alternatives:** (B) “The Signal Field” — expressive signal graphics/meters; (C) “The Quiet Tool” — micro-feedback only.
- **Reason:** A is the only direction that comes from the product (a record, a room, a signal) and extends the homepage's paper/ink/signal language. It gives working UI fast feedback and reserves the authored moment for the post-class record. B risks turning a calm tool into a dashboard and adds per-frame graphics; C fails the “alive and premium” half of the brief. C is the fallback if A fails the perf budget twice.
- **Cost:** CSS + the already-installed `motion`; no new dependency.

## D-M3 — App calibration: fast by default, authored only at rare moments
- **Alternatives:** use the homepage's 620 ms settle and 420 ms nudge ring on app pages; use only 120 ms everywhere.
- **Reason:** working screens are used repeatedly. 120/180/260 ms carry feedback, panels and dialogs; 420/620/700 ms are reserved for auth first impression and the report print. No ambient loop behind dense UI. This keeps the same language without making the tools slow.

## D-M4 — No new runtime dependencies
- **Alternatives:** GSAP, Motion One, AutoAnimate, three.js, Lottie.
- **Reason:** `motion` 12.38 is installed and already in the main bundle; CSS covers the declarative states. A second library duplicates the job and adds bundle/maintenance risk. No 3D/WebGL is needed for the chosen direction.

## D-M5 — Route transition = the header rule draws, not a page fade-up
- **Alternatives:** full-page fade/slide via `AnimatePresence`; shared-element page transitions; no transition.
- **Reason:** a full-page fade is the generic template the brief forbids and can delay the new page. Drawing the existing header/room-bar hairline gives orientation in 260 ms without touching layout, LCP, or focus. Page content is visible immediately.

## D-M6 — Native dialogs animate entrance only; close is instant
- **Alternatives:** delay `dialog.close()` to play an exit; custom portal with exit presence.
- **Reason:** frequent dialogs must not delay focus return or input. Entrance (180 ms rise + backdrop fade) is enough. The report overlay is the only place where a longer authored entrance is allowed, and its close remains immediate unless a safe exit is proven.

## D-M7 — The session record is the signature centerpiece
- **Alternatives:** the live rail; the auth page; a new 3D graphic.
- **Reason:** the post-class record is the product's emotional payoff and the homepage's “record print” idea. It is rare, so it can afford 420–700 ms. The live rail is the frequent language: rows settle, filters swap, actions confirm, but nothing loops or delays.

## D-M8 — One global motion switch
- **Alternatives:** per-component flags; test-only CSS; no switch.
- **Reason:** the brief requires a single disable/tone-down switch for QA and the user. `data-motion="off"` / `"reduced"` on `<html>`, plus `?motion=off`, disables transitions/animations and chart animation; `window.chronosMotion` exposes the same for manual tests. Reduced motion remains a genuinely calm path, not a half-disabled one.

## D-M9 — No new layout, copy, or decorative graphics
- **Alternatives:** add a 3D paper graphic to auth/404/empty states.
- **Reason:** the static redesign is final. Motion uses the existing elements and boundaries. The “graphics” in the brief are served by the existing live room, charts, signal strip and paper surfaces, not by new decoration. Any structural tweak would be logged in `deviations.md`; none is planned.

## D-M10 — Baseline limitations
- **Alternatives:** fake production fixtures for live shells; skip Lighthouse; add a production preview flag.
- **Reason:** `/teacher?preview=live` and `/student?preview=live` are `import.meta.env.DEV` only; production Lighthouse cannot reach them without changing functionality. Baseline uses production Lighthouse for static pages and dev-server Playwright/CDP traces for live shells. Mobile Lighthouse is skipped for `/readiness`, `/teacher`, `/student` because the existing MediaPipe/face-api stack dominates (8.5 MiB, ~42 s TTI); desktop runs are recorded. This is a measurement limitation, not a product change.

## D-M12 — Rows use CSS entrance, not `motion` presence
- **Alternatives:** `motion.li` + `AnimatePresence` for entrance/exit/reorder; CSS entrance only.
- **Reason:** importing `motion` for row components grew the main chunk by ~40.8 kB gzip, far over the 6 kB JS budget. The brief prioritises the existing budget and frequent-action speed. CSS gives the 180 ms entrance with 18 ms stagger; removal is instant. The row reorder in a live roster is data-driven every few seconds; animating it would make the working tool busy.
- **Cost:** no exit animation on filter change; instant removal is acceptable for a frequent filter. The report/auth moments still carry the authored motion.

## D-M13 — No layout animation on the teacher roster
- **Alternatives:** `layout`/FLIP on rows so severity reordering animates.
- **Reason:** the roster re-sorts from live scores; animating every reorder would be distracting and could cause scroll jitter. Rows enter; state badges/dots transition; filters swap. Position changes are instant.

## D-M14 — Reduced-motion auth facts run at 180 ms
- **Alternatives:** keep the 420 ms fact stagger; remove the animation entirely.
- **Reason:** reduced motion should be calm, not slow. The facts keep a short fade (no travel) at 180 ms; the h1 remains static.

## D-M11 — Baseline branch and homepage hash
- **Alternatives:** branch from `426493c`; branch from `2c2094c` without the e2e fix.
- **Reason:** the current tree is the redesigned app at `2c2094c` plus the e2e Node-globals lint fix; commit that fix as `fb5caff`, then branch `feat/app-motion-elevation`. Homepage frozen hash: `426493c7ffd874b32a8c9cdf4f2b882b14fdf0de`. Homepage files verified byte-identical.
