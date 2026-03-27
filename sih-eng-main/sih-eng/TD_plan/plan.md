# ChronosBeta Teacher Dashboard — Implementation Plan (HTML-Faithful, Logic-Safe)
---

## 1. Objective

Rebuild the **in-meeting teacher dashboard surface** so that it looks and feels as close as reasonably possible to the provided HTML prototype, while preserving the current ChronosBeta teacher dashboard internals.

This is **not** a product rewrite.

### Primary goals
- Recreate the HTML prototype’s **visual shell, hierarchy, spacing, tone, card anatomy, and interaction feel** as faithfully as possible.
- Preserve the current working ChronosBeta logic:
  - teacher actions
  - websocket-driven updates
  - simulator behavior
  - HMS meeting behavior
  - report/session-end flow
  - current API contracts
  - current state semantics
- Keep implementation risk low by limiting changes to the **teacher in-meeting branch**.

### Final outcome
The finished dashboard should feel like:
- the **same real ChronosBeta dashboard internally**
- but with the **HTML prototype’s skin and UX language externally**

---

## 2. Scope boundary

## 2.1 In scope
Only the **teacher in-meeting dashboard surface**.

That includes:
- full-screen teacher live-room shell
- topbar
- status strip
- stage framing around the existing meeting surface
- right-side live dashboard rail
- summary cards
- filter tabs
- student cards
- action row
- empty/loading/disabled/critical states
- responsive overlay rail behavior under 900px
- dark-theme visual continuity inside this in-meeting branch only

## 2.2 Out of scope
Do **not** redesign or restyle:
- pre-meeting flows
- readiness page
- sign-in / sign-up
- landing pages
- student page
- report flow UI beyond minimal backdrop continuity if absolutely needed
- past-session pages or modals
- auth flow
- routing
- meeting lifecycle architecture
- backend contracts
- websocket protocol

---

## 3. Source of truth and precedence

### 3.1 Functional source of truth
The real ChronosBeta codebase is the absolute functional source of truth.

### 3.2 Visual source of truth
The provided `.html` teacher dashboard prototype is the **visual source of truth** for:
- shell structure
- spacing
- composition
- dark surface treatment
- topbar arrangement
- status strip arrangement
- rail structure
- card layout
- button treatment
- motion tone
- responsive rail behavior

### 3.3 Product constraints
The rewritten design spec and PRD remain the product/constraint source of truth.

### 3.4 Conflict rule
If the `.html` conflicts with the real ChronosBeta behavior:
- preserve ChronosBeta behavior
- preserve the HTML look as much as possible
- do **not** port prototype-only fake logic

---

## 4. Core implementation principle

## Change the skin to match the HTML, not the brain.

That means:
- the UI should be rebuilt to look much closer to the HTML prototype
- the existing handlers, hooks, state ownership, and APIs should stay intact
- any structural refactor should serve **visual fidelity**, not architecture experimentation

### The key correction from earlier plans
Do **not** interpret the HTML loosely as “design inspiration.”

Treat it as a **visual contract**.

The implementation should aim for:
- one-to-one section mapping
- near-equivalent DOM structure where practical
- matching visual rhythm
- matching spacing and grouping
- matching card anatomy
- matching control density
- matching color language
- matching motion tone

Not merely “a premium dark dashboard inspired by it.”

---

## 5. Stack policy

Use the stack already present in the project first.

### Preferred implementation stack
- React components
- existing Tailwind setup
- plain scoped CSS for exact fidelity where Tailwind alone is too approximate

### Strong recommendation
Use a **hybrid approach**:
- Tailwind for broad layout primitives if already natural in the codebase
- a **teacher-dashboard-scoped CSS file** for exact HTML-like styling

This is the best balance between:
- fidelity to the HTML
- fit with the current codebase
- low regression risk

### Do not introduce new dependencies unless truly necessary
Do **not** add new libraries for:
- styling systems
- component kits
- animation libraries
- tooltip libraries
- icon libraries

Unless one of these is true:
1. the project already has them installed and used safely, or
2. the current stack truly cannot reproduce a critical visual requirement

### Preferred approach for icons
Use:
- inline SVGs, or
- very small local React SVG components

Do **not** add a new icon package just for this redesign if inline SVG can handle it.

