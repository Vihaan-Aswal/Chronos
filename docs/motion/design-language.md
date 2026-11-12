# Motion design language — extracted from the homepage

Source of truth: the frozen homepage at commit `426493c7ffd874b32a8c9cdf4f2b882b14fdf0de` and its motion plan `docs/homepage-motion-plan.md`.

**Important gap:** the homepage motion *plan* exists, but its implementation was never merged. The homepage code is static apart from two small CSS animations (`panel-in`, `note-in`) and hover colour transitions. The tokens below are the plan's committed language; the app motion system adopts them exactly and lives in a central place the homepage can adopt later. This gap is logged in `decisions.md` (D-M1).

## 1. Tokens

| Token | Value | Homepage use | App use |
|---|---|---|---|
| `--motion-instant` | 120 ms | Button press, focus, filter tick | Button press, hover, field focus, tab underline, state dot |
| `--motion-fast` | 180 ms | Desk lift, setting tile, legend state | Row entrance, field error, dialog entrance, rail slide |
| `--motion-base` | 260 ms | Inspector content, tab panel, state flip | Panel/route settle, report section entrance |
| `--motion-slow` | 420 ms | Nudge ring travel, chain line draw | Auth first-impression sequence, report chart draw |
| `--motion-authored` | 620 ms | Arch hairline reveal, room settle | Only the report print / first-run success; never working UI |
| `--motion-print` | 700 ms | Record print | Session record print only |
| `--ease-arrive` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances, ring landing | Panels, dialogs, report sections |
| `--ease-state` | `cubic-bezier(0.4, 0, 0.2, 1)` | State changes | Hover, selected, error, saved |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exits | Dismiss/close, where an exit is used |
| `--stagger-desk` | 18 ms | 20-desk wave | Shared sibling stagger for app rows/cells; capped at 8 siblings (144 ms) |
| `--stagger-chain` | 60 ms | Chain steps | Auth facts / report facts, max 4 (180 ms) |

Rules: no bounce or elastic curves; exits faster than entrances; total stagger under 360 ms; frequent actions stay at 120–180 ms; 620/700 ms only for rare authored moments.

## 2. Current motion inventory (baseline)

### Homepage (frozen)

- `panel-in`: 280 ms, `cubic-bezier(0.22, 1, 0.36, 1)` on the room panel when the Before/Live/After tab changes.
- `note-in`: 360 ms, same curve, on the student note after a nudge.
- Desk hover lift 2 px and box-shadow; selected desk 2 px ink ring; filter dim 200 ms.
- Button/legend/setting colour transitions 150–200 ms.
- No scroll-linked motion, no ambient loop, no canvas/WebGL.
- The motion plan's tokens are not implemented in the homepage CSS; they are the contract.

### App pages (baseline)

- **No transitions or keyframes** in `app-system.css`, `auth.css`, `choose.css`, `readiness.css`, `records.css`, or `room.css` (verified by grep).
- Buttons, nav links, rows, filters, fields and tabs change colour instantly.
- Native `<dialog>` modals open/close instantly; the record overlay appears instantly.
- Rails (`is-open`/`is-closed`) switch by `display:none` under 1023 px; no slide.
- Route changes are instant; `AnimatePresence` wraps Routes but no motion child uses it.
- Loading is a text line (`Loading records…`), not a skeleton or progress pattern.
- Charts use Recharts defaults (SVG animation) but the redesign did not tune it; reduced motion is not applied to charts.
- The tracker canvas has a functional `requestAnimationFrame` loop; it must not be wrapped in page motion that repaints it.
- The nudge toast appears instantly; the liveness/auto-nudge/tab-switch dialogs open instantly.
- Only the 100ms video component has its own internal motion; it is third-party and must not be edited.

## 3. Page and state inventory

