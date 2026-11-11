# Deviations from the repo's official docs

- **`UI_plan/chronos_*` Stitch screens are replaced.** The old pages were described as
  faithful translations of those screens (midnight/parchment themes). The redesign replaces
  that visual world with the homepage's cream/forest system. Reason: the homepage is the
  stated design source of truth and the brief calls for a full redesign.
- **README "Copy Link" / invite-link control does not exist in the code.** The testing
  guide refers to a "Meeting ID / Copy Link" control in the teacher dashboard; there is no
  such control. Not added (would be new functionality). Logged in `04-open-questions.md`.
- **README sign-up flow says "choose a role, complete readiness".** Unchanged; the screens
  are redesigned, the flow order is the same.
- **PRODUCT.md "The home page works signed out"** unchanged. No auth logic was added to `/`.
- **`join-screen.jsx` header comment says the readiness page wraps JoinScreen as-is.**
  The wrapper still renders the same component and props; JoinScreen's presentation is
  redesigned and its native dialogs are replaced with in-page results (same decisions,
  same API calls).
- **`teacher-page.jsx` comment "The previous td-disconnect-banner has been replaced…"**
  The disconnect notice is now a ruled banner inside the new room bar; same trigger.
- **Motion:** the legacy pages imported `motion/react` for entrance animations. This pass
  removes decorative entrance motion (brief defers motion work). Functional loops in the
  tracker are untouched.
- **New route `/records`.** Additive; no existing route changed. Documented in
  `decisions.md` D1.
