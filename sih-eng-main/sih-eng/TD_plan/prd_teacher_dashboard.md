# ChronosBeta Teacher Dashboard — Product Requirements Document

## 1. Product overview

The ChronosBeta Teacher Dashboard is the teacher-facing live session supervision interface used during an active class.

The final teacher dashboard for this project is a **high-fidelity UI/UX redesign of the existing ChronosBeta teacher dashboard**, not a new dashboard product.

The new dashboard must:

- preserve the existing working teacher functionality,
- preserve the existing backend and websocket integrations,
- preserve the existing meeting engine,
- preserve the current data and action model,
- adopt the improved visual and interaction language from the provided HTML prototype.

This PRD defines the final product requirements for that redesign.

---

## 2. Product objective

The objective is to make the teacher dashboard feel significantly more polished, premium, and operationally clear without destabilizing the real system.

The final screen should help a teacher answer these questions quickly:

1. Is the session live and connected?
2. How healthy is the class overall?
3. Which students need attention first?
4. Why are they being flagged?
5. What action can I take immediately?

---

## 3. Source-of-truth rule

The final implementation must follow this hierarchy:

### 3.1 Functional truth

The existing ChronosBeta codebase is the functional source of truth.

### 3.2 Visual truth

The HTML prototype is the visual reference source.

### 3.3 Final product truth

This PRD and the rewritten design spec define how the prototype should be translated into the real codebase safely.

### 3.4 Conflict rule

If the prototype suggests behavior that conflicts with the current app, the implementation must preserve the current app behavior unless there is an explicit approved product change.

---

## 4. Problem statement

The current teacher dashboard is functional, but its presentation is less refined than the rest of the intended Chronos experience.

The current UI creates the following product issues:

- weaker visual hierarchy than ideal
- less premium perception than the prototype direction
- less compact and elegant action presentation
- less cohesive stage/header/rail relationship
- less sophisticated at-a-glance status presentation

The goal is to fix these without creating regressions in the live teacher workflow.

---

## 5. Product goals

### 5.1 Primary goals

- preserve all current teacher dashboard functionality
- ship a stronger visual design aligned to the prototype
- improve at-a-glance scanning of risk, status, and actions
- make the dashboard feel premium and intentional
- keep implementation risk low

### 5.2 Secondary goals

- improve demo quality
- improve perceived maturity of the product
- create a design foundation for future teacher-facing dashboard evolution

---

## 6. Non-goals

This project does **not** aim to:

- redesign the teacher workflow from scratch
- replace the meeting engine
- change the teacher page lifecycle
- add brand-new backend-powered controls
- change websocket schemas
- rewrite the report system
- introduce speculative features purely because they appear in the prototype
- refactor unrelated pages/routes/auth flows

---

## 7. Users

### Primary user

A teacher running a live Chronos class session who needs to:

- monitor class health
- review flagged students
- intervene quickly
- remain anchored in the live meeting

### Secondary stakeholders

- product reviewers
- demos/pilot stakeholders
- engineering team maintaining the dashboard
- future design/UX contributors

---

## 8. Current ChronosBeta reality that must be preserved

This section is critical.

The existing teacher dashboard already includes real working functionality that must remain intact.

### 8.1 Existing top-level control surface

Current teacher-page functionality includes:

- class/exam context toggle
- strict/normal tab policy toggle
- simulate classroom toggle
- class-wide engagement check

### 8.2 Existing teacher roster/dashboard functionality

Current teacher-page functionality includes:

- flagged-only vs all-students filter
- student sorting by severity
- per-student actions
- state-based card treatment
- simulated student handling
- ignored and removed local states

### 8.3 Existing per-student actions

Current working actions are:

- Nudge
- Engaged
- Message
- Ignore
- Remove
- Verify

These are the actions the redesign must support.

### 8.4 Existing live meeting surface

The live meeting is rendered using `HMSMeeting`.

This must remain the primary meeting surface.

### 8.5 Existing report/session behavior

The current teacher page also includes:

- session end behavior
- session analytics collection
- session report modal/flow
- past sessions loading/report view

These should remain functionally intact.

---

## 9. Final product scope

## 9.1 In scope

- redesign of the teacher page shell
- new topbar
- new status strip
- reskin of meeting-stage framing
- reskin/restructure of live dashboard rail
- redesign of student cards
- redesign of action controls
- redesign of summary metrics and filter tabs
- polished empty/loading/hover/disabled states
- optional safe visual improvement to related modal/overlay surfaces

## 9.2 Out of scope

