# 01 — UX plan

Phase 2 output. This is the contract for the build. Decisions are justified in
`decisions.md`; departures from the repo's own docs in `deviations.md`.

## 1. Jobs to be done

| Who | Job | Where it starts | Where it ends |
|---|---|---|---|
| Teacher, first visit | Understand the product and open a class | `/` | `/teacher` live |
| Teacher, returning | Sign in, check readiness, run a class | `/signin` | `/teacher` live |
| Teacher, after class | Read and keep the record; find an older record | live room | `/records` or report |
| Student | Sign in, pass readiness, join, see own state, get a nudge | `/signin` or invite | `/student` live |
| Anyone | Recover from a wrong URL or a crash | any | 404 / error page → home |
| Visitor | Decide whether to host or join | `/` | `/signup` or `/signin` |

The product's promise is one state at a time, the student first, the teacher's last word,
and a record rather than a recording. Every screen must be able to answer: what is
happening now, what is measured, what can I do next.

## 2. Target information architecture

```
/                     home (frozen, signed out)
├── /signin           sign in            (public)
├── /signup           create account     (public)
└── /choose-role      teach or learn     (auth)  ← the fork
    ├── /readiness    before you join    (auth)  ← shared camera + identity gate
    │   ├── /teacher  class desk → live room   (auth)
    │   └── /student  join → live room         (auth)
    ├── /teacher      class desk (past sessions + start)  (auth)
    ├── /records      past session records (teacher)      (auth)  ← new, additive
    └── /meeting      bare room for ?user=               (public, unchanged)
*                     not found → home
```

Navigation model:
- **Public auth pages:** brand → home, one quiet footer line. No global nav (nothing to navigate to).
- **Signed-in paper pages** (`/choose-role`, `/readiness`, `/records`, teacher desk):
  paper header with brand → home, current section, "Sign out". Teacher role also gets "Records".
- **Live rooms** (`/teacher` live, `/student` live, `/meeting`): forest room bar with brand,
  session identity, connection state, and the room's own exit ("End session" / "Leave").
  No marketing links during class.
- **Report:** full-screen record with a forest header band and three actions (Export PDF, Save record when live, Close).

Why `/records` is additive, not a merge: today a returning teacher can only reach past
records by passing the camera gate and auto-joining a live class, or by typing `/teacher`
directly. Records are a first-class teacher job and deserve their own address. The route
uses the existing analytics endpoints; no backend, schema, auth, or permission change.
`/teacher` keeps working as before and links to `/records`; the pre-class desk remains the
place to start a class.

Removed: the dead `#` links (Support, Archive, Privacy, Terms, Forgot password). They
promised surfaces that do not exist; keeping them would be a lie. Logged in
`04-open-questions.md`.

## 3. Flows

### Teacher, first run
`/` → "Host a class" → `/signup` → create account → success panel → `/signin` → sign in →
`/choose-role` (Teacher) → `/readiness` ("Before you join", camera + identity) → join →
`/teacher` live → teach → "End session" (confirm) → session record → Save record → home.

### Teacher, returning
`/signin` → `/choose-role` → Teacher → `/readiness` → live. From `/readiness` or the class
desk, "Records" opens `/records` without a camera check.

### Student
`/signin` → `/choose-role` (Student) → `/readiness` → join → `/student` live: stage + own
signals rail (open on desktop), private nudge as a ruled note, leave returns home.

### Failure paths
- Camera denied → readiness explains the browser permission and offers Retry; the join
  action stays disabled with the reason, never a silent grey button.
- Identity uncertain / failed → in-product result panel with the same options the
  `confirm()` calls offered (try again / re-register / stop), no native dialogs.
- WebSocket lost → a ruled banner in the room bar ("Reconnecting…") that clears itself;
  the page stays usable.
- Empty room → the rail says "No students yet" with what to check; "All clear" when
  priority filter is empty and students exist.
