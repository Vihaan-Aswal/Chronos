# ChronosBeta Teacher Dashboard — Design Specification

## 1. Purpose

This document defines the final visual and interaction design for the ChronosBeta Teacher Dashboard.

This is **not** a greenfield dashboard design. It is a **UI/UX reskin and interaction polish** of the existing ChronosBeta teacher dashboard. The visual design should change substantially; the functional internals should not.

The final implementation must preserve the existing ChronosBeta teacher dashboard’s:

- meeting engine
- teacher actions
- live session behavior
- student prioritization logic
- backend/API contracts
- websocket-driven updates
- report generation flow
- current state semantics

The purpose of this spec is to let the dashboard look and feel like the new premium teacher dashboard prototype while keeping the underlying dashboard behavior and data model rooted in the real codebase.

---

## 2. Source of truth and precedence

The implementation must follow this precedence order:

### 2.1 Functional source of truth

The real ChronosBeta codebase is the functional source of truth, especially:

- `src/pages/TeacherPage.jsx`
- `src/hooks/useTeacherWebSocket.js`
- `src/hooks/useClassroomSimulator.js`
- `src/components/NudgeButton.jsx`
- `src/api/nudge.js`
- `src/api/teacherActions.js`
- `src/api/liveness.js`
- `src/hms/HMSMeeting.jsx`
- `src/components/SessionReport.jsx`

### 2.2 Visual source of truth

The `.html` prototype is the visual source of truth for:

- color mood
- shell layout
- header treatment
- status strip style
- sidebar styling
- card structure
- icon button presentation
- motion tone
- spacing and depth language

### 2.3 Product/interaction source of truth

This design spec and the rewritten PRD are the source of truth for how to translate the HTML into the existing ChronosBeta teacher dashboard safely.

### 2.4 Explicit rule

If the `.html` prototype conflicts with the real ChronosBeta implementation, the agent must:

- keep the existing ChronosBeta functionality,
- adapt the prototype visually,
- not port prototype logic that would replace working code.

---

## 3. Design intent

The teacher dashboard should feel like a **live command center for classroom supervision**:

- premium
- dark
- calm but high-alert
- operational
- polished
- trustworthy
- dense without feeling cluttered

It should not feel like:

- a generic admin panel
- a surveillance dashboard
- a gaming HUD
- a redesign that ignores the current product structure

The teacher should feel that they are still using the same ChronosBeta dashboard, just with a much stronger surface design and more deliberate interaction design.

---

## 4. Core implementation guardrail

This redesign is **skin, structure, and interaction polish only**.

That means:

- visual hierarchy may change
- layout may change
- card design may change
- control styling may change
- action presentation may change
- motion and micro-interactions may change

But these should **not** change:

- the dashboard’s action semantics
- how students are flagged
- how students are sorted
- which actions exist
- how actions call APIs
- how HMS meeting is mounted and used
- websocket subscription and student state updates
- session analytics/reporting flow
- existing page lifecycle, unless separately approved

---

## 5. Scope of this design

This design applies to the **teacher dashboard live session screen**.

### In scope

- teacher page visual shell
- top header / topbar
- session status strip
- meeting stage framing
- right-side live dashboard / rail
- student cards in the teacher monitoring list
- action button styling and arrangement
- summary metric blocks
- filter controls
- empty/loading/connection states
- motion, hover, press, and attention behavior
- responsive layout behavior for desktop-width usage

### In scope only as cosmetic alignment

- end-of-session report entry/exit visual continuity
- past sessions modal styling if touched during dashboard refactor

### Out of scope

- changing meeting lifecycle architecture
- replacing `HMSMeeting`
- redesigning the session report product
- adding new backend actions
- changing websocket event schema
- changing the teacher dashboard’s business logic
- adding net-new teacher capabilities not already supported by ChronosBeta
- porting the prototype’s fake participant logic into the production app

---

## 6. Prototype usage rules

The `.html` prototype must be used carefully.

### 6.1 The HTML is for visual reference only

The prototype should be used as reference for:

- surface styling
- spatial arrangement
- visual grouping
- chips/badges/pills/buttons
- icons and control density
- premium dark theme treatment
- sidebar layout
- topbar treatment
- KPI styling
- motion cues

### 6.2 The HTML is not a behavioral source of truth

Do **not** port the prototype’s:

