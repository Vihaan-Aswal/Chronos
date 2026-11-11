# Open questions and proposals (not implemented)

These would need product, backend, data-model, or legal decisions. The shipped design
works within current functionality.

1. **Password reset.** The old sign-in page had a dead "Forgot password?" link. It was
   removed. Proposal: add Supabase `resetPasswordForEmail` + a reset screen. Needs auth
   configuration and email templates.
2. **Support / Archive / Privacy / Terms pages.** The old headers linked to `#`. Removed.
   Proposal: publish real legal and help content, then add a footer row.
3. **Invite link.** README describes a "Meeting ID / Copy Link" control; the code has none
   (the 100ms room comes from backend env). Proposal: add a copy-link control once the
   room-per-session model exists.
4. **Role persistence.** The role is a sessionStorage routing decision, so users choose it
   on every visit. Proposal: store the default role in Supabase user metadata and pre-select
   it on `/choose-role` (data change).
5. **Records for students.** Students cannot see their own history. Proposal: a student
   record using existing analytics, once privacy review approves it.
6. **Session naming.** Sessions are identified by `default-session` or a query param.
   Proposal: a teacher-entered class name at start; needs a data field.
7. **Camera-less participation.** Readiness and identity require a camera; there is no
   fallback path. Proposal: a teacher-approved "camera unavailable" state. Product and
   privacy decision.
8. **Report persistence feedback.** Save now shows an inline "Record saved." instead of an
   alert + reload. Proposal: confirm the backend idempotency for repeated saves.
9. **Local video.** No 100ms token endpoint runs locally, so the stage shows its real
   "Connection failed" state in screenshots. Proposal: a local token stub for design QA.
10. **Analytics consent.** The product stores embeddings and analytics; no consent copy
    exists in the app. Proposal: legal review and a consent line at readiness.
