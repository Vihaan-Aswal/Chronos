# Deviations from the static design

## D-M-DEV1 - Nudge toast height
- **File:** `src/styles/room.css` (`NudgeNotification` portal).
- **Before:** the portal carries `className="app room-nudge"`; `.app { min-height: 100vh }` made the toast a 900px-tall fixed box, so its top sat at -24px and the intended bottom note was not visible as designed.
- **After:** `.app.room-nudge { min-height: 0 }` restores the intended content-height toast at `bottom: 24px`.
- **Reason:** the motion pass makes the private nudge a key student moment; the existing toast cannot be seen as designed. This is a minimal bug fix, not a layout/copy change. Resting screenshot changes only the toast position to the intended bottom note.
- **Evidence:** before/after computed rect and `student-nudge` frame sequence.

If a motion effect needs a structural tweak, record it here with the file, the before/after, the reason, and the approval/evidence. The final resting states must still match the approved static design.

Known non-deviations:
- The rail rows keep the same `<li>` semantics; the entrance is CSS-only, no wrapper.
- The header/room-bar hairline draw uses a pseudo-element; no DOM or layout change.
- The loading rule is a pseudo-element under the existing loading text.
- The report's chart animation is a Recharts prop change; the final chart is identical.