### Preferred approach for tooltips
Use:
- `title` first, or
- a tiny teacher-local tooltip implementation only if needed for visual parity

Do **not** add a tooltip dependency for this task.

### Preferred approach for motion
Use:
- CSS transitions
- CSS keyframes
- existing stack only

Do **not** add Framer Motion or similar unless already present and already used in the codebase.

---

## 6. Current-code guardrails

The implementation must preserve these as-is unless there is a compelling visual-only reason to wrap them:

- `TeacherPage.jsx` remains the orchestrator for teacher logic
- `useTeacherWebSocket(sessionId)` remains the live data source
- `useClassroomSimulator(...)` remains unchanged
- `HMSMeeting` remains the real live meeting surface
- current teacher actions remain intact:
  - Nudge
  - Engaged
  - Message
  - Ignore
  - Remove
  - Verify
- current top-level controls remain intact:
  - class/exam toggle
  - strict/normal tab toggle
  - simulate classroom toggle
  - check engagement (all)
- current filtering remains intact:
  - flagged-only
  - all students
- current flagged logic remains intact
- current severity ordering remains intact
- current simulated-student behavior remains intact
- current report/session-end flow remains intact

### Explicit non-additions
Do **not** add:
- mute
- dismiss as a separate new behavior
- tile rotation
- fake participant tiling logic
- fake KPI logic
- fake scoring
- fake timers
- new backend-dependent controls

If the HTML shows such elements, translate them visually only where possible, or omit them if they would require behavior changes.

---

## 7. HTML fidelity rules

These are the most important rules in the whole plan.

## 7.1 Recreate the HTML shell closely
The React implementation should mirror the prototype’s major visual regions as closely as practical:

- app frame
- topbar
- workspace
- main stage shell
- status strip
- rail
- summary cards
- tabs
- student cards
- action row

## 7.2 Preserve prototype proportions and hierarchy
The implementation must prioritize:
- similar shell padding
- similar topbar height
- similar rail visual weight
- similar card density
- similar spacing rhythm
- similar control grouping
- similar chip/pill density

## 7.3 Do not genericize the design
Do **not** replace specific HTML treatments with generic “dashboard system” components unless they visually match the HTML closely.

## 7.4 HTML CSS language should be ported, not reimagined
Where possible:
- port the prototype’s visual styling approach into teacher-scoped CSS
- do not create a fresh dark theme from scratch

## 7.5 One-to-one mapping rule
Every major HTML block should map to a React block with equivalent responsibility and similar visual structure.

## 7.6 Visual acceptance rule
The final implementation should be evaluated by side-by-side comparison with the HTML for:
- shell composition
- topbar
- status strip
- stage framing
- rail structure
- summary cards
- student cards
- action row
- surface layering
- spacing/density
- hover/press behavior

---

## 8. Prototype interpretation rules

## 8.1 What to copy faithfully
Copy as faithfully as possible:
- visual composition
- spacing system
- color system
- radii
- shadows
- borders
- typography treatment
- topbar structure
- status strip structure
- right rail layout
- card styling
- pill styling
- icon-button treatment
- motion timing/tone
- overlay rail behavior under 900px

## 8.2 What to adapt carefully
Adapt carefully:
- session metadata fields
- KPI values
- student identity fields
- timestamps
- status labels
- simulated badge
- disabled states
- stage content inside the meeting surface

## 8.3 What not to port
Do **not** port:
- prototype JS logic
- fake participants
- fake timer source
- fake KPI calculations
- fake severity model
- prototype-only actions not supported in ChronosBeta
- custom stage logic that replaces the real meeting system

---

## 9. Visual translation strategy by area

## 9.1 App shell
The in-meeting teacher dashboard should use a teacher-scoped wrapper such as:
- `.td-app`
- `.td-frame`
- `.td-workspace`

The outer shell should match the HTML’s:
- dark premium frame
- rounded container
- layered background
- subtle border
- contained overflow

## 9.2 Topbar
The topbar should be rebuilt to match the HTML much more closely.

It should include:
- Chronos identity cluster
- teacher dashboard title
- session metadata
- teacher identity
- websocket status pill
- existing segmented controls
- primary CTA

The target is **visual fidelity to the HTML topbar**, not a newly invented topbar.

## 9.3 Status strip
The status strip should visually match the HTML:
- compact
- premium
- high-density
- integrated with stage shell

