# Decisions

Format: decision — alternatives considered — reason. Newest first.

## D1 — Keep the route map; add `/records` for teacher records
- **Alternatives:** (B) infer role from account and merge readiness into the live room, records in a drawer; (C) one `/classroom` route with Live / Records / Readiness tabs.
- **Reason:** A keeps every deep link (`/teacher?sessionId=`, `/student`), needs no auth or data change, and fixes a real dead end: past records were unreachable without passing the camera gate and auto-joining a class. B needs a persisted role (data change) and hides the pre-class moment. C is route surgery for a cosmetic gain.
- **Cost:** one additive route and page, using the existing analytics API.

## D2 — Dev-only `?preview=live` fixture on `/teacher` and `/student`
- **Alternatives:** no fixture (cannot screenshot the live shells at all); a fixture route; a mock camera with a real face.
- **Reason:** the live rooms require a face to enter, and no face asset exists. A two-line, `import.meta.env.DEV`-gated initial state lets the live shells be captured and reviewed with a mocked WebSocket. Production builds fold `DEV` to false, so it cannot ship.
- **Cost:** two initial-state expressions; documented here and in `placeholders.md`.

## D3 — Remove dead `#` links (Support, Archive, Privacy, Terms, Forgot password)
- **Alternatives:** keep them as decoration; point them at the homepage anchors; build the pages.
- **Reason:** they promise surfaces that do not exist and fail keyboard and screen-reader users. Building them would invent legal/help content. Removing the affordance is truthful; the proposals are in `04-open-questions.md`.

## D4 — Replace `alert` / `confirm` / `prompt` with in-product states
- **Alternatives:** keep native dialogs; style a custom alert library (new dependency).
- **Reason:** native dialogs break the product voice and block the page. The same decisions are offered in ruled result panels (identity outcomes), a confirm dialog (remove, end session) and an inline composer (message). No action or outcome is lost.

## D5 — A visible "End session" control, with confirmation
- **Alternatives:** keep end-session only inside the third-party video control.
- **Reason:** when the video fails (a real state), the teacher could not end the session at all. The control calls the same handler. Confirmation prevents accidental ends.

## D6 — Rails open by default on wide screens
- **Alternatives:** keep closed-by-default toggles.
- **Reason:** "notice who needs attention" is the teacher's primary job and was hidden behind a toggle. ≥1200 the teacher rail is open; ≥1024 the student rail is open; both keep their toggle and become drawers on small screens.

## D7 — Keep role choice explicit
- **Alternatives:** remember the last role and skip the page.
- **Reason:** the role is a sessionStorage routing decision, not an account fact. Skipping would require persisting it (data change). The page is redesigned as a clear fork instead.

## D8 — Report presents bands, not judgement labels
- **Alternatives:** keep "Excellent / Balanced / Needs Support".
- **Reason:** those labels are invented judgement and conflict with "no student score that changes a grade". The report uses the product's own bands (Attentive / Distracted / Away) and states the TPI formula plainly.

## D9 — Report distribution is a ruled band bar, not a pie
- **Alternatives:** keep two pies.
- **Reason:** the homepage already teaches the 40/30/30 band as a ruled strip; a band bar is readable without a legend hunt and avoids chart-library defaults. Recharts stays for the time series and confusion bars.

## D10 — Report header is a ledger, not four stat cards
- **Alternatives:** the existing four KPI cards (the hero-metric template).
- **Reason:** the craft floor refuses the big-number/small-label scaffold. The record head is a serif sentence plus a ruled fact table; TPI is one fact among four, with its formula stated once.

## D11 — Save report keeps the record open with an inline "Record saved."
- **Alternatives:** keep `alert()` + forced `window.location.href = "/"`; auto-redirect after a delay.
- **Reason:** the save is a data write; the teacher should see it succeeded and keep reading. No forced full reload. The saved payload is byte-identical to before.