- replacing current teacher dashboard logic
- replacing `HMSMeeting`
- rewriting the join/readiness/session flow
- adding mute as a required new teacher action
- changing backend contracts
- altering report calculations
- broad app-wide design refactor outside this screen

---

## 10. HTML prototype interpretation requirements

The implementation agent must use the `.html` file correctly.

### 10.1 The HTML is a UI reference

Use it for:

- layout direction
- palette
- typography tone
- premium shell treatment
- header arrangement
- status strip structure
- sidebar card layout
- action icon treatment
- motion and depth language

### 10.2 The HTML is not a logic source

Do not import or recreate its:

- mock participants dataset
- mock risk calculations
- mock tile rotation behavior
- mock timer
- mock KPI logic
- placeholder actions
- fake mute behavior
- custom participant rendering logic that replaces the actual Chronos meeting

### 10.3 Specific product interpretation

- The prototype’s main stage is visual inspiration; `HMSMeeting` remains real.
- The prototype’s student list is visual inspiration; the current teacher-page data model remains real.
- The prototype’s controls are styling inspiration; the current event handlers remain real.
- Prototype controls or labels that do not exist in current ChronosBeta should not become requirements automatically.

---

## 11. Functional requirements

## 11.1 Teacher page architecture

The final page must still contain:

1. a live meeting area
2. a teacher monitoring/dashboard area
3. top-level teacher controls
4. access to the current report/session-end flow

The page may be visually restructured, but these functions must remain.

---

## 11.2 Meeting area requirement

The final design must preserve `HMSMeeting` as the live meeting component.

### Requirements

- keep the current `HMSMeeting` integration
- keep its leave/session behavior connected to the teacher page
- allow the meeting area to be visually reframed inside a more premium stage container
- do not replace it with the prototype’s custom tile logic

### Acceptance

The teacher must still be able to join and operate the live meeting through the existing ChronosBeta mechanism.

---

## 11.3 Topbar requirement

The final page must include a global topbar that visually consolidates the current teacher dashboard’s primary controls and session identity.

### Required contents

- Chronos identity area
- Teacher Dashboard title
- session ID
- teacher identifier or email
- websocket status badge
- class/exam control
- strict/normal tab control
- simulate classroom control
- check engagement (all) CTA

### Acceptance

All current top-level controls remain present and usable.

---

## 11.4 Connection status requirement

A persistent websocket status indicator must remain visible during the live session.

### Required states

At minimum:

- connected
- disconnected

Optional if safely implemented:

- reconnecting

### Acceptance

The indicator must still reflect the real `connected` state from the teacher websocket hook.

---

## 11.5 Session mode controls requirement

The following current controls must remain functionally intact:

- class/exam context mode
- strict/normal tab mode
- simulate classroom

### Existing behavior to preserve

- class/exam uses the current session context endpoint behavior
- strict mode uses the current session mode endpoint behavior
- simulate classroom uses the current simulator hook behavior

### Acceptance

The toggles may be visually redesigned but must preserve current semantics and event flow.

---

## 11.6 Class-wide verification requirement

The teacher must retain the ability to trigger a class-wide engagement/liveness check.

### Existing behavior to preserve

The current action is triggered through the existing liveness call using the session ID and no user target.

### Acceptance

The action remains one-click accessible and shows a loading/disabled state while active.

---

## 11.7 Status strip requirement

A compact session status strip must be present beneath or near the topbar.

### Recommended metrics

- session ID
- live time / timer if already supported
- present
- attentive
- review
- critical

### Data rule

These metrics must come from current teacher-page state or safe derivation from that state. No speculative backend work should be introduced just to fill decorative numbers.

### Acceptance

The strip improves scanability without introducing fake metrics.

---

## 11.8 Live dashboard rail requirement

The teacher’s monitoring list must remain available in a dedicated dashboard region.

### Required capabilities

- summary metrics
- flagged vs all filter
- list of students
- per-student action controls
- scrollable list
- empty state support

### Layout rule

The rail may be made visually premium and optionally collapsible, but it must remain stable and usable in the live session.

---

## 11.9 Summary metric requirement

The rail header should include quick summary cards.

### Required/allowed metrics

Good candidates using current data:

- flagged count
- identity issue count
- average engagement score

### Acceptance

Metrics shown in the summary area must be backed by existing teacher-page state.

---

## 11.10 Student filtering requirement

The teacher must retain the ability to switch between:

- flagged students
- all students

### Existing behavior to preserve

The current flagged-only behavior must remain available and should stay aligned with the current filtering logic.

### Acceptance

Filter switching must not change the underlying criteria used to determine which students are flagged.

---

## 11.11 Student sorting requirement

The student list must preserve current severity-based ordering.

### Existing logic to preserve

