/**
 * ReadinessPage.jsx  —  Phase 7
 *
 * Wraps the existing JoinScreen component inside the new visual chrome
 * from UI_plan/chronos_readiness_check/code.html.
 *
 * Per plan §5 (confirmed decisions):
 *   "ReadinessPage.jsx imports JoinScreen and renders it inside a new layout
 *    shell matching chronos_readiness_check. Do NOT refactor or extract its
 *    internals into a hook. The component is wrapped as-is."
 *
 * What comes from the Stitch HTML (kept):
 *   - Sticky parchment header with Chronos wordmark + nav
 *   - Page title: "Complete a quick readiness check"
 *   - Privacy-aware footer note
 *   - Page footer
 *
 * What is REPLACED (not ported from HTML):
 *   - The static <img> camera placeholder → JoinScreen provides a live <video>
 *   - The face-guide overlay → JoinScreen handles this internally
 *   - The "Connected / Face Detected / Optimal Lighting" pills → JoinScreen's
 *     StatusRow components provide equivalent real-time status indicators
 *   - The "Readiness Checklist" card with hardcoded "Ready" states → JoinScreen
 *     shows live state (face detected, centered, lighting)
 *   - The "Enter Session" / "Retry Check" buttons → JoinScreen's own button
 *     (disabled until face is ready, calls handleJoin which fires onJoin)
 *
 * Auth/state flow (per plan §4.3 & §4.4):
 *   1. Read user from sessionStorage['chronos_user'] (primary).
 *   2. Read role from sessionStorage['chronos_role'].
 *   3. If role missing → redirect to /choose-role.
 *   4. Pass user to <JoinScreen user={user} onJoin={handleJoin} />.
 *   5. handleJoin: navigate to /${role} with { state: { user, role, readinessCompleted: true } }
 *      for backward compatibility with StudentPage / TeacherPage.
 */

import { useNavigate, Link } from "react-router-dom";
import JoinScreen from "../components/join-screen.jsx";
import { motion } from "motion/react";
import ChronosMark from "../components/chronos-mark.jsx";

const MotionDiv = motion.div;

export default function ReadinessPage() {
  const navigate = useNavigate();

  // ── Read user from sessionStorage ─────────────────────────────────────────
  let user = null;
  try {
    const raw = sessionStorage.getItem("chronos_user");
    if (raw) user = JSON.parse(raw);
  } catch {
    // malformed JSON — user stays null; AuthGuard should have caught this
  }

  // ── Read role from sessionStorage ─────────────────────────────────────────
  const role = sessionStorage.getItem("chronos_role"); // "teacher" | "student"

  // If role is somehow missing, send back to choose-role
  if (!role) {
    navigate("/choose-role", { replace: true });
    return null;
  }

  // ── onJoin callback — fired by JoinScreen after successful identity check ─
  function handleJoin() {
    // Navigate to the role-appropriate page.
    // We pass location.state for backward compatibility with StudentPage /
    // TeacherPage which still read location.state?.user as their primary source.
    navigate(`/${role}`, {
      replace: true,
      state: { user, role, readinessCompleted: true },
    });
  }

  return (
    <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
      {/* ── Sticky dark header ──────────────────────────────────────── */}
      <header
        className="w-full top-0 sticky z-50 shadow-md"
        style={{ backgroundColor: "#041523" }}
      >
        <div className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          >
            <ChronosMark size={24} variant="gold" />
            <span
              className="font-headline text-2xl font-bold tracking-tighter"
              style={{ color: "#DCC492" }}
            >
              Chronos
            </span>
          </Link>

          <nav
            className="hidden md:flex items-center gap-8 font-label text-[0.75rem] uppercase tracking-widest font-bold"
            style={{ color: "#48626E" }}
          >
            <a
              href="#"
              className="transition-colors duration-300 hover:text-[#DCC492]"
            >
              Support
            </a>
            <a
              href="#"
              className="transition-colors duration-300 hover:text-[#DCC492]"
            >
              Archive
            </a>
            <button
              onClick={() => {
                sessionStorage.clear();
                navigate("/");
              }}
              className="transition-colors duration-300 hover:text-[#DCC492] uppercase"
            >
              Sign Out
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-8 py-6 md:py-8 lg:flex lg:flex-col lg:justify-center">
        {/* Page title */}
        <div className="mb-8 text-center max-w-4xl mx-auto">
          <h1 className="font-headline text-on-surface tracking-tight text-4xl md:text-5xl">
            Complete a quick readiness check
          </h1>
          {role && (
            <p className="mt-4 font-body text-secondary text-lg font-light">
              You are joining as a{" "}
              <span className="font-semibold text-on-surface capitalize">
                {role}
              </span>
              .
            </p>
          )}
        </div>

        {/* ── JoinScreen — the camera, detection, and verify button ───────
             This component renders its own full UI (video feed, status rows,
             hidden canvases, verify button). It replaces the static placeholder
             and hardcoded checklist from the Stitch HTML.

             The user prop provides user.id / user.user_id for identity API.
             The onJoin prop is called after successful face verification.
        ────────────────────────────────────────────────────────────────── */}
        <MotionDiv
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <JoinScreen user={user} onJoin={handleJoin} />
        </MotionDiv>
      </main>

      {/* ── Dark Footer ─────────────────────────────────────────────────── */}
      <footer
        className="w-full mt-20"
        style={{
          backgroundColor: "#041523",
          borderTop: "1px solid rgba(72,98,110,0.2)",
        }}
      >
        <div className="flex flex-col md:flex-row justify-between items-center px-12 py-10 w-full max-w-7xl mx-auto">
          <div
            className="font-headline font-bold text-xl mb-4 md:mb-0"
            style={{ color: "#DCC492" }}
          >
            Chronos
          </div>
          <div className="flex gap-8 mb-6 md:mb-0">
            {["Support", "Archive", "Privacy", "Terms"].map((label) => (
              <a
                key={label}
                href="#"
                className="font-body text-[0.75rem] uppercase tracking-widest transition-all hover:text-[#DCC492]"
                style={{ color: "#48626E" }}
              >
                {label}
              </a>
            ))}
          </div>
          <p
            className="font-body text-[0.7rem] uppercase tracking-widest text-center md:text-right"
            style={{ color: "rgba(72,98,110,0.6)" }}
          >
            © 2026 Chronos Intelligence. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