## D12 — Report close and student leave use the router, not a full page reload
- **Alternatives:** keep `window.location.href`.
- **Reason:** same destination (`/`), no reload flash, and it keeps the SPA's auth/session state intact.

## D13 — Modals use native `<dialog>`
- **Alternatives:** a custom portal modal with a hand-rolled focus trap.
- **Reason:** `showModal()` gives focus containment, Esc, and inert background for free — less code and better accessibility. Styled with the app system.

## D14 — Lift a band-level state callback from `EngagementTracker`
- **Alternatives:** leave the student's state only inside a canvas HUD.
- **Reason:** a student needs a readable sentence ("Attentive — present and looking at the room"), not raw yaw values. The tracker keeps all scoring logic; it calls `onStateChange` only when the band or identity status changes, so React is not re-rendered per frame.

## D15 — Message composer replaces `window.prompt`
- **Alternatives:** keep the prompt.
- **Reason:** same `sendTeacherAction(..., "message", text)` call, but the teacher can see the student, cancel, and get a validation state. Keyboard and screen-reader accessible.

## D16 — Playwright is a dev dependency
- **Alternatives:** no automated evidence; a global-only install.
- **Reason:** the brief requires proven flows and repeatable screenshots. `@playwright/test` is dev-only, adds nothing to the bundle, and is the standard for this stack. Licence Apache-2.0, actively maintained.

## D17 — New semantic CSS files; legacy dashboard CSS deleted after rewrite
- **Alternatives:** restyle legacy `td-*` / `sd-*` classes in place; override with `!important`.
- **Reason:** the legacy styles are a second design world (midnight navy, glows, 8px labels) and cannot be made to match by overrides without fighting them. New classes (`app-`, `auth-`, `ready-`, `room-`, `rec-`) are scoped, and the old files are removed once no component references them. Tailwind stays installed for the untouched video component during the transition.

## D18 — Add 404 and a route-level error boundary
- **Alternatives:** leave unknown URLs blank; rely on the console.
- **Reason:** a blank page is a failure state with no recovery. Both are additive, wrap routes only (not the env-config screen), and use the same paper shell.

## D19 — Keep the 2.2s post-signup redirect, add an explicit "Sign in now"
- **Alternatives:** remove the timer and require a click.
- **Reason:** preserves the existing behaviour while making the success state readable and escapable.

## D20 — `prefers-reduced-motion` respected by keeping this pass static
- **Alternatives:** port the homepage motion now.
- **Reason:** the brief explicitly defers motion. The new structure uses stable section/panel boundaries and CSS custom properties so the later motion pass can target them without rework.

## D21 — No new runtime dependencies
- **Alternatives:** icon library, headless UI, chart wrapper.
- **Reason:** icons are authored SVG in one stroke weight; `<dialog>` covers modals; Recharts already exists. Bundle must not grow.

## D22 — App pages are light (cream) with forest fields, not a dark theme
- **Alternatives:** keep the midnight dashboard look; add a dark-mode toggle.
- **Reason:** the homepage's material world is cream paper with forest fields. The live room inverts it (forest field holding cream rail) like the homepage hero holds the cream room window. A second theme would fork the system; the brief also freezes the homepage's no-dark-mode stance.

## D23 — One new shared header component, not a fork of the homepage header
- **Alternatives:** extract the homepage's `Brand`/topbar into shared components (would edit frozen files).
- **Reason:** Hard Rule 1. A new `AppHeader`/`Brand` lives in `components/app/` and reads the same tokens; the homepage keeps its own private header untouched.

## Pilot calibration (after `/teacher` live)

Compared side by side with the frozen homepage at 1280 and 375:

