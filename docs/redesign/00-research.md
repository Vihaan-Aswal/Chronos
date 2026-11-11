# 00 — Research and inventory

Phase 1 output. Nothing in this phase changed product behaviour except the dev-only
`?preview=live` fixture (logged in `decisions.md`), needed to capture the live shells.

## Stack and routing

- React 18 + Vite 7, react-router-dom 7, Tailwind 3 (utility classes on legacy pages),
  hand-written CSS for the homepage (`home-page.css`) and the legacy dashboards.
- Fonts: Newsreader + Manrope + Material Symbols, loaded from Google Fonts in `index.html`.
- Charts: Recharts. PDF: jsPDF. Video: 100ms SDK (`@100mslive/react-sdk`).
- Auth: Supabase email/password, mirrored into `sessionStorage.chronos_user`;
  `AuthGuard` accepts that mirror or a live Supabase session.
- Data: FastAPI backend over REST + WebSocket (`/ws/teacher/:session`, `/ws/engagement/:session/:user`).

| Route | Component | Guard | Notes |
|---|---|---|---|
| `/` | `home-page.jsx` | none | **Frozen.** Signed-out persuasion surface. |
| `/signin` | `sign-in-page.jsx` | none | Supabase password sign-in. |
| `/signup` | `sign-up-page.jsx` | none | Supabase sign-up, then redirect to sign-in. |
| `/choose-role` | `choose-role-page.jsx` | AuthGuard | Writes `chronos_role`, routes to readiness. |
| `/readiness` | `readiness-page.jsx` + `join-screen.jsx` | AuthGuard | Camera + face + identity check before class. |
| `/student` | `student-page.jsx` | AuthGuard | Join screen → live meeting + own tracking rail. |
| `/teacher` | `teacher-page.jsx` | AuthGuard | Join screen → live dashboard + report. |
| `/meeting` | `meeting-room.jsx` | none | Bare video room for `?user=`; no chrome. |
| `*` | — | — | **No route. Unknown URLs render a blank page.** |

No settings, legal, help, email templates, or maintenance pages exist in the repo.
Dead hrefs (`#`) stand in for Support / Archive / Privacy / Terms / Forgot password.

## What each page is for

### `/signin`
- **Job:** get an existing teacher or student back into the product.
- **Content:** "Fair signals, not surveillance." + form (email, password, show password, forgot link) + sign-up link.
- **States:** default, loading, error (Supabase message). No success state (navigates).
- **Arrives from:** home "Sign in", footer, auth redirects. **Leaves to:** `/choose-role`.
- **Wrong today:** midnight-navy world that is not the homepage; 96px italic headline overwhelms the task; 9px labels; 10px low-contrast "forgot password"; glass card and glow blobs; decorative SVG wave; the form is visually secondary; the page is 100vh with a fixed footer that overlaps content on short screens; "Forgot password" is a dead `#` link.

### `/signup`
- **Job:** create an account, then sign in.
- **Content:** same hero, form (email, password, confirm, show), success notice, sign-in link.
- **States:** default, loading, password mismatch, auth error, success + 2.2s redirect.
- **Wrong today:** parchment world (third palette in three screens); same oversized hero; inline-style soup; success notice is easy to miss and the auto-redirect is abrupt; no password guidance (Supabase enforces its own minimum and the error is raw); no terms line.

### `/choose-role`
- **Job:** one routing decision: teach or learn.
- **Content:** two large cards, "Educator Access / Learner Access", "Initialize Portal / Enter Session", sign-out.
- **States:** default only. No loading, no error.
- **Wrong today:** jargon ("Initialize Portal", "modern classroom synthesis", "Archival Systems"); card-in-card watermark icons; fake badges; a hamburger that does nothing; dead Support/Archive links; desktop header on mobile is a dark bar with an icon that has no menu; no explanation of what happens next; not the homepage's voice.

### `/readiness`
- **Job:** prove the camera works and the face is centered/lit before class; verify identity.
- **Content:** title, "joining as X", camera preview with face guide, checklist (face, centered, lighting), verify button, retry, privacy note.
- **States:** camera initialising, permission denied/error, no face, off-centre, too dark/bright, ready, verifying, identity registered / verified / uncertain / failed (native `alert`/`confirm`), missing role → redirect.
- **Wrong today:** the 16:9 camera panel and 4:3 checklist card sit at different heights with a large dead area; the face guide is a floating dashed blob; the status rows use the wrong icon semantics (a check-circle shows even when not ready); "Adjust your position" is a grey disabled button with no explanation of which item is missing; `alert()` and `confirm()` break the product voice; the page header/footer are the midnight world; the privacy note is 12px grey.

### `/student` (join state)
- Same JoinScreen, full-bleed with no page chrome, then the live view.

### `/student` (live)
- **Job:** attend the class, see your own state, receive a private nudge, never see a grade.
- **Content:** topbar (Chronos, session, user, connection), session strip (session id, "student view", tracking panel toggle), video stage, optional right rail with the live tracker canvas + identity alert + auto-nudge/liveness/tab-switch modals, reconnect banner, nudge toast.
- **States:** join, connecting, live, tracker closed/open, WS lost/reconnecting, nudge received, identity mismatch, liveness challenge, strict-mode tab warning, session expired.
- **Wrong today:** midnight console; 8px labels; the tracking rail is hidden by default with a tiny "Tracking Panel" chip; canvas draws its own 720×540 HUD in system-ui with raw metrics ("Head: yaw 0.02") that no student can use; "SD" abbreviations; no statement of what is measured; empty dark stage dominates; mobile untested.