Current severity sorting in teacher page is:

- highest severity first
- current logic treats identity issues and multi-face as highest
- anti-cheat violations and high strike count as next
- low score as lower severity

### Acceptance

The visual redesign must not silently replace this with a different ranking model.

---

## 11.12 Student card content requirement

Each student card must show enough information for the teacher to understand:

- who the student is
- how engaged they are
- whether they are flagged
- why they are flagged
- which actions are available

### Required content

- student identifier
- score percentage
- primary status label
- timestamp/last update if currently available
- relevant signal pills
- action controls

### Optional but allowed

- avatar/initial badge
- more refined grouping
- better inline metadata hierarchy

---

## 11.13 Student state semantics requirement

The redesign must preserve the current teacher dashboard’s state semantics.

### Current important states

- attentive
- distracted
- away
- disengaged
- identity mismatch
- multi-face detected
- tab-switched
- liveness failure
- simulated student

### Acceptance

The visual semantics must reinforce these states without changing their logic.

---

## 11.14 Per-student actions requirement

The redesigned dashboard must preserve the following working actions:

### Required actions

- Nudge
- Engaged
- Message
- Ignore
- Remove
- Verify

### Requirements by action

#### Nudge

Must continue to use the existing nudge flow.

#### Engaged

Must continue to trigger the existing “mark engaged” behavior.

#### Message

Must continue to trigger the existing teacher-message behavior.

#### Ignore

Must preserve the current ignore semantics.

#### Remove

Must preserve the current remove semantics.

#### Verify

Must preserve the current per-student liveness/engagement verification behavior.

### Acceptance

All existing actions must remain available and functional after the redesign.

---

## 11.15 Mute requirement

Mute is **not a required feature** for this redesign.

### Reason

The prototype includes a mute icon, but the current ChronosBeta teacher dashboard does not treat mute as one of the established working teacher actions in the existing teacher-page implementation.

### Rule

Do not add mute as a requirement unless it is intentionally approved and implemented end-to-end.

---

## 11.16 Disabled-state requirement

The redesigned UI must preserve disabled behavior where appropriate, especially for simulated students and loading states.

### Existing behavior to preserve

Simulated students currently have restrictions on action usage.

### Acceptance

Disabled buttons must look deliberate and consistent, not broken.

---

## 11.17 Simulated classroom requirement

The redesign must preserve existing simulated classroom behavior.

### Existing behavior to preserve

- simulate classroom toggle controls whether simulated students stream metrics
- simulated students appear in the teacher roster
- simulated students are visually distinguishable
- simulated students do not behave exactly like real students in the action model

### Acceptance

The redesign must keep simulated students clearly labeled and safely handled.

---

## 11.18 Report-flow requirement

The redesign must not break:

- session ending
- report generation
- save report behavior
- past session access

### Scope note

These flows do not need a major redesign in this task unless needed for visual consistency, but they must continue to work.

---

## 12. Existing data and logic model to preserve

This section documents the current ChronosBeta behavior that the redesign must honor.

## 12.1 Teacher page data sources

The teacher dashboard currently depends on:

- session ID from page/search params
- teacher/user identity
- `useTeacherWebSocket(sessionId)` for live student state
- `useClassroomSimulator(sessionId, enabled)` for simulated learners
- local teacher-page UI state for filters and ignored/removed users
- current API helpers for teacher actions and liveness
- `HMSMeeting` for live room participation

---

## 12.2 Student object reality

The student list is derived from the teacher websocket state and may include fields such as:

- `userId`
- `score`
- `timestamp`
- `strikes`
- `disengaged`
- `identityStatus`
- `identityMismatchCount`
- `antiCheatViolations`
- `lastViolationType`
- `multiFaceDetected`
- `livenessFailed`
- `isSimulated`

The redesign should work with this existing shape rather than inventing a new canonical participant model.

---

## 12.3 Current flagged logic

The current teacher page treats a student as flagged if they are not ignored and any of the following apply:

- strikes >= 3
- disengaged is true
- identity mismatch count threshold reached
- tab-switch anti-cheat violation exists
- multiple faces detected
- liveness failed

This logic must be preserved unless explicitly changed in code by product decision.

---

## 12.4 Current severity sorting logic

The current teacher page sorts students using severity tiers roughly like this:

- highest: identity issues or multi-face
- next: anti-cheat/tab violation or major strike condition
- next: low score
- lowest: otherwise

This ordering must remain.

---

## 12.5 Current status label logic

The current teacher page uses labels such as:

- Identity Mismatch
- Disengaged
- Attentive
- Distracted
- Away

The redesign may re-style these labels but should preserve their meaning.