It should show only values safely derivable from current state.

## 9.4 Stage framing
The stage should visually resemble the HTML’s stage container:
- layered dark container
- premium border
- subtle glow/atmospheric background
- matching padding and depth

But:
- `HMSMeeting` remains the actual live meeting content
- do **not** build a fake custom tile stage to imitate the prototype

### Important stage rule
For the stage area, the goal is:
**HTML shell fidelity around the real HMS meeting surface**, not literal recreation of the prototype’s fake participant tiles.

## 9.5 Right rail
The rail should be rebuilt to look much closer to the HTML:
- width
- dark surfaces
- header treatment
- summary card layout
- tabs
- close/open behavior
- scroll region
- spacing rhythm

## 9.6 Student cards
Student cards should be rebuilt to match the HTML card anatomy much more closely.

Each card should visually align to this order:
1. identity row
2. score + state
3. signal pills
4. compact action row

The current code should not just receive new colors; the card structure should be reshaped to visually resemble the prototype.

## 9.7 Action row
The action row should become:
- compact
- icon-first
- visually close to the HTML
- consistent across cards

But it must preserve the current ChronosBeta action set and semantics.

---

## 10. File-by-file implementation plan

## 10.1 `src/pages/TeacherPage.jsx`
**Action:** EDIT

This remains the orchestrator.

### What should change
- only the **in-meeting render branch** should be materially restructured
- wrap the live teacher dashboard in teacher-specific shell markup that mirrors the HTML layout
- move presentational chunks into teacher-only presentational components where helpful
- keep state ownership, handlers, hooks, and derived logic here unless there is a strong reason not to

### What must not change
- teacher logic
- websocket hookup
- simulator hookup
- meeting lifecycle
- report/session-end logic
- route/lifecycle assumptions

### Implementation rule
Do not perform a broad internal rewrite just because the file is large.  
Only restructure enough to cleanly express the HTML-like visual surface.

---

## 10.2 `src/styles/teacher-dashboard.css`
**Action:** CREATE

This should be the primary file for exact visual fidelity.

### Purpose
- port the prototype’s visual language into scoped CSS
- preserve exact or near-exact surface treatment
- avoid forcing everything through approximate utility combinations

### Scope rule
All selectors should be scoped beneath a teacher-only wrapper, for example:
- `.td-app`
- `.td-frame`
- `.td-topbar`
- `.td-stage`
- `.td-rail`
- `.td-student-card`

Do **not** create broad selectors that affect other pages.

### What belongs here
- CSS variables for teacher dashboard only
- shell styling
- topbar styling
- status strip styling
- rail styling
- summary cards
- student cards
- signal pills
- action buttons
- responsive rail behavior
- hover/press motion
- empty/loading/critical states
- optional fine scrollbar styling

---

## 10.3 `tailwind.config.js`
**Action:** EDIT ONLY IF NEEDED

Use the existing Tailwind stack.

### Rule
Only add tokens if they help match the HTML more precisely and keep the code clean.

### Good additions
- missing colors
- missing radii
- missing shadows
- missing animation names

### Do not overuse this file
Do not try to force the entire redesign through Tailwind config work alone.  
Exact visual fidelity should live mostly in the teacher-scoped CSS.

---

## 10.4 `src/components/teacher/DashboardTopbar.jsx`
**Action:** CREATE

### Responsibility
Pure presentational topbar matching the HTML topbar as closely as possible.

### Props
- `sessionId`
- `user`
- `connected`
- `classContextMode`
- `onToggleClassContext`
- `strictMode`
- `onToggleStrictMode`
- `simulateClassroom`
- `onToggleSimulate`
- `livenessLoading`
- `onCheckEngagement`

### Rules
- no business logic inside
- no API knowledge inside
- no state ownership beyond tiny presentational UI state if absolutely needed

---

## 10.5 `src/components/teacher/StatusStrip.jsx`
**Action:** CREATE

### Responsibility
Render the status strip matching the HTML layout.

### Props
- `sessionId`
- `students`
- `sessionStartRef`
- optional derived counts passed from parent if preferred

### Rule
Keep derivation light. If parent already computes values, prefer passing them in.

---

## 10.6 `src/components/teacher/SummaryCards.jsx`
**Action:** CREATE

### Responsibility
Render the HTML-like summary-card row in the rail.

