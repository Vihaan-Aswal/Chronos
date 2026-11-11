# Placeholders

No invented copy, stats, testimonials, pricing, certifications, or legal text is used.
Every line on the redesigned pages comes from `PRODUCT.md`, the homepage, the existing UI,
or is computed from real session data.

## Intentional placeholders / fixtures

1. **Dev-only live preview fixture** — `?preview=live` on `/teacher` and `/student`
   (gated by `import.meta.env.DEV`). Used to review the live shells without a camera.
   Not reachable in a production build. Owner: design/dev.
2. **Simulated learners** — the existing classroom simulator labels rows "Simulated (demo)".
   Kept and made explicit. Owner: product.
3. **Illustrative sample data on the homepage** — unchanged, already labelled.

## Content the product needs but does not have (not invented)

- Legal pages (Privacy / Terms / Cookie) — no copy exists in the repo.
- Support / help content — none exists.
- Password reset copy and flow — none exists.
- Organisation / institution name on records — no such field exists; records show the
  session id and the signed-in email only.

These are logged in `04-open-questions.md` rather than filled with placeholder prose.
