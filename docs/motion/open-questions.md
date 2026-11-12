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