### Props
- `flaggedCount`
- `identityIssueCount`
- `avgScore`

### Rule
Pure presentational.

---

## 10.7 `src/components/teacher/StudentCard.jsx`
**Action:** CREATE

### Responsibility
Render one teacher-student card in the HTML-like structure.

### Props
Pass everything needed from the current teacher page:
- `student`
- `isFlagged`
- `isSimulated`
- `statusLabel`
- `statusColor` or semantic variant
- signal information
- current callbacks for all actions

### Rule
This component must not invent new student logic.
It should only express existing data in a more HTML-faithful visual form.

---

## 10.8 `src/components/NudgeButton.jsx`
**Action:** EDIT CAREFULLY

### Goal
Make it visually compatible with the new compact icon-first action row while preserving its behavior.

### Preferred method
Add a backward-compatible mode such as:
- `variant="teacherIcon"`
or
- `className` passthrough
or
- `iconOnly`

### Rule
Default behavior must stay backward-compatible.

---

## 10.9 `src/hms/HMSMeeting.jsx`
**Action:** LEAVE UNTOUCHED

This should remain the real meeting engine.

### Rule
Do not modify it to mimic the prototype’s fake participant-tile system.

Only its **container** in the teacher dashboard may be visually reframed.

---

## 10.10 Other files
Leave untouched unless there is a clear, necessary, teacher-dashboard-local visual reason:
- websocket hooks
- simulator hooks
- API modules
- student page
- auth pages
- readiness
- report logic
- route files

---

## 11. Recommended implementation structure

This is the safest structure:

```text
TeacherPage (logic/orchestrator)
 └─ in-meeting branch
    └─ .td-app / .td-frame
       ├─ <DashboardTopbar />
       ├─ <div class="td-workspace">
       │  ├─ <main class="td-stage-area">
       │  │  ├─ <StatusStrip />
       │  │  └─ <div class="td-stage-shell">
       │  │     └─ <HMSMeeting />
       │  └─ <aside class="td-rail">
       │     ├─ rail header
       │     ├─ <SummaryCards />
       │     ├─ filter tabs
       │     └─ student list
       │        └─ <StudentCard /> × N
       └─ existing report/session flow remains as-is
````

This keeps:

* logic in `TeacherPage`
* real meeting in `HMSMeeting`
* visual fidelity in teacher-only presentational components and CSS

---

## 12. Responsive behavior plan

## 12.1 Desktop

On desktop, match the HTML composition as closely as possible:

* stage + rail side by side
* rail always visible unless intentionally collapsed
* topbar stable
* no awkward wrapping

## 12.2 Under 900px

Implement the overlay rail behavior.

### Rules

* rail becomes overlay
* rail opens over the stage area
* backdrop/shadow should match the prototype feel
* opening/closing should be smooth but subtle
* no logic change in list rendering

This is a real requirement, not optional polish.

---

## 13. Visual fidelity checkpoints

The implementation should be reviewed against the HTML after each major stage.

## 13.1 Must-match areas

* overall shell
* topbar arrangement
* topbar spacing
* websocket badge tone
* segmented controls
* CTA treatment
* status strip density
* rail width/weight
* summary-card look
* filter-tab look
* card anatomy
* signal-pill look
* action-button look
* dark surface layering
* motion tone

## 13.2 Acceptable adaptations

* real meeting content inside stage
* real student data shape
* real action set
* omission of prototype-only unsupported behavior

---

## 14. Execution phases

## Phase 0 — Baseline and screenshots

1. Run current app.
2. Capture current teacher in-meeting screen.
3. Put HTML and current UI side by side.
4. Identify the biggest visual mismatches before touching code.

## Phase 1 — CSS foundation from HTML

1. Create `teacher-dashboard.css`.
2. Port the HTML’s core visual tokens and structural classes into teacher-scoped CSS.
3. Do not style other pages.
4. Import this CSS only where teacher dashboard needs it.

## Phase 2 — Shell and topbar fidelity

1. Build the outer shell and topbar first.
2. Match the HTML structure as closely as possible.
3. Move existing top-level controls into the HTML-like topbar.
4. Keep their behavior unchanged.

## Phase 3 — Status strip and stage shell

1. Add the status strip visually matching the HTML.
2. Reframe the meeting area with the HTML-like stage shell.
3. Keep `HMSMeeting` untouched.

## Phase 4 — Rail fidelity

1. Rebuild the rail structure to match the HTML more closely.
2. Add summary cards.
3. Add segmented tabs.
4. Implement overlay behavior under 900px.

## Phase 5 — Student cards

1. Rebuild the card anatomy closer to the HTML.
2. Add HTML-like signal pills.
3. Make spacing, density, and grouping closer to the prototype.
4. Preserve all current data semantics.

## Phase 6 — Action row

1. Convert to compact icon-first controls.
2. Keep current action set and semantics.
3. Make `NudgeButton` visually fit.
4. Keep disabled simulated-user behavior.

## Phase 7 — State polish

1. Empty states
2. Loading states
3. Disconnected state
4. Critical emphasis
5. Hover/press feedback

## Phase 8 — Visual fidelity pass

1. Compare to HTML again section by section.
2. Tighten spacing and proportions.
3. Fix anything that still feels like a generic reinterpretation.

## Phase 9 — Regression verification

1. Test all teacher actions.
2. Test websocket updates.
3. Test simulator.
4. Test session leave/report.
5. Test overlay rail.
6. Verify no spillover to other pages.

---

## 15. Validation checklist

## Functional

* [ ] teacher in-meeting dashboard still loads
* [ ] `HMSMeeting` still works correctly
* [ ] websocket updates still populate student state
* [ ] flagged-only filter still works
* [ ] all-students filter still works
* [ ] severity ordering still works
* [ ] Nudge still works
* [ ] Engaged still works
* [ ] Message still works
* [ ] Ignore still works
* [ ] Remove still works
* [ ] Verify still works
* [ ] class/exam toggle still works
* [ ] strict/normal toggle still works
* [ ] simulate classroom still works
* [ ] check engagement (all) still works
* [ ] session-end/report flow still works

## Visual

* [ ] topbar looks materially close to the HTML
* [ ] status strip looks materially close to the HTML
* [ ] stage shell looks materially close to the HTML
* [ ] rail looks materially close to the HTML
* [ ] summary cards look materially close to the HTML
* [ ] student cards look materially close to the HTML
* [ ] action row looks materially close to the HTML
* [ ] spacing/density is close to the HTML
* [ ] control grouping is close to the HTML
* [ ] overlay rail behavior matches the intended HTML behavior
* [ ] the final result does not just look like a generic dark redesign

## Safety

* [ ] no unrelated pages were redesigned
* [ ] no broad global style bleed happened
* [ ] no new backend dependency was introduced
* [ ] no prototype fake logic replaced real code
* [ ] `HMSMeeting` was not replaced or behaviorally modified
* [ ] existing teacher logic remained intact

---

## 16. Non-goals

Do **not** do any of the following in this implementation:

* redesign previous pages
* redesign student page
* rewrite routing
* rewrite readiness flow
* rewrite meeting lifecycle
* rewrite report flow
* add mute
* add tile rotation
* add prototype-only participant logic
* add new backend actions
* add new dependencies unless truly required
* refactor the teacher dashboard beyond what is needed for visual fidelity and code cleanliness

---

## 17. Guardrails for the implementing agent

1. **The HTML is the visual fidelity target, not loose inspiration.**
2. **ChronosBeta code is the behavioral truth.**
3. **Keep the current stack.**
4. **Prefer existing React + Tailwind + scoped CSS over new libraries.**
5. **Use teacher-specific CSS for exact visual matching.**
6. **Do not redesign previous pages.**
7. **Do not replace `HMSMeeting`.**
8. **Do not introduce new functionality unless required for visual parity and safely supported by the current stack.**
9. **If a visual element in the HTML requires unsupported behavior, preserve the current behavior and approximate the look only.**
10. **When forced to choose between visual experimentation and internal safety, choose internal safety — but still push hard for HTML fidelity in the surface layer.**
11. **Do a side-by-side comparison with the HTML before considering the task complete.**

---

## 18. Final definition of success

This implementation is successful only when:

* the teacher dashboard still behaves like the real current ChronosBeta dashboard,
* no unrelated screens are visually changed,
* the HTML prototype is recognizably and closely reflected in the final in-meeting teacher dashboard,
* and the result feels like a faithful React adaptation of that prototype rather than a separate redesign.