- hardcoded participant data
- JS rotation logic
- fake timer logic
- fake KPI math
- fake filter logic
- dummy student list logic
- placeholder action behaviors
- dummy mute behavior
- tile-rendering logic that competes with `HMSMeeting`

### 6.3 Correct interpretation of the prototype

The prototype shows the **desired presentation language**, not the implementation architecture.

Examples:

- the prototype’s tile grid is inspiration for stage framing, not a replacement for the real HMS meeting area
- the prototype’s student cards show the intended visual hierarchy, not the final data model
- the prototype includes `Mute`, but current ChronosBeta does not currently expose a teacher mute action in the working dashboard; therefore mute is not mandatory in the redesign

---

## 7. Functional invariants that the design must respect

The design must preserve the following existing ChronosBeta behaviors.

### 7.1 Existing per-student actions

The UI must preserve these current actions:

- Nudge
- Engaged
- Message
- Ignore
- Remove
- Verify

The redesign may restyle these, regroup them, iconify them, or change spacing, but must not change their behavior.

### 7.2 Existing class-wide actions

The UI must preserve these current top-level controls:

- class/exam context toggle
- strict/normal tab policy toggle
- simulate classroom toggle
- check engagement (all)

### 7.3 Existing student logic

The UI must preserve:

- flagged-only vs all-students filtering
- current flagged logic
- current severity sorting
- simulated student labeling and disabled action behavior
- current status labels and thresholds unless explicitly changed in code by product decision

### 7.4 Existing meeting area

The live class stage must continue to use `HMSMeeting` as the primary live meeting surface.

The redesign may reskin the container around it, but should not replace or rebuild the meeting engine.

### 7.5 Existing report flow

The session report and session end flow should remain functionally intact.

---

## 8. Visual direction

The visual direction should follow the prototype’s “midnight operations room” language.

### Key traits

- deep blue-black background
- layered glass/dark panels
- subtle gold accents for product authority
- restrained but crisp semantic colors
- premium gradients, soft borders, blurred depth
- compact information density
- strong typographic hierarchy
- polished micro-motion

### Emotional tone

- calm control
- quiet authority
- live intelligence
- academic professionalism
- high-signal operational monitoring

---

## 9. Color system

Use the prototype palette as the primary design basis.

### Core surfaces

- `--bg`: `#041523`
- `--bg-deep`: `#020e18`
- `--surface-0`: `rgba(4, 17, 30, 0.96)`
- `--surface-1`: `rgba(7, 24, 38, 0.92)`
- `--surface-2`: `rgba(10, 31, 48, 0.88)`
- `--surface-3`: `rgba(14, 37, 57, 0.84)`

### Borders

- low-contrast cool border for default containers
- stronger border for selected/active/high-signal areas
- warm gold-accent border for premium or primary CTA emphasis

### Text

- primary: cool light text
- secondary: dimmed cool text
- tertiary: subdued metadata text

### Semantic colors

- green = healthy / attentive / connected / verified
- amber = warning / review / focus dip / moderate concern
- red = critical / identity mismatch / severe disengagement / destructive action
- violet = suspicious / integrity-related / simulated / liveness-related or policy-alert states
- blue = neutral control / session mode / non-severity UI state
- gold = authority / product identity / hero CTA / premium emphasis

### Color usage rule

Semantic colors must remain meaningful. Decorative overuse should be avoided.

---

## 10. Typography

### Primary typeface

Use **Manrope** for operational content.

### Secondary/editorial

The prototype loads **Newsreader**, but for the actual teacher dashboard it should be used minimally or not at all unless there is a very deliberate brand use case. Dense real-time dashboard surfaces should remain Manrope-first.

### Typographic rules

- favor crisp, compact sans-serif presentation
- use high contrast for core numbers and actions
- use small uppercase/semibold labels for chips and metadata
- use tabular or visually stable numerals where helpful
- avoid large ornamental display copy in the operational area

### Typical scale

- tiny metadata: 10–11px
- compact label: 11–12px
- body/control: 12–14px
- section heading: 14–16px
- KPI or major number: 18–24px
- large score emphasis: 24–32px as needed

---

## 11. Spatial system

### Radius scale

- xs: 8px
- sm: 12px
- md: 16px
- lg: 22px
- xl: 28px

### Spacing rhythm

The dashboard should feel dense but premium:

- shell padding: 12–16px
- panel padding: 12–16px
- compact internal gaps: 4px / 6px / 8px
- standard grouping gaps: 10px / 12px
- large section gaps: 16px / 20px

