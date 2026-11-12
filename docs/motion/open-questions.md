# Open questions / manual checks

1. **Live shells are dev-only for production measurement.** `/teacher?preview=live` and `/student?preview=live` use `import.meta.env.DEV`; production Lighthouse cannot reach them without a functionality change. Baseline uses dev-server Playwright/CDP traces. Manual check: run a real class with the backend token endpoint and inspect the live motion on a real session.
2. **Camera pages are heavy before motion.** `/readiness`, `/teacher` desk and `/student` join load MediaPipe/face-api models (8.5 MiB, ~42 s TTI). Mobile Lighthouse is skipped for these; desktop baseline is recorded. Manual check: a low-power Android phone with a real camera.
3. **Report close animation.** Native `<dialog>` closes instantly; an exit animation would delay focus return. Keep entrance-only unless a safe close is proven. Revisit only if the report feels abrupt in the pilot critique.
4. **iOS Safari.** `@starting-style` and `dialog::backdrop` animation support varies; the implementation will use plain CSS animations with visible defaults and verify in Safari/WebKit if available. Manual check: iOS Safari.
5. **Real video tiles.** Local screenshots show the designed video error state; peer tiles and 100ms controls were not visually verified. Manual check with two accounts and a live token endpoint.
6. **Error boundary.** The fallback is not reachable without a render crash; it is reviewed in code, not captured. If a safe dev-only crash trigger exists, capture it; otherwise leave as a manual check.
7. **Reduced-motion charts.** Recharts animation is disabled under reduced motion; verify every chart's final state is identical.
8. **Homepage adoption.** The homepage plan's tokens are implemented app-first. A later homepage pass can import the same `motion.css` tokens; no homepage changes now.
9. **Slow 4G.** At 400 KB/s + 200 ms latency, `/signin` reached DOMContentLoaded in 25.4 s with no motion errors; the existing 3 MB bundle dominates. Motion adds ~2 KB. Manual check: real 4G/low-end phone.
10. **WebGL off.** Verified `/signin` and `/records` load with no motion errors and 0 overflow under `--disable-webgl`; the camera stack may still log its own WebGL messages. Motion does not use WebGL.
11. **Keyboard.** Sign-in tab order is visible and untrapped (brand → email → password → eye → sign in → create account); the existing tests cover the working pages.

## Merge follow-ups (integration/redesign-dev)

Dev's newer product work was merged under the redesign surface. These are the places where the two designs do not yet agree; none blocks a build or a test.

1. **Past-session list: `/records` wins.** Dev's `Past Sessions` modal in the teacher desk was dropped because `/records` already lists, opens, and exports saved records. Dev's `fetchSessionReport` path is kept: `/records` now offers an **Evidence report** action that opens the server-built report (overview, coverage, review prioritisation, identity/presence, browser focus, assessment, context/action ledger, participant dossier) inside the record shell. Choice: one list, two report views.
2. **Report is two data shapes in one shell.** `SessionReport` renders the saved analytics record (`sessionData`, the end-of-class save/export flow) or the server evidence report (`sessionId`/`report`). Both keep the cream record header, footer, and print path; the evidence sections reuse `rec-*` classes.
3. **Engagement band is vision-based now.** Dev's tracker no longer scores engagement in the browser (backend invariant), so the student rail's band is `attentive` when a face is present and `nodata` otherwise. The `distracted` / `away` copy stays for when a server-side band arrives. `onVisionStatusChange` still fires every frame; `onStateChange` is the new rail signal.
4. **Legacy teacher signals restored.** `use-teacher-websocket` again handles `multi_face_detected` and `auto_disengaged`; the dev backend no longer emits them, but the e2e roster depends on them and older trackers still can.
5. **Case triage rail is visually dev's.** `CaseTriageRail` keeps its dark Tailwind styling inside the cream rail. It is fully wired (cases, batch actions, tabs); restyling it is a follow-up.
6. **Teacher cards kept but unused.** `DashboardTopbar`, `StudentCard`, `SummaryCards` stay for dev's vitest coverage; the redesigned teacher page uses `RoomBar` / `StatusStrip` / `StudentRow`. Their `td-*` stylesheets (`teacher-dashboard.css`, `dashboard-shared.css`) were removed with the redesign, so they render unstyled if reused.
7. **`getStatusKey` / `getPriority` dropped.** Dev's helpers existed only for `StudentCard`; the redesigned rail uses `kindFor(label, riskFlag)` plus the `caseState`/`warningStreak`-aware `statusLabel`/`isFlagged`/`severityScore`.
8. **Camera card in the student rail.** Dev's tracker markup (dark card, Tailwind chips) is used as-is inside the cream rail. It is the one intentionally dark surface in the room.
9. **Unused dependencies removed.** The merge kept dev's dependency set; `@100mslive/roomkit-react`, `@mediapipe/camera_utils`, `@mediapipe/face_mesh`, `@tensorflow/tfjs*`, `@zegocloud/zego-uikit-prebuilt`, and `face-api.js` had no imports left on either side.
10. **Vitest scope.** `vitest.config.js` now includes only `src/**/*.{test,spec}.{js,jsx}` so Playwright specs in `e2e/` are not collected by Vitest.