- No past records → `/records` explains what will appear there.
- Unknown URL → 404 page. Render crash → error page with reload and home.

## 4. Page specs

### `/signin`
- **Purpose:** get back in. **Primary:** Sign in. **Secondary:** create an account, back home.
- **Layout:** two columns at ≥900: left forest panel (brand, "Signals, not surveillance.",
  three ruled facts from the product: one state at a time / frames and audio are never
  stored / the teacher decides), right cream form column (max 440px) with a serif title.
  Single column on mobile: brand bar, short stance line, form.
- **Content:** "Sign in" · "Use the email you enrolled with." · Email · Password (show/hide)
  · Sign in · "New to Chronos? Create an account."
- **States:** default, field focus, loading (button label "Signing in…", disabled),
  error (ruled red-text panel above the form, focus moved to it), success (navigates).
- **Success:** `/choose-role` (unchanged).

### `/signup`
- Same shell. Title "Create your account". Email, password, confirm password, show/hide.
- **States:** default, loading, mismatch (inline under confirm), auth error (panel), success
  ("Account created. Taking you to sign in…" + "Sign in now" link; keeps the existing
  2.2s redirect).
- **Copy note:** no invented password policy; the auth provider's message is shown verbatim.

### `/choose-role`
- **Purpose:** one decision. **Primary:** continue as teacher / as student.
- **Layout:** paper page; serif page title "How will you use Chronos?" with one italic
  phrase; two ruled columns split by a 1px rule (not cards). Each column: role name in
  serif, one sentence of what happens, three short facts, and a full-width square action
  ("Continue as teacher" / "Join as a student"). Whole column is not clickable; the button
  is the single target (keyboard-simple, no nested interactive elements).
- **Secondary:** "Sign out" in the header; "Records" link for teachers is not shown until a
  role is known.
- **States:** default only. No loading. If session is missing, AuthGuard handles it.
- **Success:** `/readiness`.

### `/readiness`
- **Purpose:** prove the camera and identity before class. **Primary:** "Verify and join".
- **Layout:** paper page, max 1120. Head: "Before you join" + role and session line.
  Two columns: left camera panel (4:3, forest frame, face guide, status caption), right
  ruled checklist (Face in frame / Face centred / Lighting) each with a state word and a
  one-line fix, then the primary action, then a "What is kept" note. On mobile the camera
  is first, checklist second, action sticky at the bottom of the panel (not viewport).
- **States:** initialising, camera denied (panel with Retry + browser steps), searching,
  off-centre, too dark/bright, ready, verifying, identity result (registered / verified /
  uncertain / mismatch) as a ruled panel with the existing choices, missing role (redirect).
- **Copy:** "A face embedding is kept to verify you. The video is not."
- **Success:** `/{role}` with `readinessCompleted` (unchanged).

### `/teacher` — class desk (pre-class / after class)
- **Purpose:** start a class or open a record. **Primary:** start (camera check).
- **Layout:** paper page, two areas: "Start a class" (the readiness panel, embedded) and
  "Recent records" (3 most recent, ruled rows, "All records →").
- **States:** join, loading records, empty records, records error, selected report.
- **Success:** live room.

### `/teacher` — live room
- **Purpose:** notice who needs attention, act, end with a record.
- **Layout:** forest room. Room bar (2 rows on mobile): brand + session + timer + connection;
  mode controls (Class/Exam, Normal/Strict, Simulate) with plain-language helper text;
  "Check engagement" and "End session". Below: a cream status strip with four counts
  (Present, Attentive, Distracted, Critical) and a legend. Workspace: forest stage
  (video tiles, with a designed loading/error/empty state) + cream rail ("In the room").
- **Rail:** head with counts and filter tabs "Needs attention (n)" / "All students (n)";
  ruled student rows (initials, name, state dot + label, score, last update, signal tags,
  six actions with tooltips and 44px targets). Rows, not cards. Rail open by default at
  ≥1200, drawer on smaller screens with a visible "Students" button.