### Density goal

The layout should support fast scanning without becoming cramped. The redesign should feel tighter and more intentional than the current implementation, not more crowded.

---

## 12. Depth, texture, and shell language

### Depth

Use layered dark panels, subtle gradients, faint inset borders, and restrained shadows.

### Texture

A very subtle background grid or atmospheric lighting layer may be used if it stays understated and does not reduce readability.

### Blur

Glassmorphism effects should be restrained. Use blur for premium depth, not for novelty.

### Rule

The interface should feel expensive and live, but not flashy.

---

## 13. Motion system

### Timing

- fast: 120ms
- medium: 200ms
- slow: 300ms

### Easing

Use a smooth premium easing such as:
`cubic-bezier(0.16, 1, 0.3, 1)`

### Motion types

Approved:

- hover lift
- hover glow
- press compression
- pill color transitions
- soft panel reveal
- sidebar slide-in/out
- badge pulse for live state
- subtle pulse for critical state

Avoid:

- bouncy motion
- large transforms
- exaggerated scaling
- decorative animation loops that distract from live supervision

### Behavioral rule

Motion should emphasize liveness and clarity, not spectacle.

---

## 14. Layout architecture

The final layout should adopt the prototype’s visual architecture but remain compatible with the actual ChronosBeta page.

### 14.1 Overall shell

A full-screen dark app shell with:

- premium topbar
- status strip under topbar
- large meeting stage as primary visual area
- live dashboard rail on the right

### 14.2 Topbar

The topbar should span the width of the dashboard and contain:

- Chronos brand area
- page title
- session metadata
- teacher identity / email
- websocket status badge
- session controls
- class-wide CTA

### 14.3 Status strip

A compact strip under the topbar should show:

- session ID
- timer / live duration display if available
- present count
- attentive count
- review count
- critical count

If some data is not currently available or would require new logic, the strip should gracefully adapt using existing available signals only.

### 14.4 Stage

The left/main area should visually wrap the existing `HMSMeeting` component inside a more premium stage shell. The implementation should not replace the HMS grid logic.

### 14.5 Live dashboard rail

The right-side teacher dashboard list should become a more refined “live dashboard” rail:

- premium header
- summary cards
- filter tabs
- student list
- action rows
- empty state
- scrollable list

### 14.6 Sidebar behavior

The rail may be:

- always visible on desktop, or
- collapsible using the prototype’s “live dashboard” affordance

If made collapsible, this must remain a presentation change only. The underlying student list logic must stay the same.

---

## 15. Mapping the prototype to ChronosBeta

This section is critical.

### 15.1 Adopt directly

These prototype elements should be adopted visually with minimal reinterpretation:

- topbar styling
- brand/identity cluster
- websocket live badge style
- segmented control style
- premium CTA styling
- compact status strip treatment
- dark premium shell treatment
- right-rail header and summary-card styling
- flagged/all tab treatment
- signal pill styling language
- icon-first compact action button language
- overall dark premium aesthetic
- hover/press micro-motion approach

### 15.2 Adapt carefully

These prototype elements should be adapted to fit the real code:

- status KPIs must use real ChronosBeta data
- student cards must reflect actual teacher-page data shape
- names/IDs must respect current available identity data
- simulated tags must map to actual `isSimulated` logic
- card state coloring must reflect current ChronosBeta flag logic
- the sidebar open/close behavior must not disrupt current teacher actions
- topbar controls must map to current existing handlers only

### 15.3 Do not port as-is

These prototype elements should not be copied literally:

- prototype participant JS data array
- prototype fake rotation logic
- prototype fake student scoring logic
- prototype fake class list calculations
- prototype hardcoded timer logic
- prototype mute action as a required feature
- prototype stage tile system as a replacement for HMSMeeting

---

## 16. Component-level design specification

## 16.1 Topbar

### Purpose

Create identity, trust, and operational control.

### Contents

- Chronos brand mark
- “Teacher Dashboard” label
- session ID
- teacher identifier
- live websocket badge
- current session controls
- class-wide action button

### Behavior

- always visible during the live session
- visually dense but clean
- no wrapping into messy multi-line control stacks on standard desktop widths

### Notes

The topbar is a visual upgrade of the current right-rail header controls into a more authoritative global header.

---

## 16.2 WebSocket status badge

### Purpose

