# Deviations from the static design

None yet. The motion pass is intended to be progressive enhancement only: no layout, content, copy, route, flow, data, auth, permission or API change.

If a motion effect needs a structural tweak, record it here with the file, the before/after, the reason, and the approval/evidence. The final resting states must still match the approved static design.

Known non-deviations:
- Wrapping rail rows in presence components keeps the same `<li>` semantics and the same resting layout.
- The header/room-bar hairline draw uses a pseudo-element; no DOM or layout change.
- The loading rule is a pseudo-element under the existing loading text.
- The report's chart animation is a Recharts prop change; the final chart is identical.
