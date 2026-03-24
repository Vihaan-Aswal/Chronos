/**
 * SignInPage.jsx  —  Phase 4
 *
 * Faithful JSX translation of UI_plan/chronos_sign_in/code.html.
 * The root div carries className="dark" which activates the Midnight
 * colour palette via Tailwind's darkMode:"class" strategy.
 *
 * Auth flow (per plan §4.1):
 *   - Calls supabase.auth.signInWithPassword
 *   - On success → stores user in sessionStorage → navigate to /choose-role
 *   - On failure → shows inline error message
 *   - If a Supabase session already exists on mount → skip sign-in, go to /choose-role
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { motion } from "motion/react";
import ChronosMark from "../components/ChronosMark.jsx";

export default function SignInPage() {
  const navigate = useNavigate();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");


  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Persist user — primary source of truth for AuthGuard & downstream pages
    sessionStorage.setItem("chronos_user", JSON.stringify(data.user));

    // Navigate with replace so Back from /choose-role goes to /, not here
    navigate("/choose-role", { replace: true });
  }

  return (
    /* ── root: dark mode activated ─────────────────────────────────────── */
    <div
      className="dark font-body min-h-screen overflow-x-hidden"
      style={{ backgroundColor: "#041523", color: "#d3e4f8" }}
    >
      {/* ── Fixed background layers ──────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Dot-grid overlay */}
        <div className="absolute inset-0 network-grid" />
        {/* Directional scrim */}
        <div className="absolute inset-0 hero-gradient" />
        {/* Soft radial glow blobs */}
        <div className="absolute top-[20%] left-[10%] w-[600px] h-[600px] bg-midnight-primary/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] bg-midnight-secondary-container/10 rounded-full blur-[120px]" />
        {/* Decorative SVG wave */}
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <svg
            fill="none"
            height="100%"
            viewBox="0 0 800 600"
            width="100%"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 300C150 250 250 250 300 300S450 350 500 300S650 250 700 300"
              stroke="#DCC492"
              strokeWidth="0.5"
            />
            <circle cx="100" cy="300" fill="#DCC492" r="2" />
            <circle cx="300" cy="300" fill="#DCC492" r="2" />
            <circle cx="500" cy="300" fill="#DCC492" r="2" />
            <circle cx="700" cy="300" fill="#DCC492" r="2" />
            <path
              d="M200 100L300 300L400 500"
              stroke="#DCC492"
              strokeDasharray="4 4"
              strokeWidth="0.5"
            />
          </svg>
        </div>
      </div>

      {/* ── Main split layout ─────────────────────────────────────────────── */}
      <main className="relative z-10 min-h-screen flex flex-col md:grid md:grid-cols-12">

        {/* Chronos wordmark — top-left */}
        <header className="absolute top-0 left-0 p-8 md:p-12 w-full">
          <Link
            to="/"
            className="flex items-center gap-2"
          >
            <ChronosMark size={26} variant="gold" />
            <span className="font-headline italic text-2xl tracking-tight" style={{ color: "#DCC492" }}>
              Chronos
            </span>
          </Link>
        </header>

        {/* ── Left column: hero text (7/12) ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="col-span-12 md:col-span-7 flex flex-col justify-center px-8 md:pl-24 md:pr-12 pt-32 md:pt-0"
        >
          <div className="max-w-3xl space-y-8">
            <h1 className="text-5xl md:text-8xl font-headline italic text-midnight-on-surface leading-[1.1] tracking-tight">
              Fair signals,
              <br />
              <span className="text-midnight-primary/80">not surveillance.</span>
            </h1>
            <p className="text-xl md:text-2xl text-midnight-on-surface-variant font-body font-light leading-relaxed max-w-2xl">
              Elevating the academic journey through transparent, explainable
              intelligence. We believe in trust-based insights that empower
              educators and students alike.
            </p>
            <div className="flex items-center gap-6 pt-4">
              <div className="h-[1px] w-12 bg-midnight-outline-variant/50" />
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-midnight-on-surface-variant">
                Defining Classroom Clarity
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── Right column: glassmorphic form card (5/12) ───────────────── */}
        <div className="col-span-12 md:col-span-5 flex flex-col justify-center p-8 md:p-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="bg-midnight-surface-container-low/40 backdrop-blur-xl border border-midnight-outline-variant/20 p-10 md:p-14 rounded-xl space-y-8 shadow-2xl"
          >

            <div className="space-y-1">
              <h2 className="text-lg font-headline italic text-midnight-on-surface mb-4">
                Sign in to continue
              </h2>
            </div>

            {/* ── Error message ─────────────────────────────────────────── */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] font-label py-2 px-3 rounded-sm"
                style={{ color: "#ba1a1a", backgroundColor: "rgba(255,218,214,0.12)" }}
              >
                {error}
              </motion.p>
            )}

            {/* ── Form ──────────────────────────────────────────────────── */}
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="relative">
                  <label
                    className="block text-[9px] font-bold tracking-[0.2em] text-midnight-on-surface-variant uppercase mb-1"
                    htmlFor="email"
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-midnight-surface-container-high/50 border border-midnight-outline-variant/30 px-4 py-3 text-sm text-midnight-on-surface placeholder:text-midnight-outline-variant/50 focus:ring-1 focus:ring-midnight-primary focus:border-midnight-primary transition-all duration-300 outline-none rounded-sm"
                  />
                </div>

                <div className="relative">
                  <label
                    className="block text-[9px] font-bold tracking-[0.2em] text-midnight-on-surface-variant uppercase mb-1"
                    htmlFor="password"
                  >
                    PASSWORD
                  </label>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-12 bg-midnight-surface-container-high/50 border border-midnight-outline-variant/30 px-4 py-3 text-sm text-midnight-on-surface placeholder:text-midnight-outline-variant/50 focus:ring-1 focus:ring-midnight-primary focus:border-midnight-primary transition-all duration-300 outline-none rounded-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors mt-[10px]"
                    style={{ color: "rgba(196,199,204,0.6)" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <a href="#"
                     className="text-[10px] font-label uppercase tracking-widest transition-colors"
                     style={{ color: "rgba(176,185,194,0.45)" }}
                     onMouseEnter={e => e.currentTarget.style.color = "#DCC492"}
                     onMouseLeave={e => e.currentTarget.style.color = "rgba(176,185,194,0.45)"}
                  >
                    Forgot password?
                  </a>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-midnight-primary text-midnight-on-primary-fixed py-4 font-label font-bold text-xs tracking-widest uppercase rounded-sm hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#DCC492" strokeWidth="3" opacity="0.25"/>
                      <path fill="#DCC492" opacity="0.8"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Signing in…
                  </span>
                ) : "SIGN IN"}
              </button>
            </form>

            {/* ── Footer links ──────────────────────────────────────────── */}
            <div className="pt-4 flex flex-col gap-4 text-center">
              <p className="text-[11px] text-midnight-on-surface-variant">
                New user?{" "}
                <Link
                  to="/signup"
                  className="text-midnight-primary font-bold hover:underline underline-offset-4 ml-1"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="md:fixed md:bottom-0 w-full flex flex-col md:flex-row justify-center items-center px-12 py-8 bg-transparent gap-6 md:gap-0 z-20">
        <div className="text-[9px] font-bold tracking-[0.2em] text-midnight-on-surface-variant/40 uppercase">
          © 2026 Chronos Intelligence — Built for Trust
        </div>
      </footer>
    </div>
  );
}