- **Same product?** Yes. The forest field holding a cream rail reads as the homepage's room window inverted. Newsreader titles + Manrope labels carry the voice.
- **Generic?** The first pass had a console-ish bar and a card-like rail. Fixes: ruled student rows instead of cards, serif "In the room" heading, duplicate status badges removed, one fact per row, a visible "Hide students" control, and a compact native dialog.
- **Density?** 13px row names, 10px labels, 44px targets. Right for a working room; the marketing type scale would have been too large.
- **Lessons applied to every remaining page:** forest is a field, cream is the working surface; one primary action per panel; states explain themselves in one line; never show the same signal twice; controls that hide the primary job must be visible.
- **Kept open for motion:** the room bar, KPI strip, stage, rail and rows are separate, stable blocks; the later motion pass can enter the rail rows and stage without markup changes.

## D24 — Add the NO_DATA state to the teacher roster
- **Alternatives:** keep showing "Away" when no face is in frame.
- **Reason:** PRODUCT.md defines NO_DATA as a camera miss, not a verdict. The roster shows "No data" with the dashed dot when `presence === "no_face"`, and does not count it as a flag. The rest of the status logic is unchanged.

## D25 — Readiness outcomes are in-product panels
- **Alternatives:** keep `alert` / `confirm` for identity outcomes.
- **Reason:** same decisions (try again / re-register / stop), readable and keyboard reachable, consistent with the record. The thresholds (0.55 / 0.65) and API calls are untouched.

## D26 — `/records` is a real page, and the teacher desk links to it
- **Alternatives:** keep the past-sessions modal on the pre-class screen.
- **Reason:** records were unreachable without passing the camera gate and auto-joining a class. A ruled list with one "Open record" action per row is the right shape for reading, and the shared `api/records.js` loader keeps the teacher page and records page from diverging.

## D27 — The report's below-40% band is labelled "Away"
- **Alternatives:** keep the old "Disengaged" label for the distribution slice.
- **Reason:** PRODUCT.md defines Away as the below-0.40 band and Disengaged as three strikes. The stored field is `distribution.disengaged`, but the count is the band, so the UI uses the truthful label while keeping the data key.

## D28 — The report reads as a record, not a dashboard
- **Alternatives:** keep the four KPI cards, two pies, and judgement labels.
- **Reason:** the record head is a serif sentence plus a ruled fact table (no hero-metric cards); distribution is a ruled band bar; "Excellent / Balanced / Needs Support" is replaced by the product's bands; TPI is stated once with its formula and the "not a student grade" line. Charts use the state palette, not mint/blue/violet.

## D29 — Legacy dashboard UI removed
- **Alternatives:** leave the old components and CSS in place.
- **Reason:** `teacher-dashboard.css`, `student-meeting.css`, `dashboard-shared.css`, `summary-cards`, `dashboard-topbar`, `student-card`, `login.jsx`, `app.css`, and `react.svg` had no remaining references after the rebuild. Removing them prevents a second design world from lingering and cut ~150 kB from the JS bundle.

## D30 — Timeline labels show half-minute precision
- **Alternatives:** keep `Math.floor(idx * 0.5)` labels, which repeated "0m, 0m, 1m, 1m".
- **Reason:** snapshots are collected every 30 seconds; 0.5-minute labels make the chart honest and readable.

## D31 — The session record is a native full-screen `<dialog>`
- **Alternatives:** keep the fixed `div` with `role="dialog"` (no focus trap, background still tabbable).
- **Reason:** `showModal()` gives focus containment, an inert background, Esc, and focus return to the "Open record" trigger. The visual surface is unchanged; it is still a full-screen paper record.

## D32 — Teachers see a Records link in the paper header
- **Alternatives:** rely on the class-desk link only.
- **Reason:** a returning teacher should reach records from readiness without hunting. The link appears only when the role is known to be teacher; students keep Home only.

## D33 — 10px is the app type floor
- **Alternatives:** keep the 9px labels in the room bar, KPI strip and report facts.
- **Reason:** the homepage's smallest label is 10px. Raising the app floor keeps the density while matching the source of truth and staying legible on a phone.

