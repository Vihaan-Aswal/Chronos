# 05 — Final report

## 1. New product structure and flow

```
/                    home (frozen, signed out)
├── /signin          sign in
├── /signup          create account
└── /choose-role     teach or learn (auth)
    ├── /readiness   camera + identity gate (auth)
    │   ├── /teacher class desk → live room
    │   └── /student join → live room
    ├── /teacher     class desk (start a class, open records)
    ├── /records     past session records (teacher)   ← additive
    └── /meeting     bare room for ?user=
*                    not found
```

The homepage is the design source of truth and is untouched. The app pages now read as the
same product: cream paper, forest fields, sage state, ink type, gold hairlines, Newsreader
for the record's voice, Manrope for every operational label. Working pages are denser than
the homepage but keep the same material world and the same claims.

Two flow fixes drove the IA:
- **Records were unreachable** without passing the camera gate and auto-joining a class.
  `/records` is now a real page, linked from the teacher header and the class desk.
- **Ending a session was only possible inside the third-party video control**, which
  disappears when video fails. The teacher room now has a visible "End session" with a
  confirmation.

The role fork stays explicit (it is a sessionStorage routing decision, not an account fact),
but it is now a ruled two-column choice instead of a card grid with jargon.

## 2. Page by page

| Page | What changed and why |
|---|---|
| `/signin` | Replaced the midnight/glass world with a forest door + cream form. Provider errors are in-page (focus moves to the alert), the password eye is labelled, and the dead "Forgot password" link is gone. Perf 88→100, a11y 96→100. |
| `/signup` | Same shell; password mismatch is inline at the confirm field, provider errors are a ruled panel, success is a readable state with "Go to sign in" while keeping the 2.2s redirect. |
| `/choose-role` | Cards and fake badges replaced by a ruled fork: two columns, three facts each, one square action per role, no jargon ("Initialize Portal" → "Continue as teacher"). |
| `/readiness` | Rebuilt as "Before you join": camera panel + three-check ledger. Every state explains itself (camera off, no face, off-centre, too dark/bright, checking). Native alerts/confirms replaced with in-product identity outcomes; thresholds and API calls unchanged. |
| `/teacher` desk | The indigo join screen is now the same readiness panel in the paper shell, with a "Session records" row and a Records link in the header. |
| `/teacher` live | Forest room bar, cream KPI strip, cream rail with ruled student rows. Rail open by default ≥1200; filters "Needs attention / All students"; six row actions with accessible names; message composer replaces `window.prompt`; remove and end-session confirmations; visible end-session control; NO_DATA state; designed stage loading/error/empty states; mobile KPI grid. |
| `/student` live | Forest room bar + cream "Your signals" rail: current band in serif, one-line meaning, a 20-check history strip, identity/session/camera facts, and the camera check. The tracker now paints the student's own camera with one readable state instead of raw yaw/EAR text. Nudge is a ruled note, not a toast with an emoji. |
| `/records` | New paper ledger of past sessions: date, session, learners, duration, mean, TPI, one "Open record" action per row. Loading, error + retry, empty, and student-gate states. |
| Session record | Rebuilt as a record, not a dashboard: forest header, a serif sentence + ruled fact table (no hero-metric cards), attention over time, a ruled band distribution, class-mean comparison, confusion moments, per-student detail, follow-up list, in-product save state. Bands replace "Excellent/Balanced/Needs Support"; TPI states its formula and "not a student grade". Native `<dialog>` for focus containment. |
| `/meeting` | Bare room now has the forest room bar (brand, meeting, leave) instead of no chrome. `?user=` contract untouched. |
| 404 / error | New "not in the record" page and a route error boundary with reload/home, so a wrong URL or a render crash never shows a blank page. |

## 3. Decisions, deviations, placeholders

- **Decisions:** `docs/redesign/decisions.md` (D1–D33). The load-bearing ones: add `/records`
  (D1), dev-only live preview (D2), in-product dialogs (D4/D25), visible end session (D5),
  rails open by default (D6), report as a record (D8/D27/D28), native dialog for the record
  (D31), no new runtime dependencies (D21), legacy UI removed (D29).
- **Deviations:** `docs/redesign/deviations.md` — the old `UI_plan` Stitch screens are
  replaced; README's "Copy Link" control does not exist and was not invented; the
  JoinScreen wrapper keeps its contract; decorative entrance motion is removed while the
  tracker's functional loop stays.
- **Placeholders:** `docs/redesign/placeholders.md` — no invented copy. The only fixtures
  are the DEV-only `?preview=live` and the existing "Simulated (demo)" cohort. Missing real
  content (legal, support, password reset) is listed as a proposal, not filled with prose.

## 4. Functionality, routes, APIs

- **Routes added:** `/records` (additive), `*` 404. No existing route removed or renamed; no
  redirects needed.
- **APIs:** unchanged. `/records` uses the existing `GET /session/analytics/list` and
  `GET /session/:id/analytics`; save uses the same `POST /session/save-analytics` payload.
