# Credits and external material

## Libraries already in the project

| Library | Version | License | Use |
|---|---|---|---|
| `motion` | 12.38.0 | MIT | Existing animation runtime; used for presence/row sequences and the report orchestration. Already installed and already in the main bundle through `main.jsx`. No new runtime dependency. |
| `react` / `react-dom` | 18.3.1 | MIT | Existing UI runtime. |
| `recharts` | 3.5.1 | MIT | Existing charts; animation props only. |
| `@playwright/test` | 1.65.0 (dev) | Apache-2.0 | Existing e2e/capture tooling. No runtime bundle impact. |
| Lighthouse | 12.8.2 (npx, not a dependency) | Apache-2.0 | Baseline measurement only. |

## Assets

- No new images, fonts, video, audio, canvas, WebGL, 3D models or third-party embeds.
- The motion system is CSS and SVG/code-drawn in place.
- Existing fonts (Newsreader, Manrope) remain loaded by the existing `index.html`; no new font request.

## Snippets

- No external code snippets copied.
- If a snippet is introduced, add its source URL, author, license and exact use here before shipping.

## References consulted (no code copied)

- Impeccable `reference/animate.md`, `reference/craft-floor.md`, `docs/homepage-motion-plan.md`.
- MDN CSS transitions/animations, `prefers-reduced-motion`, `@starting-style`, `dialog` — platform documentation; no code copied.

Last updated: phase 1.