### `/teacher` (pre-class)
- **Job:** start a class, or reopen a past session record.
- **Content:** JoinScreen (camera check) + a "Past Sessions" button in the corner; Past Sessions modal; report overlay.
- **States:** join, loading past sessions, empty past sessions, list, selected report, error (console only).
- **Wrong today:** the readiness flow is duplicated but wrapped in an unrelated indigo gradient; Past Sessions is a floating pill disconnected from the flow; the modal is generic slate; no explanation of what a session is or what happens after joining.

### `/teacher` (live)
- **Job:** run the room — see who needs attention, act, and end with a record.
- **Content:** topbar (brand, session, live badge, class/exam, strict/normal, simulate, check engagement all), status strip (session, timer, present/attentive/distracted/critical, legend, dashboard toggle), video stage with student tiles, right rail (summary counts, priority/all filter, student cards with mark engaged / message / ignore / remove / verify / nudge), end session.
- **States:** live with students, live with no students (empty rail), flagged-only empty ("All clear"), disconnected/reconnecting, rail open/closed, liveness sending, identity mismatch, multi-face, tab switch, strikes, simulated cohort, session ended → report.
- **Wrong today:** the rail is closed by default so the primary job (notice who needs help) is hidden behind a toggle; the stage has no "room" reading; type is 8–10px; controls are pill-shaped in a system whose buttons are square; "Check engagement (all)" is an unexplained star; the only way to end the session is inside the third-party video control, which disappears when video fails; mobile is unusable (header overflows, KPIs clip, rail unreachable); empty stage is a black void.

### `/teacher` → SessionReport
- **Job:** the post-class record: what happened, who needs follow-up, what to save/export.
- **Content:** duration, average engagement, learners (live/simulated), TPI, attention heatmap, engagement timeline, attention distribution pie, vs-class-average pie, confusion hotspots, per-student timelines, at-risk list, recommendation, Export PDF / Close / Save report.
- **States:** live report, past report (no save), no timeline, no distribution, no hotspots, no at-risk, per-student collapsed/expanded.
- **Wrong today:** a dark analytics dashboard, not a record; eight card surfaces with glow; TPI formula in 12px grey; "Excellent/Balanced/Needs Support" labels are invented judgement; save uses `alert`; Close forces `window.location.href = "/"`; charts use saturated mint/blue/violet unrelated to the state palette; the recommendation is a generic blue banner.

### `/meeting`
- Bare video room: no brand, no way back except browser back, `onLeave` calls `history.back()`.

## User journeys (as built)

1. **Teacher first run:** home → Host a class → sign up → sign in → choose role → readiness (camera, identity) → live dashboard → end session → report → save → home.
2. **Teacher return:** sign in → choose role → readiness → live. Past sessions only from the pre-class screen.
3. **Student:** sign in/sign up → choose role → readiness → live. There is no invite-link route; the class is the backend-configured room.
4. **Visitor:** home only. All CTAs go to sign-up/sign-in.

Friction found: role choice is asked on every visit even though it is known from the account's last choice; readiness is repeated for both roles with no explanation; the teacher must complete a camera check to reach the dashboard even when they only want past sessions; there is no persistent way home or to sign out from the live views (sign-out lives on choose-role); error recovery is native dialogs.

## Data and functionality behind each page

- `JoinScreen`: `getUserMedia`, MediaPipe FaceLandmarker (CDN wasm + model), brightness sampling, 112×112 crop, 128-d embedding, `GET/POST /identity` via `api/identity.js`.
- `EngagementTracker`: same camera + face mesh, EAR/gaze/head-pose scoring, identity re-checks every 2–5 min, WS send of metrics, auto-nudge, liveness challenges, tab-switch detection, strict/exam rules.
- `TeacherPage`: teacher WS roster, actions `POST /session/teacher-action`, liveness `POST /session/liveness-check`, mode `POST /session/set-mode`, context `POST /session/set-class-context`, analytics list `GET /session/analytics/list`, report `GET /session/:id/analytics`, save `POST /session/save-analytics`, simulator hook.
- `SessionReport`: pure presentation of `sessionData` + jsPDF export.
- `HMSMeeting`: 100ms token from `VITE_HMS_TOKEN_ENDPOINT`, peers, mic/cam/leave, teacher stage tiles.

## Baseline evidence

- Screenshots (36): `main/app/frontend/.impeccable/redesign/baseline/` at 375/768/1280/1920.
  Live shells captured with mocked teacher WebSocket; video stage shows its real
  "Failed to fetch" error because no 100ms token endpoint runs locally.
- Lighthouse (desktop preset, production preview): home 98/100/96/91,
  signin 88/96/96/91, signup 88/96/96/91 (perf/a11y/best-practices/SEO).
- Bundle: `dist` main JS 3,240.79 kB (gzip 908.20 kB), CSS 109.63 kB (gzip 20.61 kB).
- Tests: none existed. Playwright 1.65 + `@playwright/test` added as a dev dependency;
  `e2e/` now holds the smoke suite and the capture tool.

## What the product needs from every page

1. The homepage's material world: cream ground, forest fields, sage, ink, gold hairlines, Newsreader + Manrope.
2. One obvious action per screen, with the rest of the page organised around it.
3. A calm, humane statement of what is measured and what is not, repeated where it matters (readiness, student rail, report).
4. States that explain themselves: why the button is disabled, what to do when the camera fails, what an empty rail means, what "all clear" means.
5. Working density: app pages may be tighter than the homepage but never 8px type or unlabelled icons.
6. A way back: home, sign out, and end session always reachable.
7. No invented claims, no dead links, no native dialogs, no jargon.