- **States:** live, no students, all clear, reconnecting, action pending, action failed
  (inline row note), simulated cohort labels, long names (truncate + title), many students
  (scroll), report open.
- **Actions preserved:** mark engaged, message (inline composer replaces `window.prompt`),
  ignore, remove (confirm), verify/liveness (per student and all), nudge, class/exam,
  strict/normal, simulate, end session (now also a visible control; confirm dialog).
- **Success:** session record.

### `/records`
- **Purpose:** find and read a past session. **Primary:** open a record.
- **Layout:** paper page; serif title "Session records"; ruled table (date, session, learners,
  duration, mean engagement, TPI, open). Empty state explains what will appear.
- **States:** loading, error (retry), empty, list, open record.
- **Success:** record read or exported.

### Session record (overlay, `/teacher` and `/records`)
- **Purpose:** the post-class record. **Primary:** Save record (live) or Export PDF.
  **Secondary:** close.
- **Layout:** cream page, forest header band with title, session, date, duration and
  actions. Then: a record head (TPI as a large serif numeral + the formula in one plain
  sentence; mean engagement; learners live/simulated; duration) and ruled sections:
  attention over time (line), attention distribution (a ruled band bar, not a pie),
  compared with the class mean (three ruled counts), confusion moments (bar), per-student
  timelines (collapsed), follow-up list.
- **States:** live vs past (save hidden), no timeline, no distribution, no hotspots, no
  follow-up, expanded per-student, saving, save error, saved.
- **Truth:** band names only (Attentive / Distracted / Away), no "Excellent" judgement.
  TPI labelled "post-class index, not a student grade".

### `/student` — join
- Same readiness component in paper shell, with the student's own note: "Only your own
  state is shown to you. Your teacher sees repeated concerns, not every glance."

### `/student` — live room
- **Purpose:** attend, see your own state, receive a nudge. **Primary:** stay in class.
- **Layout:** forest room bar (brand, session, connection, "Leave"). Main: video stage +
  cream rail "Your signals" (open at ≥1024): current state in serif with a one-line
  meaning, the 20-check strip, identity line, and a smaller camera check preview. The
  existing tracker panel toggle stays for mobile.
- **States:** live, camera lost, tracker open/closed, nudge (ruled note), identity mismatch,
  liveness challenge, strict-mode tab warning, reconnecting, session expired.
- **Success:** leave returns home.

### `/meeting`
- Minimal forest room bar (brand, "Meeting", Leave) around the existing video component.
  No other change; the `?user=` contract is untouched.

### 404 and error
- 404: "This page isn't in the record." + Home / Sign in.
- Error: "Something in this room failed to render." + Reload / Home. No stack traces in UI.

## 5. Content strategy

Voice rules:
- Short declaratives. No exclamation marks. No "seamless", "powerful", "revolutionary".
- Name the state, the rule, the next action. Numbers are facts, not scores to chase.
- Second person for instructions; third person for the system ("Chronos keeps…").
- Sample or simulated data is always labelled.
- Reuse the homepage's exact claims: six labels, no blended score, one state at a time,
  frames/audio/content/grades never stored, teacher decides, not a proctoring tool.

Copy examples (all derived from product truth):
- Readiness: "Before you join" / "Three checks, then class." / "A face embedding is kept to verify you. The video is not."
- Teacher rail: "In the room" / "Needs attention" / "All clear. No one needs attention right now."
- Student rail: "Your signals" / "Attentive — present and looking at the room." / "A nudge is a quiet message, not a mark."
- Report: "The record" / "TPI is a post-class index: 60% mean engagement, 40% attention retention. Not a student grade."
- Records empty: "No records yet. A session record appears here after you end a class."

Placeholders: none needed for copy; any missing real content is a state, not a fake.

## 6. Design direction

