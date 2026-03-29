/**
 * ChooseRolePage.jsx  —  Phase 6
 *
 * Faithful JSX translation of UI_plan/chronos_choose_role/code.html.
 * Parchment (light) theme — no dark class on root.
 *
 * Role selection (per plan §4.2):
 *   - NEVER writes to the backend — purely a frontend routing decision.
 *   - Stores chosen role in sessionStorage['chronos_role'].
 *   - Navigates to /readiness with replace:true (clean back-button chain).
 *   - If role is selected by clicking anywhere on the card or its button.
 */

import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase-client";
import { motion } from "motion/react";
import ChronosMark from "../components/chronos-mark.jsx";

export default function ChooseRolePage() {
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    sessionStorage.removeItem("chronos_user");
    sessionStorage.removeItem("chronos_role");
    navigate("/", { replace: true });
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
  };

  function selectRole(role) {
    // role is "teacher" or "student" — lowercase, matches /teacher and /student routes
    sessionStorage.setItem("chronos_role", role);
    navigate("/readiness", { replace: true });
  }

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col">

      {/* ── TopAppBar — dark Midnight bar matching Stitch screen ──────────── */}
      <header
        className="flex justify-between items-center w-full px-6 py-4 fixed top-0 z-50"
        style={{ backgroundColor: "#041523" }}
      >
        <Link
          to="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ChronosMark size={24} variant="gold" />
          <span className="font-headline tracking-tighter text-2xl font-bold" style={{ color: "#DCC492" }}>
            Chronos
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex gap-8 items-center">
          <span
            className="font-label uppercase tracking-[0.1em] text-[10px] transition-colors duration-300 cursor-default"
            style={{ color: "#48626E" }}
          >
            Support
          </span>
          <span
            className="font-label uppercase tracking-[0.1em] text-[10px] transition-colors duration-300 cursor-default"
            style={{ color: "#48626E" }}
          >
            Archive
          </span>
          <button
            onClick={handleSignOut}
            className="font-label uppercase tracking-[0.1em] text-[10px] transition-colors duration-300 hover:text-white"
            style={{ color: "#48626E" }}
            title="Sign Out"
          >
            Sign Out
          </button>
        </nav>

        {/* Mobile hamburger icon */}
        <div className="md:hidden">
          <span className="material-symbols-outlined" style={{ color: "#DCC492" }}>
            menu
          </span>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-grow flex items-center justify-center pt-24 pb-12 px-6">
        <div className="max-w-5xl w-full">

          {/* Editorial asymmetric header */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16 items-end">
            <div className="md:col-span-7">
              <h1 className="font-headline text-5xl md:text-6xl text-on-surface tracking-tight leading-tight">
                Choose how you want to continue
              </h1>
            </div>
            <div className="md:col-span-5 md:pl-8">
              <p className="font-body text-lg text-secondary leading-relaxed border-l border-outline-variant/30 pl-6">
                Teachers host and review sessions. Students join and participate
                in sessions.
              </p>
            </div>
          </div>

          {/* ── Role Cards (Bento Style) ──────────────────────────────────── */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >

            {/* Teacher Card */}
            <motion.div
              variants={itemVariants}
              className="group relative bg-surface-container-lowest p-10 rounded-xl transition-all duration-500 hover:bg-surface-container-high cursor-pointer flex flex-col justify-between min-h-[400px]"
              onClick={() => selectRole("teacher")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && selectRole("teacher")}
              aria-label="Continue as Teacher"
            >
              {/* Watermark icon */}
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                <span
                  className="material-symbols-outlined text-8xl"
                  style={{ fontVariationSettings: "'wght' 100" }}
                >
                  history_edu
                </span>
              </div>

              <div>
                <div className="mb-8">
                  <span className="font-label uppercase tracking-[0.2em] text-[10px] bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full">
                    Educator Access
                  </span>
                </div>
                <h2
                  className="font-headline text-4xl mb-4"
                  style={{ color: "#041523" }}
                >
                  Continue as Teacher
                </h2>
                <p className="text-secondary max-w-xs leading-relaxed">
                  Host sessions, monitor classroom signals, and review
                  comprehensive analytical reports.
                </p>
              </div>

              <div className="mt-12">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-sm font-label uppercase tracking-widest text-xs font-bold transition-all"
                  style={{ backgroundColor: "#041523", color: "#DCC492" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectRole("teacher");
                  }}
                >
                  Initialize Portal
                  <span className="material-symbols-outlined text-sm">
                    arrow_forward
                  </span>
                </motion.button>
              </div>
            </motion.div>

            {/* Student Card */}
            <motion.div
              variants={itemVariants}
              className="group relative bg-surface-container-lowest p-10 rounded-xl transition-all duration-500 hover:bg-surface-container-high cursor-pointer flex flex-col justify-between min-h-[400px]"
              onClick={() => selectRole("student")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && selectRole("student")}
              aria-label="Continue as Student"
            >
              {/* Watermark icon */}
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                <span
                  className="material-symbols-outlined text-8xl"
                  style={{ fontVariationSettings: "'wght' 100" }}
                >
                  school
                </span>
              </div>

              <div>
                <div className="mb-8">
                  <span className="font-label uppercase tracking-[0.2em] text-[10px] bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full">
                    Learner Access
                  </span>
                </div>
                <h2
                  className="font-headline text-4xl mb-4"
                  style={{ color: "#041523" }}
                >
                  Continue as Student
                </h2>
                <p className="text-secondary max-w-xs leading-relaxed">
                  Join active sessions, complete real-time checks, and
                  participate in modern classroom synthesis.
                </p>
              </div>

              <div className="mt-12">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-sm font-label uppercase tracking-widest text-xs font-bold transition-all"
                  style={{ backgroundColor: "#041523", color: "#DCC492" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectRole("student");
                  }}
                >
                  Enter Session
                  <span className="material-symbols-outlined text-sm">
                    login
                  </span>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>

          {/* Decorative vertical line */}
          <div className="mt-20 flex justify-center">
            <div className="w-px h-24 bg-gradient-to-b from-outline-variant/50 to-transparent" />
          </div>
        </div>
      </main>

      {/* ── Footer — dark Midnight bar matching Stitch screen ─────────────── */}
      <footer
        className="flex flex-col md:flex-row justify-between items-center w-full px-8 py-12 gap-4 mt-auto"
        style={{ backgroundColor: "#041523" }}
      >
        <div
          className="font-label uppercase tracking-[0.1em] text-[10px]"
          style={{ color: "#48626E" }}
        >
          © 2026 Chronos Archival Systems
        </div>
        <div className="flex gap-8">
          <a
            href="#"
            className="font-label uppercase tracking-[0.1em] text-[10px] transition-colors"
            style={{ color: "#48626E" }}
          >
            Privacy Policy
          </a>
          <a
            href="#"
            className="font-label uppercase tracking-[0.1em] text-[10px] transition-colors"
            style={{ color: "#48626E" }}
          >
            Terms of Service
          </a>
          <a
            href="#"
            className="font-label uppercase tracking-[0.1em] text-[10px] transition-colors"
            style={{ color: "#48626E" }}
          >
            Cookie Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
