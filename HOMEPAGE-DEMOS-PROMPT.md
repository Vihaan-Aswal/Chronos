This is a design exploration, not a shipping build.

## What I want

A set of complete, working homepage demos I can open in a browser and compare —
as many genuinely distinct directions as you can produce, up to 7. Fewer is fine
if they are truly different; never pad to hit 7, and never stop early because it
is easier. If you can only make 4 that differ, deliver 4 and say why the rest
would have been repeats. Not mockup images, not wireframes. Nothing gets
implemented in the real app; the demos are the deliverable.

Target: the `/` route — `main/app/frontend/src/pages/home-page.jsx` (~770 lines).
Everything else is context.

Ask me anything at any point, but do not ask me what is wrong with the current
page — I don't have the words. I am not satisfied with it overall; diagnose it
yourself and show me what you found.

## Step 1 — Understand before designing

**There is no PRODUCT.md, DESIGN.md or CONTEXT.md in this repo** (gitignored,
absent). Derive product truth from the code, not from imagination:

- `README.md` (root) — setup, flows, the claims the product makes.
- `main/app/frontend/src/index.css` — the tokens ("Digital Archivist — Midnight &
  Parchment"), the shared utilities, the motion vocabulary.
- `main/app/frontend/tailwind.config.js` — the token superset, the
  Newsreader / Manrope pairing, the radius scale.
- `main/app/frontend/index.html` — the fonts and icon set actually loaded.
- `main/app/frontend/src/main.jsx` — the routes.
- The screens the home has to introduce: `pages/choose-role-page.jsx`,
  `pages/readiness-page.jsx` + `components/join-screen.jsx`,
  `pages/student-page.jsx`, `pages/teacher-page.jsx` + `components/teacher/*`,
  `components/session-report.jsx`, `components/engagement-tracker.jsx`,
  `hooks/use-classroom-simulator.js`, and `main/app/backend/main.py`.

Targeted reads and greps; these files run 10–45 KB each.

**Run it:** `cd main/app/frontend && npm run dev` → http://localhost:5173. `.env`
is populated. Walk `/`, `/signin`, `/signup` directly; `/choose-role` and
`/readiness` sit behind Supabase auth; `/teacher` and `/student` sit behind auth
plus a camera, and the teacher topbar has a **Simulate** toggle that fakes 20
students — that is how you see a live board and a report with no real class;
`/meeting` needs a 100ms token. Do not create accounts, do not edit `.env*`, do
not start the backend if its dependencies are missing. If a route is
unreachable, read its code, say which route you could not walk, and move on.

**Diagnose:** run the `impeccable` skill's `critique` and `audit` commands on the
current home. Report what works, what does not, and what is generic, briefly.
Hold the page against the product it must introduce, not only against taste. Do
not over-index on this diagnosis: the demos may contradict it.

## Step 2 — Directions

Do not vary novelty alone. A direction is only real if it differs from every
other on all three:

1. the argument — the one thing it proves first (evidence, mechanism, calm,
   fairness, the human moment, ...)
2. the lead — what owns the first viewport (a session record, a live board, a
   diagram, a story, a typographic statement, the tool itself, ...)
3. the world — palette, type, material, motion grammar.

If two directions share any of the three, replace one. Write the table (name /
argument / lead / world) before you write markup; if two rows share a column,
the direction is not distinct yet.

Seeds, not a checklist — invent better ones if you have them:

- **The Record** — page as the artifact it sells: a completed session record with
  receipts (TPI, timeline, who needed help, the exported PDF).
- **The Instrument** — page as a console you can touch; a class runs, a student
  drifts, a nudge lands, the class returns.
- **The Signal Chain** — the mechanism drawn: camera → landmarks → state → nudge
  → record, with the privacy boundary on the same diagram.
- **One Session** — 42 minutes told as one story: the drift, the message, the
  return, the note the teacher reads afterwards.
- **The Stance** — page as a position: no black box, no blended score, no
  automated discipline. Type and words carry it.
- **The Two Doors** — page as the fork: teacher or student, each door opening
  onto its own version of the product.
- **The Teacher's Desk** — page as the tool with the marketing stripped to a
  strip; the first action is starting a class.
- **The Readiness Check** — the twenty seconds before class: camera, consent,
  face, lighting, identity — handled honestly and quickly.

Every demo is still a homepage, not a product screen. Each must answer in its
first viewport: what is this, who is it for, what do I do next. A dashboard with
a nav bar is not a direction.

Full creative authority. Product truth is not negotiable. Keep these true:

- **Two roles, one room.** A teacher hosts and reviews; a student joins and
  participates. One shared room keyed by `?sessionId=`, defaulting to
  `default-session`.
- **Inference runs in the student's browser.** FaceMesh landmarks give gaze, head
  pose and eye openness; a face embedding gives identity consistency. What is
  stored: that embedding plus session analytics. What is never stored: video
  frames, page or app content. Do not claim "nothing is stored".
- **Live states, per student:** Attentive (score > 0.70), Distracted (0.40–0.70),
  Away (< 0.40), Disengaged (3 strikes), Identity Mismatch (2+ consecutive
  low-similarity checks, at a 2–5 minute cadence), plus multi-face and tab-switch
  flags. No face in frame is `NO_DATA`, not "disengaged".
- **Student first, teacher last word.** The student is nudged and gets time to
  recover; identity checks can ask for a liveness action (turn head, smile) in a
  3–5 second window. The teacher sees the flag and can mark engaged, message,
  ignore or remove. Nothing is automated.
- **Session controls:** strict / normal monitoring and class / exam context.
  Strict mode notices when the tab loses focus. Say that plainly instead of
  implying nothing is watched.
- **After class:** TPI 0–100 (integer) = 60% mean engagement + 40% retention;
  engagement timeline; attention distribution; comparison to class average;
  students at risk; confusion hotspots (≥ 20% of the class at once); PDF export.
  "No Past Sessions" is a shipped state, not a placeholder.
- **No student score decides anything.** TPI is a session-level index for the
  teacher, computed after class — not a grade, not a ranking.
- **Not proctoring, not emotion recognition, not attendance.** The signals point a
  teacher at a person who needs a human.

Banned: "AI-powered", "surveillance-grade", "detect cheating", accuracy
percentages, emotion claims, invented certifications or compliance badges,
invented school logos. Sample names, sessions, quotes and numbers are fine — say
once, small, that the data is illustrative.

There is no seeded demo dataset: the simulator emits scores and `sim_7`-style
ids, never names, and the report's empty state is real. Invent content freely,
but keep the semantics exact — score bands, 3 strikes, the TPI formula.

## Step 3 — How the demos must work

- Everything lives under `main/app/frontend/demos/`, served at
  http://localhost:5173/demos/. Standalone HTML entries: no app router, nothing
  wired into `main.jsx`. Do not edit any existing file. Deleting
  `main/app/frontend/demos/` must leave the repo exactly as it is today.
- One shared scaffold: `demos/base.css` for theme, tokens, fonts and page shell,
  plus `demos/shared.js` only for behaviour every demo repeats (scrolled header,
  reveal-on-scroll, reduced-motion guard). Each direction carries only its own
  markup, styles and interactions in its own `demos/<slug>.html`. No duplicated
  boilerplate.
- **Tailwind will not see your demos.** `tailwind.config.js` scans `./index.html`
  and `./src/**`, so utility classes written in `demos/` generate nothing. Write
  plain CSS against the real custom properties (`var(--color-surface)`,
  `var(--color-primary)`, `var(--color-tertiary-fixed-dim)`, ...). You may
  import `../src/index.css` for preflight, tokens and `.premium-shadow` /
  `.grainy-overlay` / `.reveal-up`, but do not depend on utility classes.
- Fonts and icons: reuse the exact three `<link>` tags from
  `main/app/frontend/index.html` (Newsreader, Manrope, Material Symbols
  Outlined). Add no other external request — no new font, no image CDN, no
  analytics. Icons must degrade to nothing, not to words, if the icon font
  fails.
- Vanilla HTML/CSS/JS. No new dependencies, no React runtime in a demo. The
  brand mark is real: copy the C-arc SVG from `components/chronos-mark.jsx` or use
  `/logo_dark.svg`. Do not invent a mark.
- Every demo is a complete page: header/nav, hero, every section, footer; hover
  and `:focus-visible` states; keyboard operable; WCAG AA contrast (4.5:1 text,
  3:1 large text and UI); no horizontal overflow at 1440, 768 and 390; works with
  no backend and no account.
- Both roles must find themselves: a teacher needs "host a class", a student
  needs "join a class", however small those doors are.
- Both states of whatever owns the lead: before the first session (empty, zero,
  nothing recorded) and after a completed one. A first-time teacher has no
  history; every first class has no data.
- Styles scoped per demo. No leakage either way.
- `/demos/` is a gallery: every demo linked, with name, argument, lead, world,
  what it optimizes, what it trades away.

## Step 4 — Verify and report

- Skip Impeccable's comp-image round and build-phase gates: the working demo is
  the artifact. Still hold the craft floor.
- Open every demo at 1440, 768 and 390. Fix clipping, contrast, broken states and
  console errors in one batch, then re-check once.
- Prove the real app is untouched. Baselines measured today: `npm run build`
  passes (~27 s, one chunk-size warning); `npm run lint` exits 0 with 7 hook
  warnings and 0 errors; there is no typecheck and no test suite.
  `git status --short` must show only `demos/` plus the pre-existing untracked
  `.gitignore`.
- Existing uncommitted changes are mine. Never revert, format, stage or commit
  them. No new dependencies, no backend changes, no edits to `.env*`,
  `index.html`, `main.jsx`, `tailwind.config.js` or any stylesheet.
- Impeccable may write `PRODUCT.md`, `DESIGN.md` and `.impeccable/` — all
  gitignored. Keep anything else it produces out of the repo, or tell me.
- Finish with a compact table: name, URL, thesis, lead, trade-off. Plus anything
  still open. No essays.
- Then stop. Do not implement a winner until I choose. I will pick by preference,
  so don't optimize for a criterion I haven't given.

## Token budget

Be efficient: batch reads, target with grep instead of loading whole files (this
codebase's core files are 10–45 KB each), never re-read a file, don't paste code
or long reasoning into chat, don't narrate each step, don't screenshot unless you
need it to judge your own work, don't run the same command twice, start the dev
server once in the background. Compress communication, not the work.
