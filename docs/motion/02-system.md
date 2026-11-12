# 02 — Motion system

**One language, one place.** The app motion system extends the homepage plan's tokens exactly. It is scoped to `.app` and portal dialogs with `.app`; the frozen homepage is untouched.

## Files

| File | Role |
|---|---|
| `src/styles/motion.css` | Tokens, keyframes, primitives, reduced-motion, global switch. Imported once in `main.jsx`. |
| `src/components/motion/tokens.js` | JS mirror of the tokens for future JS sequences. No inline durations in components. |
| `src/components/motion/use-motion-preference.js` | Reads `data-motion` + `prefers-reduced-motion`; returns `{ mode, reduced, off }`. Used by Recharts. |
| `src/components/motion/motion-provider.jsx` | Applies `data-motion` from `?motion=` / localStorage before paint, exposes `window.chronosMotion`, pauses loops when hidden. |

## Tokens

| Token | Value |
|---|---|
| `--motion-instant` | 120 ms |
| `--motion-fast` | 180 ms |
| `--motion-base` | 260 ms |
| `--motion-slow` | 420 ms |
| `--motion-authored` | 620 ms |
| `--motion-print` | 700 ms |
| `--ease-arrive` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-state` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--stagger-desk` | 18 ms |
| `--stagger-chain` | 60 ms |
| `--motion-rise` | 4 px (0 under reduced motion) |
| `--motion-row-rise` | 4 px (0 under reduced motion) |

## Primitives

| Primitive | Selector | Behaviour |
|---|---|---|
| Route rule | `.app-header::after`, `.room-bar::after` | 260 ms hairline draw on mount; no page fade |
| Button feedback | `.btn`, `.icon-btn`, `.text-btn`, `.room-toggle`, `.rec-detail-toggle` | 120 ms colour/border; 0.985 active scale |
| Field feedback | `.field input/select/textarea` | 120 ms border/background |
| Badges/dots | `.badge`, `.dot`, `.signal-cell` | 180 ms state colour |
| Dialog | `dialog.app-dialog[open]` | 180 ms rise/fade + backdrop |
| Record | `dialog.rec[open]` | 260 ms sheet + 420 ms header rule |
| Notice | `.notice`, `.room-banner`, `.empty`, `.room-row-note`, `.field-error`, `.rec-students` | 180 ms rise/fade |
| Auth | `.auth-fact`, `.auth-form form > *`, `.auth-success-actions` | 420/180 ms, 60/18 ms stagger; h1 static |
| Fork | `.choose-col` | 180 ms, 18 ms second-column delay |
| Readiness | `.ready-panel` | 180 ms rise; check colours 180 ms |
| Rows | `.room-row`, `.record-item` | 180 ms entrance + 18 ms stagger (max 8) |
| Live | `.room-connection i` | 2.4 s opacity/scale pulse; pauses hidden |
| Rail | `.room-rail.is-open` under 1023 px | 180 ms entrance; close is instant |
| Nudge | `.room-nudge` | 260 ms rise |
| Student state | `.signal-state-title/copy` | 180 ms keyed fade/rise |
| Loading | `.records-loading::after` | 1.2 s ruled progress line; static reduced |
| Report print | `.rec-bar::after`, `.rec-fact`, `.rec-band-seg` | 420/180 ms; charts 420 ms |
| Charts | Recharts `isAnimationActive` | 420 ms, ease-out; disabled reduced |

## Usage rules

1. **Frequent actions use 120–180 ms.** Buttons, filters, rows, fields, tabs, dialogs. Never 620/700.
2. **260 ms is for panels, dialogs, record sheets, nudge notes.**
3. **420/620/700 ms only for auth first impression and the report print.** No working UI at those durations.
4. **No layout properties.** Transform/opacity/filter only. No width/height/top/left/margin transitions.
5. **No uniform reveal.** The route cue is the header rule; the page content is visible immediately. No per-section fade-up.
6. **No loops behind dense UI.** Only the live connection dot and the records loading rule; both pause hidden and are removed under reduced motion.
7. **No LCP animation.** Page titles/headlines are static.
8. **Interruption:** CSS animations are independent and restart on mount; no queue. Rows are keyed by user id. Dialogs use native `<dialog>`; close is instant.
9. **No new magic numbers.** Use the CSS variables; JS sequences use `tokens.js`.
10. **No second library.** `motion` remains only where it already was (`AnimatePresence` in `main.jsx`); this pass does not add a runtime import.

## Global switch

- `?motion=off` or `?motion=reduced` sets `data-motion` on `<html>`; localStorage persists it.
- `window.chronosMotion.off()`, `.reduced()`, `.full()`, `.set(mode)`, `.get()`.
- `data-motion="off"` disables every `.app` transition/animation and chart animation.
- `data-motion="reduced"` zeroes travel/stagger, removes loops/band/line draws, keeps 120–180 ms fades.
- OS `prefers-reduced-motion: reduce` is equivalent to `reduced` for CSS and `useMotionPreference`.
- Playwright already runs with `reducedMotion: "reduce"`; tests should not need the switch, but it exists for manual QA.

## Pilot calibration lessons (`/teacher` live)

- **What worked:** 180 ms rows + 18 ms stagger feels like a ledger being written; the dialog rise is legible; the live dot is quiet; the header rule orients without a page fade.
- **Cut:** `motion` row presence (40.8 kB gzip) — replaced by CSS entrance; no exit animation. Instant filter removal is better for a working roster.
- **Cut:** layout animation on rows. Live scores re-sort the roster; animating positions would be busy and could jitter the scroll container.
- **Keep:** CSS row entrance, state colour transitions, action note rise, dialog entrance, header rule, mobile rail entrance.
- **Measure:** 4× CPU interactions produced no motion-attributable long task; the page-load long tasks are the existing camera/video stack. The comparable after trace is 0.1357 CLS, the same as baseline; the 0.1065 pilot capture was a different run. No added shift from rows/dialog.
- **Tone:** the room still feels like a tool, not a showpiece; the authored moment is reserved for the record.

## Adding motion to a page

1. Use an existing primitive or token; no new duration/easing.
2. If a new selector is needed, add it to `motion.css` in the relevant section, scoped to `.app`.
3. Keep the resting state identical; motion must be progressive enhancement.
4. Test with `?motion=off`, reduced motion, keyboard, 4× CPU, and the existing Playwright suite.
5. Record a still, a frame sequence/video and a trace for the page.
