# Design language — extracted from the frozen homepage

Source of truth: `/` at commit `426493c7ffd874b32a8c9cdf4f2b882b14fdf0de`
(`main/app/frontend/src/pages/home-page.jsx`, `src/styles/home-page.css`,
`src/components/home/*`, `DESIGN.md`, `PRODUCT.md`).

The app pages must read as the same product: one warm room, printed school record,
forest fields, cream paper, ruled ledgers, square buttons, serif voice.

## 1. Colour (exact values from `.home`)

| Token | Value | Use |
|---|---|---|
| `--cream` | `#f7f2e7` | page ground |
| `--cream-bright` | `#fcf9f1` | lifted paper surfaces (room window head, cards) |
| `--cream-deep` | `#efe8d8` | recessed paper, table stripes |
| `--forest` | `#0f2e25` | full dark fields (hero, settings, live room shell) |
| `--forest-deep` | `#0a231c` | footer, deepest field |
| `--forest-soft` | `#173a2f` | ink-button hover, raised forest surface |
| `--ink` | `#0b1a14` | type, primary buttons, focus rings |
| `--slate` | `#56685c` | secondary copy, metadata |
| `--sage` | `#c9d5bf` | attention state, copy on forest |
| `--sage-soft` | `#e3e9d9` | attentive fill, disabled |
| `--sage-ink` | `#4c6146` | italic emphasis on cream, attentive dot |
| `--gold` | `#d8be8a` | 1px hairlines only (never fill, never text on cream) |
| `--red` | `#b3261e` | flags only: disengaged, identity mismatch, "never kept" |
| `--line` | `rgba(11,26,20,.16)` | section rules |
| `--line-soft` | `rgba(11,26,20,.09)` | row rules |
| `--line-cream` | `rgba(247,242,231,.18)` | rules on forest |

State fills (from the seating plan):
- attentive `#e6edda` / border `#cfdcc4` / dot `#4c6146`
- distracted `#f1e6c9` / border `#e2d3ad` / dot `#8a6a2f`
- away `#e6e3d8` / border `#d6d2c4` / dot ring slate
- disengaged `#f4ded9` / border `#e4c4bd` / dot `#b3261e`
- identity mismatch `#f4ded9` + 1.5px `#b3261e` border / dot ring red
- NO_DATA transparent, 1px dashed `rgba(11,26,20,.38)` / dashed slate dot

Named rules (from DESIGN.md, still binding):
- **Field rule:** forest owns whole regions, never a badge.
- **Gold hairline rule:** gold is 1px. No gold fills, no gold body text on cream.
- **Red is a flag:** never a button, link or decoration.

## 2. Type

- **Newsreader** (`Georgia, serif`): display, section headlines, panel titles, numerals in records.
  - display `clamp(52px,7.2vw,96px)` / 0.9 / -0.038em — hero only
  - headline `clamp(40px,5vw,64px)` / 0.98 / -0.03em — section heads
  - title 30–32px / 1–1.1 / -0.02em — panel and ledger headings
- **Manrope** (`system-ui, sans-serif`): every label, control, number, operational line.
  - body 16px / 1.65, measure 42–52ch (max 72ch)
  - label 10–12px / 800 / 0.06–0.12em / uppercase
  - data: tabular numerals for counts, timers, scores
- **One italic rule:** italic marks one emphasis phrase per heading (`<em>`), never a whole paragraph or a button.

## 3. Space, grid, shape

- Content column `1240px`, inline padding `32px` (20px at ≤480).
- Section rhythm `clamp(72px, 9vw, 120px)` block padding; `clamp(40px,5vw,64px)` between head and body.
- Grid: two-column heads `1.1fr / 0.9fr` aligned to the baseline; ledger splits `1fr 1fr` with a 1px rule.
- Radii: buttons 2px, inputs 3px, tiles 6px, windows/notes 10px. The arch is reserved for the homepage room and must not be repeated.
- Elevation: flat. One lifted artifact per page at most (`0 50px 100px -40px rgba(0,0,0,.7)` over forest). No card shadows, no glass, no gradients as decoration.
- Buttons: min-height 48px (40px small), square, uppercase 11px/800/0.08em.
- Focus: 2px solid ink on cream, 2px gold on forest, offset 3px.
- Selection: sage on ink.

## 4. Component idioms the homepage establishes

- **Ruled section head:** serif `h2` with one italic phrase + a right-hand `p` in slate, ending in a hairline.
- **Ledger:** rows of 1px hairlines, icon + line of copy, no cards.
- **Tablist:** square, bottom rule; selected = ink field with cream type (room window: Before / In session / After).
- **Legend strip:** ruled six-column band with a state dot and a count; the active filter is an ink field.
- **Note:** cream card with one 2px corner (speech bubble) — the student's private note.
- **Header:** transparent over forest, cream field + hairline after scroll; Newsreader wordmark, 11px uppercase Manrope links, square cream/ink CTA.
- **Footer:** forest-deep, gold hairline, wordmark + one-line stance + ruled link row.
- **Voice:** short declaratives, no exclamation, no marketing adjectives, "one state at a time", "the teacher decides", "a record, not a recording". Numbers as facts. Sample data labelled illustrative.

## 5. What the app pages need beyond the homepage

These are legitimately denser and must extend the same language, not fork it:

- App shell: signed-in header with session identity and account actions; skip link; content max 1440 for working surfaces (forms stay ≤ 640).
- Forms: label above input, 44px min height, 3px radius, cream-bright field on cream, hairline border, ink focus ring, inline error under the field, one primary action.
- Tables/lists: ruled rows (no card-per-row), 44px targets, tabular numerals, state dot + text.
- Badges: text + dot, square-ish 2px, tinted paper fills only from the state palette.
- Dialogs/drawers: cream paper, ink rule, serif title, square buttons; forest scrim.
- Toasts/banners: ruled strip, no shadow.
- Charts: ink axes, hairline grid, sage/gold/red data marks; serif titles; numbers in Manrope tabular.
- Live stage: forest field holds the video stage (the "room" of the homepage), cream rail holds the working record. This is the one place app density differs: the rail is a working list, not a marketing section.

## 6. Personality

Calm, exact, humane. A printed school record, not a SaaS console. It notices people, not scores. It never alarms; flags are facts with a next step. Humour is dry and rare ("Twenty desks, six labels, one teacher's judgment.").
