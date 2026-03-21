/**
 * SignUpPage.jsx  —  Phase 5
 *
 * Faithful JSX translation of UI_plan/chronos_sign_up/code.html.
 * This page uses the Parchment (light) theme — NO dark-mode class on root.
 * The background is the warm #F2EDE4 tone from the Stitch screen, implemented
 * via an inline style since it's a one-off value not in the token set.
 *
 * Auth flow (per plan §4.1 confirmed decisions):
 *   - Calls supabase.auth.signUp
 *   - On success → shows static success message → navigate to /signin
 *   - Does NOT auto-login, does NOT wait for email confirmation
 *   - On failure (e.g. already registered) → shows inline error message
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function SignUpPage() {
  const navigate = useNavigate();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Force sign out to destroy the session Supabase creates by default.
    // This honors the plan's requirement that the user MUST manually sign in.
    if (data?.session) {
      await supabase.auth.signOut();
    }

    // Per plan §10 confirmed decision:
    // "Show a static message: 'Account created! You can now sign in.'
    //  and redirect to /signin. No auto-login, no confirmation-waiting state."
    setSuccess(true);

    // Brief pause so the user sees the success message, then redirect
    setTimeout(() => {
      navigate("/signin", { replace: true });
    }, 2200);
  }

  return (
    /* ── Parchment (light) theme — no dark class ─────────────────────────── */
    <div
      className="font-body min-h-screen overflow-x-hidden"
      style={{ backgroundColor: "#F2EDE4", color: "#1C2B35" }}
    >
      {/* ── Fixed background layers ────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Warm dot-grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(200, 194, 184, 0.2) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Warm directional scrim */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(242,237,228,0.8) 0%, rgba(242,237,228,0.4) 100%)",
          }}
        />
        {/* Glow blobs */}
        <div
          className="absolute top-[20%] left-[10%] w-[600px] h-[600px] rounded-full blur-[150px]"
          style={{ backgroundColor: "rgba(245,223,160,0.05)" }}
        />
        <div
          className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] rounded-full blur-[120px]"
          style={{ backgroundColor: "rgba(48,74,86,0.06)" }}
        />
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
              stroke="#C8C2B8"
              strokeWidth="0.5"
            />
            <circle cx="100" cy="300" fill="#C8C2B8" r="2" />
            <circle cx="300" cy="300" fill="#C8C2B8" r="2" />
            <circle cx="500" cy="300" fill="#C8C2B8" r="2" />
            <circle cx="700" cy="300" fill="#C8C2B8" r="2" />
            <path
              d="M200 100L300 300L400 500"
              stroke="#C8C2B8"
              strokeDasharray="4 4"
              strokeWidth="0.5"
            />
          </svg>
        </div>
      </div>

      {/* ── Main split layout ──────────────────────────────────────────────── */}
      <main className="relative z-10 min-h-screen flex flex-col md:grid md:grid-cols-12">

        {/* Chronos wordmark — top-left */}
        <header className="absolute top-0 left-0 p-8 md:p-12 w-full">
          <Link
            to="/"
            className="text-2xl font-headline italic tracking-tighter hover:opacity-70 transition-opacity"
            style={{ color: "#0F1E2B" }}
          >
            Chronos
          </Link>
        </header>

        {/* ── Left column: hero text (7/12) ──────────────────────────────── */}
        <div className="col-span-12 md:col-span-7 flex flex-col justify-center px-8 md:pl-24 md:pr-12 pt-32 md:pt-0">
          <div className="max-w-3xl space-y-8">
            <h1
              className="text-5xl md:text-8xl font-headline italic leading-[1.1] tracking-tight"
              style={{ color: "#0F1E2B" }}
            >
              Fair signals,
              <br />
              <span className="opacity-70">not surveillance.</span>
            </h1>
            <p
              className="text-xl md:text-2xl font-body font-light leading-relaxed max-w-2xl"
              style={{ color: "#1C2B35" }}
            >
              Elevating the academic journey through transparent, explainable
              intelligence. We believe in trust-based insights that empower
              educators and students alike.
            </p>
            <div className="flex items-center gap-6 pt-4">
              <div className="h-[1px] w-12" style={{ backgroundColor: "#C8C2B8" }} />
              <span
                className="text-[10px] uppercase tracking-[0.3em] font-bold"
                style={{ color: "#8A8A80" }}
              >
                Defining Classroom Clarity
              </span>
            </div>
          </div>
        </div>

        {/* ── Right column: warm form card (5/12) ────────────────────────── */}
        <div className="col-span-12 md:col-span-5 flex flex-col justify-center p-8 md:p-16">
          <div
            className="border p-8 md:p-12 rounded-xl space-y-8 shadow-xl scale-[1.1]"
            style={{
              backgroundColor: "#FAF7F2",
              borderColor: "#DEDAD4",
            }}
          >
            <div className="space-y-1">
              <h2
                className="text-lg font-headline italic mb-4"
                style={{ color: "#0F1E2B" }}
              >
                Sign up to continue
              </h2>
            </div>

            {/* ── Success message ─────────────────────────────────────────── */}
            {success && (
              <div
                className="rounded-sm px-4 py-3 border"
                style={{
                  backgroundColor: "rgba(245,223,160,0.25)",
                  borderColor: "#DCC492",
                }}
              >
                <p
                  className="text-[12px] font-semibold"
                  style={{ color: "#0F1E2B" }}
                >
                  Account created! You can now sign in.
                </p>
                <p className="text-[10px] mt-1" style={{ color: "#6B6860" }}>
                  Redirecting to sign in…
                </p>
              </div>
            )}

            {/* ── Error message ────────────────────────────────────────────── */}
            {error && (
              <div
                className="rounded-sm px-4 py-3 border"
                style={{
                  backgroundColor: "rgba(186,26,26,0.06)",
                  borderColor: "rgba(186,26,26,0.3)",
                }}
              >
                <p
                  className="text-[11px] font-medium"
                  style={{ color: "#ba1a1a" }}
                >
                  {error}
                </p>
              </div>
            )}

            {/* ── Form ────────────────────────────────────────────────────── */}
            {!success && (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div className="relative">
                    <label
                      className="block text-[9px] font-bold tracking-[0.2em] uppercase mb-1"
                      htmlFor="email"
                      style={{ color: "#1C2B35" }}
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
                      className="w-full border px-4 py-3 text-sm transition-all duration-300 outline-none rounded-sm"
                      style={{
                        backgroundColor: "#F5F1EA",
                        borderColor: "#C8C2B8",
                        color: "#1C2B35",
                      }}
                    />
                  </div>

                  <div className="relative">
                    <label
                      className="block text-[9px] font-bold tracking-[0.2em] uppercase mb-1"
                      htmlFor="password"
                      style={{ color: "#1C2B35" }}
                    >
                      PASSWORD
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border px-4 py-3 text-sm transition-all duration-300 outline-none rounded-sm"
                      style={{
                        backgroundColor: "#F5F1EA",
                        borderColor: "#C8C2B8",
                        color: "#1C2B35",
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 font-label font-bold text-xs tracking-widest uppercase rounded-sm hover:brightness-95 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "#F5DFA0",
                    color: "#0F1E2B",
                  }}
                >
                  {loading ? "CREATING ACCOUNT…" : "SIGN UP"}
                </button>
              </form>
            )}

            {/* ── Footer links ─────────────────────────────────────────────── */}
            <div className="pt-4 flex flex-col gap-4 text-center">
              <p className="text-[11px]" style={{ color: "#6B6860" }}>
                Already have an account?{" "}
                <Link
                  to="/signin"
                  className="font-bold hover:underline underline-offset-4 ml-1"
                  style={{ color: "#0F1E2B" }}
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="md:fixed md:bottom-0 w-full flex flex-col md:flex-row justify-center items-center px-12 py-8 bg-transparent gap-6 md:gap-0 z-20">
        <div
          className="text-[9px] font-bold tracking-[0.2em] uppercase"
          style={{ color: "#8A8A80" }}
        >
          © 2024 Chronos Intelligence — Built for Trust
        </div>
      </footer>
    </div>
  );
}