Communicate connection state.

### States

- connected
- disconnected
- reconnecting if implemented visually from existing connection states

### Visual treatment

- pill
- compact
- pulsing dot for connected
- semantic color shift by state

### Rule

The label should remain short and instantly scannable.

---

## 16.3 Session control group

### Controls to preserve

- class/exam mode toggle
- strict/normal tab toggle
- simulate classroom toggle

### Visual behavior

- grouped pill controls
- active state clearly visible
- inactive state subdued
- icons optional but encouraged
- labels concise

### Rule

Do not rename controls in a way that obscures their current ChronosBeta meaning.

---

## 16.4 Class-wide CTA

### Current function to preserve

`Check engagement (all)`

### Visual behavior

- primary CTA treatment
- high visibility but not destructive
- should look like the main dashboard-wide action

### Loading state

When liveness is in progress, the button should:

- show a loading state,
- become disabled,
- preserve layout stability

---

## 16.5 Status strip

### Purpose

Enable a quick top-level scan before looking at individual cards.

### Recommended contents

- session ID
- elapsed time or live timer if already available
- present
- attentive
- review
- critical

### Data rule

Use only data that already exists or can be derived from the current page state without inventing new backend logic.

### Visual behavior

- compact
- horizontally organized
- premium chips
- clear semantic color coding

---

## 16.6 Meeting stage shell

### Purpose

Present the live HMS meeting in a more intentional, premium environment.

### Rules

- keep `HMSMeeting` as the live meeting component
- restyle the containing region around it
- do not rebuild its peer grid logic unless separately approved
- do not replace it with the prototype’s tile engine

### Allowed polish

- better background treatment
- better edge framing
- stronger separation from the rail
- subtle overlays or badges
- improved container padding and visual depth

---

## 16.7 Live dashboard rail

### Purpose

Preserve the existing right-side teacher dashboard, but reskin it as a higher-end monitoring rail.

### Structure

- rail header
- summary row
- filter tabs
- student list

### Behavior

- scrollable list
- stable width
- premium dark-surface styling
- should not feel like a separate app pasted next to the meeting

---

## 16.8 Summary cards

### Purpose

Provide quick snapshot metrics above the student list.

### Suggested cards

- Flagged
- Identity
- Avg score

These map well to the prototype and to existing ChronosBeta teacher-state concepts.

### Data rule

Only show summary metrics that can be computed from existing page state.

---

## 16.9 Filter tabs

### Current behavior to preserve

- flagged only
- all students

### Visual behavior

- segmented or tabbed control
- active state obvious
- easy one-click switching

### Default

Respect the current logic/default behavior unless intentionally changed.

---

## 16.10 Student card

### Purpose

Represent one monitored student with:

- identity
- status
- risk indicators
- available actions

### Card anatomy

A student card should include:

- student identifier area
- optional simulated badge
- score emphasis
- status badge/label
- last-seen or last-update timestamp
- signal pills / event chips
- action row

### Visual hierarchy

Top to bottom:

1. identity row
2. score + status
3. signals / flags
4. actions

### Density

Cards should feel compact and scannable, not airy.

---

## 16.11 Student identity area

### Contents

- student display name or shortened ID
- simulated tag when applicable
- optional mode chip if useful and already available

### Rule

Do not fabricate identity fields the real data does not provide.

If the real dashboard only has user IDs, the design should present them elegantly rather than inventing fake names.

---

## 16.12 Score and status block

### Contents

- engagement score percentage
- primary status label

### Status labels to preserve

Current ChronosBeta labels include:

- Attentive
- Distracted
- Away
- Disengaged
- Identity Mismatch

### Visual behavior

- large score emphasis
- compact status badge
- semantic color-coded status

---

## 16.13 Signal pills

### Purpose

Surface the specific reasons a student requires attention.

### Current signal categories that should be visually supported

- identity mismatch
- multiple faces
- tab switched
- liveness fail
- strikes
- simulated
- stable / focus dip / similar non-critical fallback labels where appropriate

### Visual treatment

- compact pills
- semantic tint
- strong contrast
- easy scan at a glance

---

## 16.14 Action row

### Existing actions to preserve

- Nudge
- Engaged
- Message
- Ignore
- Remove
- Verify

### Visual treatment

The action row may move from text-heavy buttons to compact icon-first or icon-only buttons inspired by the prototype.

### Critical rule

The redesign may change the look of the action controls, but must not:

- remove existing working actions,
- change their meaning,
- alter their event flow.

### Mute

The prototype includes Mute, but current ChronosBeta does not rely on mute as a working existing dashboard action. Therefore mute is **not required** in the finalized teacher dashboard redesign unless separately approved and properly implemented end-to-end.

---

## 16.15 Disabled and simulated states

### Simulated students

Simulated students must remain visually distinct.

### Existing behavior to preserve

Actions that are currently disabled for simulated students should remain disabled.

### Design behavior

Disabled actions must still look intentional:

- lower opacity
- disabled cursor
- no hover glow
- clear visual consistency

---

## 16.16 Empty state

### Flagged view empty state

When there are no flagged students, the dashboard should show a calm, premium empty state.

### Rule

The empty state should reassure the teacher without feeling dead or broken.

---

## 16.17 Loading states

### Cases

- liveness loading
- past sessions loading if touched
- connection recovery
- student list awaiting data

### Design rule

Loading states should be subtle and premium, not generic spinners dropped in without styling.

---

## 16.18 Critical and destructive states

### Critical student cards

Critical cards should receive stronger visual emphasis through:

- border intensity
- glow/aura
- stronger chip tint
- score/status emphasis

### Remove action

Remove should remain the visually most destructive per-student action.

### Rule

Do not make destructive actions visually dominant unless needed.

---

## 17. Visual semantics mapped to current ChronosBeta logic

The design must reflect the real existing logic.

### Attentive

Healthy/green state.
Score-driven, non-critical.

### Distracted

Amber/review state.
Needs watchfulness but not panic.

### Away / disengaged

Red state.
Should feel immediately intervention-worthy.

### Identity mismatch

High-severity red state.
Must be visually unmistakable.

### Multi-face / liveness / anti-cheat

Warning-to-critical states depending on current logic.
Should appear as clear signal pills.

### Simulated

Violet or similar non-real-participant accent.
Must not look identical to real students.

---

## 18. Responsive behavior

### Primary target

Desktop and laptop classroom-monitoring usage.

### Expected layout

- topbar remains global
- stage remains primary
- rail remains readable and actionable
- no cramped stacking on standard laptop widths

### Narrow widths

On narrower widths:

- the right rail may collapse or overlay
- the topbar controls may compress
- text may truncate intelligently
- the meeting stage must remain usable

### Rule

Responsiveness should preserve operability, not merely shrink content.

---

## 19. Accessibility

The redesigned dashboard must:

- maintain keyboard accessibility for all actionable controls
- preserve clear focus states
- not rely on color alone for meaning
- preserve readable contrast on dark surfaces
- ensure icon-only actions have accessible labels/tooltips
- keep tap/click targets reasonable
- avoid tiny low-contrast metadata for critical information

---

## 20. Design do / do not

### Do

- strongly reskin the dashboard
- use the `.html` prototype’s mood and visual hierarchy
- make the teacher dashboard feel premium and deliberate
- improve scanability
- improve card hierarchy and action clarity
- tighten spacing intelligently
- make the topbar feel more like a real product shell

### Do not

- rewrite ChronosBeta teacher-page business logic
- replace `HMSMeeting`
- port the prototype’s JS logic into the React app
- invent new actions as mandatory requirements
- remove current actions because the prototype did not emphasize them
- change the route/session lifecycle as part of this UI work
- over-animate live monitoring surfaces

---

## 21. Final design constraints for implementation

The final implementation should satisfy all of the following:

1. It should be immediately recognizable as the new premium teacher dashboard.
2. It should still behave like the current ChronosBeta teacher dashboard.
3. It should preserve existing action wiring and data flow.
4. It should use the `.html` as a visual reference, not as a behavior spec.
5. It should minimize risk to the current codebase.
6. It should not introduce architecture changes unless separately approved.
7. It should feel cohesive with the existing product rather than like a disconnected prototype pasted on top.

---

## 22. Design acceptance criteria

The design work is successful when all of the following are true:

- the teacher dashboard looks materially upgraded relative to the current UI
- the live meeting still works through the existing ChronosBeta meeting flow
- all current teacher actions still exist and behave the same
- student ranking/filtering still behaves the same
- simulated students are still handled correctly
- the top-level controls still behave the same
- the dashboard can be implemented without invasive backend or architecture changes
- no part of the prototype has been copied in a way that overrides real ChronosBeta logic