| Surface | Match homepage | App-specific |
|---|---|---|
| Auth, choose-role, 404, error | Cream ground, forest panel, serif display, ruled facts, square buttons, gold hairlines | Form density: 44px fields, 13–15px labels, 440px column |
| Readiness | Same paper world, forest camera frame, ruled checklist | Camera panel + status list; action priority |
| Teacher/student live | Forest field + cream rail (the homepage's room window inverted), same state palette and dots, same type | 12–14px working type, 44px rows, dense lists, sticky bars |
| Records | Cream paper, serif title, ruled table | Table alignment, tabular numerals, row hover |
| Report | Cream record, forest header, serif numerals, ruled sections | Charts in palette, expandable detail |

Never: glass, glow, gradients as decoration, pill-shaped primary controls, card grids,
8px labels, unlabelled icon-only primary actions, native dialogs.

## 7. Options weighed

**A. Keep routes, add `/records`, persistent rails, paper/forest shells (chosen).**
Lowest risk: no auth or data change, deep links survive, records become reachable.
Cost: one new route and page.

**B. Fold role choice into the account and readiness into the live room; records in a
drawer.** Fewer steps, but needs a persisted role (data change), removes a bookmarked
route, and hides the pre-class moment. Rejected.

**C. One `/classroom` workspace with Live / Records / Readiness tabs.** Cleaner-sounding,
but route surgery breaks `/teacher?sessionId=` and `/student`, and the gain is cosmetic.
Rejected.

## 8. Build order

1. Foundation: `app-system.css`, header/footer, buttons, fields, badges, dots, modal,
   empty state, chart theme; `Brand`, `AppHeader`, `AppFooter`, `Modal`, `ConfirmDialog`,
   `StateDot`, `EmptyState`.
2. **Pilot: `/teacher` live room** — most representative working surface: room bar,
   status strip, rail, rows, filters, actions, empty states, confirm dialog, stage states.
3. `/signin`, `/signup`.
4. `/choose-role`.
5. `/readiness` + `JoinScreen`.
6. `/student` live + tracker rail + nudge.
7. `/records` + `SessionReport`.
8. `/teacher` class desk (embeds readiness + recent records).
9. `/meeting`, 404, error boundary.
10. Cleanup (legacy CSS/components), homepage regression, final critique.

Pilot reasoning: the live teacher room exercises the shell, the dark field, the cream
working rail, lists, filters, badges, dialogs, empty/error states and the state palette in
one screen. Lessons there define the system for the student room and the record.

## 9. Self-review (harsh)

- **Functionality:** every action in the old teacher rail is preserved (nudge, mark engaged,
  message, ignore, remove, verify), plus a visible end-session control and a message
  composer. No API, auth, or data change. `/records` is additive.
- **Hard Rule 1:** homepage untouched. New tokens are declared under `.app` scopes, not on
  `.home`; no edits to `home-page.css`, `home-page.jsx`, or `home/*`.
- **Hard Rule 3:** no invented stats or testimonials. The only new numbers are computed
  from existing data. Password advice avoided. "TPI" formula copied from PRODUCT.md.
- **Gap found and fixed in plan:** readiness repeats for teachers who only want records →
  `/records` solves it without touching readiness. Also, ending a session was only possible
  through the video UI → visible "End session".
- **Gap:** the student rail needs a readable state, which lives inside the tracker. Plan:
  lift a band-level callback (`onStateChange`) from the tracker, call it only on band
  changes, keep all scoring logic intact.
- **Contradiction check:** the brief says no motion; the existing tracker/motion imports
  will be reduced to static markup where they are decorative. Auth pages drop their
  `motion` wrappers (no animation), but the tracker's functional loop stays.
- **Risk:** `/records` reads `sessionStorage.chronos_role`; a teacher who signs in and goes
  straight to `/records` has no role. The page will show the fork prompt ("Choose teacher
  to open records") with a link to `/choose-role`, not a redirect loop.
- **Risk:** adding an error boundary must not swallow the env-config error screen in
  `main.jsx`; it wraps routes only.