- **Behaviour changes, all within existing functionality:**
  - Save record shows an inline "Record saved." instead of `alert` + forced reload.
  - Close record and student leave use the router instead of `window.location.href`
    (same destination).
  - Message composer replaces `window.prompt`; same `teacher/action` call.
  - Remove and end session confirm in-product; end session also triggers the existing
    HMS leave path, so it works when video failed.
  - Readiness outcomes replace `alert`/`confirm`; same thresholds (0.55/0.65) and calls.
  - Rails default open on wide screens; toggles remain.
  - The teacher roster shows "No data" for `presence === "no_face"` instead of "Away".
- **Proposals for review:** `docs/redesign/04-open-questions.md` — password reset, legal/
  support pages, invite link, persisted role, student history, session naming, camera-less
  participation, save idempotency, local video stub, consent copy.

## 5. Evidence

- **Baseline:** 36 screenshots at `main/app/frontend/.impeccable/redesign/baseline/`.
- **Final:** 36 screenshots at `main/app/frontend/.impeccable/redesign/final/` (375/768/1280/1920)
  plus 19 state shots at `.impeccable/redesign/states/` (records, report, dialogs, all-clear,
  empty, signup success/error, camera denied).
- **Lighthouse (desktop, production preview):**
  - home 98 / 100 / 96 / 91 (perf/a11y/BP/SEO), LCP 0.5s — unchanged from baseline.
  - signin 100 / 100 / 96 / 91, LCP 0.5s — baseline 88 / 96 / 96 / 91, LCP 2.2s.
  - signup 100 / 100 / 96 / 91, LCP 0.5s — baseline 88 / 96 / 96 / 91, LCP 2.2s.
- **Bundle:** JS 3,090.33 kB (gzip 862.30) vs baseline 3,240.79 (908.20);
  CSS 83.60 kB (gzip 15.25) vs 109.63 (20.61). No new runtime dependencies.
- **Tests:** 26 Playwright tests pass (auth, guard, role choice, readiness, teacher room,
  student room, records, 404, desk). Run:
  `cd main/app/frontend && npx playwright test --config e2e/playwright.config.js`.
- **Audit:** 48 route/width combinations checked for horizontal overflow, nameless controls,
  heading order, and unexpected console errors — all clean. Contrast pairs measured; all
  text/surface pairs pass AA (most AAA).
- **Homepage regression:** `git diff 426493c --` on `home-page.jsx`, `home-page.css`,
  `components/home/*`, `chronos-mark.jsx`, `index.css`, `index.html` is empty. Final
  screenshots match the baseline; the only variance is a 30px sample-room height that also
  appears between two fresh captures of the unchanged page (baseline capture artifact).

## 6. Known limitations / manual checks

- **Local video:** no 100ms token endpoint runs here, so every live screenshot shows the
  designed "video room did not open" state. The real peer tiles and the teacher stage with
  live peers were not visually verified against a real room. Manual check: run the backend
  token endpoint, join with two accounts, confirm the tiles, mute/camera/leave controls.
- **Readiness success:** the fake camera has no face, so "ready" and identity success were
  verified by logic/tests, not by a screenshot. Manual check: use a real camera and a
  registered account; confirm the ready state, the identity outcomes, and the join.
- **Third-party console warning:** the 100ms SDK logs a "Permissions policy violation:
  unload" warning. It is not from the new UI and does not affect behaviour.
- **Lint warnings:** 6 pre-existing `react-hooks/exhaustive-deps` warnings in
  `engagement-tracker.jsx` and `use-classroom-simulator.js`; 0 errors. They are functional
  loops with intentional dependency arrays.
- **Auth error copy** comes from Supabase verbatim (e.g. "User already registered"). If the
  product wants friendlier mapping, that is a copy decision.
- **Student identity "Not enrolled"** appears when the identity endpoint is unreachable; it
  is the existing status, shown honestly.
- **Baseline capture variance:** see section 5; the source is unchanged.

## 7. Animation-pass readiness

- The new pages are static on purpose; only hover/focus/pressed colour changes exist. No
  entrance animations, no transitions that would fight the homepage's future motion system.
- Stable blocks for the motion pass: `.auth-aside` / `.auth-form`, `.choose-col`,
  `.ready-stage` / `.ready-panel`, `.room-bar`, `.room-kpis`, `.room-stage-shell`,
  `.room-rail`, `.room-row`, `.signal-state`, `.rec-section`, `.rec-fact`, `.rec-figure`.
- The teacher rail rows and the student history strip are data-driven `<li>`/`<span>` grids
  with stable keys, so a later pass can animate a row entering or a history cell filling
  without markup changes.
- The session record is a native `<dialog>`; the later pass can animate the dialog/backdrop
  with the homepage's system without restructuring it.
- The tracker's `requestAnimationFrame` canvas loop is functional (camera/face), separate
  from page motion; do not animate the page around it in a way that repaints the canvas.
