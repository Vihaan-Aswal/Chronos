# Open questions / manual checks

1. **Live shells are dev-only for production measurement.** `/teacher?preview=live` and `/student?preview=live` use `import.meta.env.DEV`; production Lighthouse cannot reach them without a functionality change. Baseline uses dev-server Playwright/CDP traces. Manual check: run a real class with the backend token endpoint and inspect the live motion on a real session.
2. **Camera pages are heavy before motion.** `/readiness`, `/teacher` desk and `/student` join load MediaPipe/face-api models (8.5 MiB, ~42 s TTI). Mobile Lighthouse is skipped for these; desktop baseline is recorded. Manual check: a low-power Android phone with a real camera.
3. **Report close animation.** Native `<dialog>` closes instantly; an exit animation would delay focus return. Keep entrance-only unless a safe close is proven. Revisit only if the report feels abrupt in the pilot critique.
4. **iOS Safari.** `@starting-style` and `dialog::backdrop` animation support varies; the implementation will use plain CSS animations with visible defaults and verify in Safari/WebKit if available. Manual check: iOS Safari.
5. **Real video tiles.** Local screenshots show the designed video error state; peer tiles and 100ms controls were not visually verified. Manual check with two accounts and a live token endpoint.
6. **Error boundary.** The fallback is not reachable without a render crash; it is reviewed in code, not captured. If a safe dev-only crash trigger exists, capture it; otherwise leave as a manual check.
7. **Reduced-motion charts.** Recharts animation is disabled under reduced motion; verify every chart's final state is identical.
8. **Homepage adoption.** The homepage plan's tokens are implemented app-first. A later homepage pass can import the same `motion.css` tokens; no homepage changes now.