---

## 13. Action wiring requirements

This section defines what the redesign must preserve.

## 13.1 Nudge

### Current behavior

Uses the existing nudge pathway.

### Product requirement

The redesigned Nudge action must still trigger the same live nudge behavior.

### UI flexibility

May appear as:

- icon button
- compact text+icon button
- hover-revealed action
  as long as discoverability remains good.

---

## 13.2 Engaged

### Current behavior

Marks a student as engaged using the existing teacher action flow.

### Product requirement

The redesigned Engaged action must preserve this event flow and resulting state update behavior.

---

## 13.3 Message

### Current behavior

Uses teacher action messaging.

### Product requirement

The redesigned Message action must preserve the same behavior.

### Allowed UX improvement

The redesign may replace a crude prompt with a small inline or modal input only if:

- the same action payload is sent,
- no new backend behavior is required,
- the implementation risk remains low.

---

## 13.4 Ignore

### Current behavior

Moves a student out of the flagged view using current ignore semantics.

### Product requirement

The redesign must preserve that same local teacher workflow.

---

## 13.5 Remove

### Current behavior

Removes the student locally from the roster view and sends the current remove teacher action.

### Product requirement

The redesign must preserve this exact functional effect.

### Optional UX improvement

A confirmation step may be added if done safely, but it is not required.

---

## 13.6 Verify

### Current behavior

Triggers liveness/engagement verification for one student.

### Product requirement

The redesign must preserve that per-student verification behavior.

---

## 14. UX requirements

The final UX must satisfy the following.

## 14.1 Scannability

The teacher must be able to detect:

- class health
- flagged count
- the highest-priority students
- available next actions
  in a few seconds.

## 14.2 Minimal cognitive friction

The teacher should not need to hunt for controls that already exist today.

## 14.3 Action clarity

Actions must be visually grouped and consistently placed across student cards.

## 14.4 Premium feel

The interface should feel materially more polished than the current version.

## 14.5 Stability

The redesign should feel stable during live updates. Motion and layout shifts should not cause visual chaos.

---

## 15. Technical implementation constraints

## 15.1 Preserve current stack fit

The redesign should fit the existing React/Tailwind-based frontend rather than importing a disconnected styling architecture.

## 15.2 Do not port prototype JS

The HTML prototype’s JS is reference material only and should not be transplanted into the app.

## 15.3 Keep code changes targeted

Prefer targeted refactors in the teacher dashboard surface over broad architectural rewrites.

## 15.4 Keep API contracts unchanged

No backend contract changes should be required for the redesign.

## 15.5 No lifecycle rewrite

Do not combine this UI redesign with auth/readiness/join/lifecycle work.

---

## 16. Acceptance criteria

The redesign is successful only if all of the following are true.

### 16.1 Functional acceptance

- teacher dashboard still loads correctly
- `HMSMeeting` still works
- websocket student updates still populate the dashboard
- flagged-only and all-students filters still work
- Nudge still works
- Engaged still works
- Message still works
- Ignore still works
- Remove still works
- Verify still works
- class/exam toggle still works
- strict/normal tab toggle still works
- simulate classroom toggle still works
- check engagement (all) still works
- report/session-end flow still works

### 16.2 UX acceptance

- topbar looks materially upgraded
- stage and rail feel cohesive
- student cards are cleaner and easier to scan
- summary metrics are clearer
- action row is more elegant
- dashboard feels premium and intentional

### 16.3 Safety acceptance

- no new backend dependencies were introduced
- no important current actions were removed
- no current teacher logic was silently changed
- no prototype-only fake logic replaced real code
- no unrelated routes/pages were rewritten as part of this task

---

## 17. Explicit implementation boundaries for the agent

The agent implementing this work must follow these instructions:

1. Use the `.html` file as a visual and interaction reference only.
2. Treat the ChronosBeta codebase as the functional source of truth.
3. Do not rewrite the teacher dashboard logic.
4. Do not replace `HMSMeeting`.
5. Do not introduce mute as a required feature.
6. Do not invent new data requirements just to match the prototype exactly.
7. Adapt the prototype to ChronosBeta; do not force ChronosBeta to mimic the prototype’s fake internals.
8. Preserve all existing teacher actions and their behavior.
9. Keep the redesign scoped to the teacher dashboard surface and closely related UI elements only.
10. Favor implementation safety over speculative completeness.

---

## 18. Final product definition

The final product is:

> A visually premium, prototype-aligned ChronosBeta Teacher Dashboard that preserves the existing real teacher workflow, real meeting integration, real student monitoring logic, and real teacher actions while substantially upgrading the surface design, hierarchy, and usability.