| Page | Key states | What is abrupt / lifeless | Moments the user cares about |
|---|---|---|---|
| `/signin` | default, field focus, loading, provider error, success navigation | page and form appear instantly; error notice pops; eye toggle instant | first impression; trust; error recovery |
| `/signup` | default, loading, mismatch inline, auth error, success + 2.2 s redirect | success panel appears abruptly; auto-redirect feels sudden | account created; confidence |
| `/choose-role` | default only | fork appears instantly; no sense of choosing a side | the one routing decision |
| `/readiness` | camera initialising, denied, searching, off-centre, dark/bright, ready, verifying, identity registered/verified/uncertain/failed, missing role | checks flip instantly; result panel appears; camera/panel heights jump; disabled reason static | camera trust; "am I ready?"; identity outcome |
| `/teacher` desk | join, loading records, empty records, records error, selected report | embedded readiness + records row appear instantly; report overlay instant | start class; find a record |
| `/teacher` live | live, no students, all clear, reconnecting, action pending/failed, filter change, row remove, message/remove/end dialogs, report open, simulator on/off, class/exam, strict/normal | rail rows appear/reorder instantly; filter swap snaps; action notes pop; dialogs snap; rail toggle snaps on mobile; report snaps | noticing who needs attention; acting; ending with a record |
| `/student` live | join, connecting, live, tracker open/closed, nudge, identity mismatch, liveness challenge, tab warning, reconnecting, session expired | state title/copy snap; history cells snap; nudge note pops; rail toggle snaps; liveness dialogs snap | own state; private nudge; calm |
| `/records` | loading, error + retry, empty, list, opening, record open, report details, save/saved/error | loading text only; list snaps; report snaps; detail expand snaps | finding and reading a record |
| Session record | live/past, no timeline/distribution/hotspots/follow-up, per-student expand, saving/saved/error | full-screen dialog snaps; TPI/facts/charts/band appear at once; charts animate with default timing; save state pops | the post-class record; proof of what happened |
| `/meeting` | loading, failed, live video | bare room appears; stage error snaps | leave/return; video failure |
| 404 | default | static; no recovery cue beyond buttons | wrong URL recovery |
| Error boundary | render crash | static fallback | recovery |

## 4. What motion can earn its place

- **Orientation:** route changes settle the page and draw the header rule; the active nav underline draws.
- **Continuity:** the report opens from the record row; the rail opens from its toggle; dialogs rise from the paper surface.
- **Cause and effect:** a row's state changes, an action note appears, a save completes, a nudge arrives, an error explains itself.
- **Waiting:** records loading gets a ruled progress line; readiness checks get a quiet checking state; the report's chart draws once.
- **First impression:** auth pages and 404 get a restrained paper settle; the report gets the authored print.
- **Working density:** teacher/student live rows, filters, rail, and status strip stay fast and nearly invisible; no ambient loops behind the data.

## 5. What must not move

- The LCP element on every page (usually the page title or auth headline) is never hidden or animated.
- Dense data text, table columns, chart axes, video tiles, and the tracker canvas.
- No uniform fade-up on every section; no scroll reveals; no parallax; no tilt; no scroll-jacking.
- No infinite animation behind working UI; only the live connection dot may pulse, and it pauses offscreen/hidden.
- No layout properties (`width`, `height`, `top`, `left`, margins) in transitions.
- No motion that delays navigation, input, or focus return.

## 6. Constraints

- Static layout, content, copy, routes, flows, data, auth, permissions and API contracts are final.
- Homepage files are frozen: `src/pages/home-page.jsx`, `src/components/home/*`, `src/styles/home-page.css`, `src/components/chronos-mark.jsx`, `src/index.css`, `index.html` (no edits).
- New tokens/primitives live under `.app` scopes or shared files that do not touch `.home`.
- No second animation library; `motion` 12.38 is installed and already in the main bundle.
- Reduced motion must be genuinely calm: no travel/stagger/loops; state changes remain legible.
- Tests run with `reducedMotion: "reduce"`; motion must not make them flaky. A global kill switch is required.
- Production bundle baseline: main JS 3,090.33 kB / 862.30 kB gzip; CSS 83.65 kB / 15.25 kB gzip. Motion delta target ≤ 6 kB JS gzip, ≤ 4 kB CSS gzip.
- Baseline Lighthouse (desktop): signin/signup/choose/records/meeting/404 95–96, home 89, readiness 65, teacher desk 62, student join 63. The camera pages are dominated by the existing MediaPipe/face-api stack (8.5 MiB, ~42 s TTI). Motion must not regress these.
- Baseline trace CLS on live shells is already high (teacher 0.136, student 0.161) from video/stage load; motion must add zero shifts.
