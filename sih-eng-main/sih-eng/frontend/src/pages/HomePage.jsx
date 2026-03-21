/**
 * HomePage.jsx
 *
 * Full faithful translation of UI_plan/chronos_homepage/code.html
 * into a React component. All markup, class names, and inline SVG
 * are preserved; HTML attributes are converted to valid JSX.
 *
 * Sign In  → /signin
 * Sign Up  → /signup
 */

import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="bg-surface text-on-surface overflow-x-hidden selection:bg-secondary-container font-body">

      {/* ── Grainy noise overlay (fixed, above everything) ──────────────── */}
      <div className="fixed inset-0 grainy-overlay z-[200] pointer-events-none" />

      {/* ══════════════════════════════════════════════════════════════════
          HEADER / NAV
      ══════════════════════════════════════════════════════════════════ */}
      <header className="fixed top-0 left-0 right-0 z-[100] bg-surface/70 backdrop-blur-xl border-b border-surface-container-highest/20">
        <nav className="max-w-7xl mx-auto px-10 py-6 flex justify-between items-center">
          <div className="text-2xl font-headline italic tracking-tight text-primary">
            Chronos
          </div>
          <div className="flex items-center gap-12">
            <Link
              to="/signin"
              className="text-xs uppercase tracking-[0.2em] font-semibold text-secondary hover:text-primary transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="bg-primary text-on-primary px-8 py-3 rounded-full text-xs uppercase tracking-[0.2em] font-semibold hover:opacity-90 transition-opacity premium-shadow"
            >
              Sign up
            </Link>
          </div>
        </nav>
      </header>

      <main>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 1 — Hero
        ══════════════════════════════════════════════════════════════ */}
        <section className="min-h-screen flex items-center pt-24 relative overflow-hidden">
          {/* Radial background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,_rgba(211,228,247,0.4)_0%,_rgba(250,249,245,0)_60%)]" />

          <div className="max-w-7xl mx-auto px-10 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative">

            {/* Left: headline + CTAs */}
            <div className="lg:col-span-6 space-y-12 z-10">
              <div className="space-y-6">
                <span className="inline-block px-5 py-2 rounded-full bg-white/50 backdrop-blur border border-surface-container-high text-[10px] font-bold tracking-[0.3em] text-tertiary-fixed-dim uppercase">
                  Explainable classroom intelligence
                </span>
                <h1 className="text-7xl md:text-9xl font-headline font-light leading-[0.95] tracking-tight text-primary italic">
                  See who is truly present.
                </h1>
                <p className="text-xl md:text-2xl text-secondary font-body leading-relaxed max-w-lg font-light">
                  Chronos adds explainable engagement and identity signals to
                  live sessions, guiding teachers to spot disengagement without
                  the noise.
                </p>
              </div>

              <div className="flex items-center gap-10">
                <Link
                  to="/signup"
                  className="bg-primary text-on-primary px-12 py-5 rounded-full font-body text-xs font-bold tracking-[0.2em] uppercase transition-all hover:-translate-y-1 hover:shadow-2xl"
                >
                  Sign up
                </Link>
                <Link
                  to="/signin"
                  className="text-primary font-body text-xs font-bold border-b border-primary/20 hover:border-primary transition-all pb-1 tracking-[0.2em] uppercase"
                >
                  Sign in
                </Link>
              </div>
            </div>

            {/* Right: floating dashboard preview card */}
            <div className="lg:col-span-6 relative">
              <div className="relative z-20 floating-plane bg-white rounded-[2rem] p-10 premium-shadow border border-surface-container-high/50 transform translate-x-4 lg:translate-x-12">

                {/* Card header */}
                <div className="flex justify-between items-start mb-16">
                  <div>
                    <span className="text-[9px] uppercase tracking-[0.3em] text-secondary/60 font-bold block mb-2">
                      Teacher Dashboard
                    </span>
                    <h3 className="text-3xl font-headline text-primary italic">
                      Live Class Overview
                    </h3>
                  </div>
                  <div className="text-right">
                    <div className="text-5xl font-headline italic text-primary">
                      84.2%
                    </div>
                    <span className="text-[9px] uppercase tracking-widest text-secondary font-bold">
                      Teacher Performance Index
                    </span>
                  </div>
                </div>

                {/* Engagement bars */}
                <div className="space-y-10">
                  <div className="flex items-center justify-between gap-6 p-6 bg-surface-container-low/50 rounded-2xl border border-surface-container">
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-[9px] font-bold text-secondary uppercase mb-3">
                        Engaged
                      </span>
                      <div className="w-full h-1 bg-secondary-fixed rounded-full overflow-hidden">
                        <div className="w-[70%] h-full bg-secondary" />
                      </div>
                    </div>
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-[9px] font-bold text-secondary uppercase mb-3">
                        Partial
                      </span>
                      <div className="w-full h-1 bg-tertiary-fixed rounded-full overflow-hidden">
                        <div className="w-[20%] h-full bg-on-tertiary-fixed-variant" />
                      </div>
                    </div>
                    <div className="flex flex-col items-center flex-1 text-center">
                      <span className="text-[9px] font-bold text-secondary uppercase mb-3">
                        Disengaged
                      </span>
                      <div className="w-full h-1 bg-error-container rounded-full overflow-hidden">
                        <div className="w-[10%] h-full bg-error" />
                      </div>
                    </div>
                  </div>

                  {/* Alert card */}
                  <div className="bg-primary text-on-primary p-8 rounded-3xl flex items-center gap-8 premium-shadow transform -translate-x-8 -rotate-1">
                    <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center backdrop-blur">
                      <span className="material-symbols-outlined text-tertiary-fixed text-3xl">
                        spatial_tracking
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-tertiary-fixed mb-2">
                        Students needing review
                      </p>
                      <p className="text-lg font-light opacity-90 italic">
                        Identity check failed for 2 participants
                      </p>
                    </div>
                    <div className="px-5 py-2.5 bg-white/10 rounded-full text-[9px] font-bold uppercase tracking-widest border border-white/20">
                      Soft nudge sent
                    </div>
                  </div>

                  {/* Signal chart */}
                  <div className="pt-6">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em]">
                        Session signals
                      </span>
                      <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-secondary animate-pulse" />
                        <span className="text-[9px] text-secondary tracking-widest uppercase">
                          Real-time
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-6 gap-3">
                      <div className="h-14 bg-surface-container-highest/20 rounded-xl" />
                      <div className="h-14 bg-surface-container-highest/40 rounded-xl" />
                      <div className="h-14 bg-primary rounded-xl" />
                      <div className="h-14 bg-surface-container-highest/60 rounded-xl" />
                      <div className="h-14 bg-surface-container-highest/30 rounded-xl" />
                      <div className="h-14 bg-surface-container-highest/10 rounded-xl" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative blobs */}
              <div className="absolute -top-12 -right-12 w-64 h-64 bg-secondary-fixed/30 rounded-full blur-3xl -z-10" />
              <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-tertiary-fixed/20 rounded-full blur-[100px] -z-10" />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 2 — The Problem
        ══════════════════════════════════════════════════════════════ */}
        <section className="editorial-spacing bg-white relative">
          <div className="max-w-7xl mx-auto px-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-24">

              {/* Sticky left column */}
              <div className="lg:col-span-5 sticky top-32 h-fit">
                <span className="text-[10px] font-bold tracking-[0.4em] text-tertiary-fixed-dim uppercase block mb-8">
                  The problem
                </span>
                <h2 className="text-6xl md:text-7xl font-headline text-primary leading-[1.1] italic">
                  Standard video tools show faces, not real presence.
                </h2>
                <p className="text-xl text-secondary mt-10 font-light leading-relaxed max-w-md">
                  In live online classes, signals of engagement are often buried
                  under technical noise or hidden by static frames.
                </p>
              </div>

              {/* Problem cards */}
              <div className="lg:col-span-7 space-y-16 lg:pt-24">
                <div className="p-16 bg-surface rounded-[3rem] border border-surface-container-high transition-all transform hover:-translate-y-2 premium-shadow relative group">
                  <span className="text-4xl font-headline text-surface-container-highest/50 absolute top-10 right-10 italic">
                    01
                  </span>
                  <h3 className="text-3xl font-headline text-primary mb-6 italic">
                    Hidden disengagement
                  </h3>
                  <p className="text-secondary text-lg leading-relaxed font-light">
                    Teachers cannot reliably tell who is focused, partially
                    attentive, or repeatedly disengaging during a live session.
                  </p>
                </div>

                <div className="p-16 bg-surface rounded-[3rem] border border-surface-container-high transition-all transform hover:-translate-y-2 premium-shadow lg:-translate-x-12 relative">
                  <span className="text-4xl font-headline text-surface-container-highest/50 absolute top-10 right-10 italic">
                    02
                  </span>
                  <h3 className="text-3xl font-headline text-primary mb-6 italic">
                    Identity uncertainty
                  </h3>
                  <p className="text-secondary text-lg leading-relaxed font-light">
                    Multi-face events and identity mismatch are difficult to
                    catch consistently without structured visibility.
                  </p>
                </div>

                <div className="p-16 bg-surface rounded-[3rem] border border-surface-container-high transition-all transform hover:-translate-y-2 premium-shadow relative">
                  <span className="text-4xl font-headline text-surface-container-highest/50 absolute top-10 right-10 italic">
                    03
                  </span>
                  <h3 className="text-3xl font-headline text-primary mb-6 italic">
                    No usable evidence
                  </h3>
                  <p className="text-secondary text-lg leading-relaxed font-light">
                    Most platforms lack a clear post-class view of attention
                    shifts or students who may need follow-up.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 3 — Live Monitoring Features (dark / primary bg)
        ══════════════════════════════════════════════════════════════ */}
        <section className="editorial-spacing bg-primary relative overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_rgba(255,255,255,0.05)_0%,_transparent_50%)]" />
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-secondary/20 rounded-full blur-[160px] -mr-96 -mt-96" />

          <div className="max-w-7xl mx-auto px-10 relative z-10">

            {/* Section header */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center mb-32">
              <div className="space-y-8">
                <span className="text-[10px] font-bold tracking-[0.4em] text-tertiary-fixed-dim uppercase block">
                  Live monitoring
                </span>
                <h2 className="text-6xl md:text-8xl font-headline text-on-primary leading-[0.95] italic">
                  Live signals, not surveillance.
                </h2>
              </div>
              <div>
                <p className="text-2xl text-on-primary-container font-light leading-relaxed">
                  Chronos interprets classroom signals over time and turns them
                  into explainable states. Teacher judgment stays central.
                </p>
              </div>
            </div>

            {/* Feature cards row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="p-10 bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 hover:bg-white/10 transition-colors">
                <div className="w-14 h-14 bg-tertiary-fixed/10 rounded-full flex items-center justify-center mb-8">
                  <span className="material-symbols-outlined text-tertiary-fixed text-3xl">
                    lens_blur
                  </span>
                </div>
                <h4 className="text-on-primary font-headline text-2xl italic mb-4">
                  Explainable States
                </h4>
                <p className="text-sm text-on-primary-container leading-relaxed font-light">
                  Clear states like Engaged, Partial, or NO_DATA provide
                  immediate clarity.
                </p>
              </div>

              <div className="p-10 bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 hover:bg-white/10 transition-colors transform lg:translate-y-8">
                <div className="w-14 h-14 bg-tertiary-fixed/10 rounded-full flex items-center justify-center mb-8">
                  <span className="material-symbols-outlined text-tertiary-fixed text-3xl">
                    notifications_active
                  </span>
                </div>
                <h4 className="text-on-primary font-headline text-2xl italic mb-4">
                  Gentle Nudges
                </h4>
                <p className="text-sm text-on-primary-container leading-relaxed font-light">
                  Soft nudges go to students first. Teachers only see repeated
                  concerns.
                </p>
              </div>

              <div className="p-10 bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 hover:bg-white/10 transition-colors">
                <div className="w-14 h-14 bg-tertiary-fixed/10 rounded-full flex items-center justify-center mb-8">
                  <span className="material-symbols-outlined text-tertiary-fixed text-3xl">
                    face
                  </span>
                </div>
                <h4 className="text-on-primary font-headline text-2xl italic mb-4">
                  Attention Signals
                </h4>
                <p className="text-sm text-on-primary-container leading-relaxed font-light">
                  Monitoring head pose and eye openness for genuine classroom
                  insight.
                </p>
              </div>

              <div className="p-10 bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 hover:bg-white/10 transition-colors transform lg:translate-y-8">
                <div className="w-14 h-14 bg-tertiary-fixed/10 rounded-full flex items-center justify-center mb-8">
                  <span className="material-symbols-outlined text-tertiary-fixed text-3xl">
                    fingerprint
                  </span>
                </div>
                <h4 className="text-on-primary font-headline text-2xl italic mb-4">
                  Background Identity
                </h4>
                <p className="text-sm text-on-primary-container leading-relaxed font-light">
                  Consistency and spoofing signals run silently in the
                  background.
                </p>
              </div>
            </div>

            {/* Privacy / Flexible modes row */}
            <div className="mt-40 grid grid-cols-1 md:grid-cols-2 gap-16 border-t border-white/10 pt-20">
              <div className="flex items-start gap-8">
                <span className="material-symbols-outlined text-tertiary-fixed text-4xl">
                  shield_lock
                </span>
                <div>
                  <h4 className="text-on-primary font-bold text-xs uppercase tracking-[0.3em] mb-3">
                    Privacy Assurance
                  </h4>
                  <p className="text-lg text-on-primary-container font-light italic">
                    No URL or app-content recording. Technical uncertainty stays
                    separate from misconduct.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-8">
                <span className="material-symbols-outlined text-tertiary-fixed text-4xl">
                  tune
                </span>
                <div>
                  <h4 className="text-on-primary font-bold text-xs uppercase tracking-[0.3em] mb-3">
                    Flexible Modes
                  </h4>
                  <p className="text-lg text-on-primary-container font-light italic">
                    Choose between stricter or more flexible monitoring modes
                    based on class needs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 4 — Post-Session Reporting
        ══════════════════════════════════════════════════════════════ */}
        <section className="editorial-spacing bg-white">
          <div className="max-w-7xl mx-auto px-10">

            <div className="text-center max-w-3xl mx-auto mb-32">
              <span className="text-[10px] font-bold tracking-[0.4em] text-tertiary-fixed-dim uppercase block mb-8">
                Post-session reporting
              </span>
              <h2 className="text-6xl md:text-7xl font-headline text-primary italic leading-tight">
                Every class becomes a reviewable record.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Card 1 */}
              <div className="p-16 bg-surface-container-low rounded-[4rem] border border-surface-container-high premium-shadow group relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-4xl font-headline text-primary mb-8 italic">
                    Session overview
                  </h3>
                  <p className="text-secondary text-lg mb-12 font-light leading-relaxed">
                    Review session quality, participant counts, and critical
                    event distributions at a high level.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <span className="px-6 py-3 bg-white rounded-full text-[10px] font-bold uppercase tracking-widest text-secondary border border-surface-container shadow-sm">
                      Teacher Index
                    </span>
                    <span className="px-6 py-3 bg-white rounded-full text-[10px] font-bold uppercase tracking-widest text-secondary border border-surface-container shadow-sm">
                      Total nudges
                    </span>
                  </div>
                </div>
                <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-tertiary-fixed/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
              </div>

              {/* Card 2 */}
              <div className="p-16 bg-surface rounded-[4rem] border border-surface-container-high premium-shadow group relative overflow-hidden transform md:translate-y-20">
                <div className="relative z-10">
                  <h3 className="text-4xl font-headline text-primary mb-8 italic">
                    Students needing review
                  </h3>
                  <p className="text-secondary text-lg mb-12 font-light leading-relaxed">
                    Identify repeated disengagement or unresolved identity flags
                    that require teacher attention.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <span className="px-6 py-3 bg-white rounded-full text-[10px] font-bold uppercase tracking-widest text-error/70 border border-error-container shadow-sm">
                      Identity flags
                    </span>
                    <span className="px-6 py-3 bg-white rounded-full text-[10px] font-bold uppercase tracking-widest text-secondary border border-surface-container shadow-sm">
                      Review count
                    </span>
                  </div>
                </div>
                <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-secondary-fixed/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
              </div>

              {/* Card 3 */}
              <div className="p-16 bg-surface rounded-[4rem] border border-surface-container-high premium-shadow group relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-4xl font-headline text-primary mb-8 italic">
                    Signals over time
                  </h3>
                  <p className="text-secondary text-lg mb-12 font-light leading-relaxed">
                    Track shifts in attention and engagement through the session
                    timeline to see patterns.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <span className="px-6 py-3 bg-white rounded-full text-[10px] font-bold uppercase tracking-widest text-secondary border border-surface-container shadow-sm">
                      Attention trend
                    </span>
                    <span className="px-6 py-3 bg-white rounded-full text-[10px] font-bold uppercase tracking-widest text-secondary border border-surface-container shadow-sm">
                      Distributions
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4 */}
              <div className="p-16 bg-surface-container-low rounded-[4rem] border border-surface-container-high premium-shadow group relative overflow-hidden transform md:translate-y-20">
                <div className="relative z-10">
                  <h3 className="text-4xl font-headline text-primary mb-8 italic">
                    Evidence-ready summaries
                  </h3>
                  <p className="text-secondary text-lg mb-12 font-light leading-relaxed">
                    Export professional session records that support
                    accountability and teaching improvement.
                  </p>
                  <button className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.3em] text-primary group/btn">
                    Export records
                    <span className="material-symbols-outlined text-sm transition-transform group-hover/btn:translate-x-2">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 5 — How It Works
        ══════════════════════════════════════════════════════════════ */}
        <section className="editorial-spacing bg-surface-container-low relative">
          <div className="max-w-7xl mx-auto px-10">

            <div className="flex flex-col items-center mb-40 text-center">
              <span className="text-[10px] font-bold tracking-[0.4em] text-tertiary-fixed-dim uppercase block mb-8">
                How it works
              </span>
              <h2 className="text-6xl md:text-7xl font-headline text-primary italic leading-tight">
                A calmer flow for live teaching.
              </h2>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-16">
              <div className="relative bg-white p-12 rounded-[3rem] premium-shadow border border-surface-container-high transform hover:-translate-y-4 transition-transform z-30">
                <span className="text-8xl font-headline text-surface-container-highest/20 absolute -top-16 left-8 italic">
                  01
                </span>
                <div className="space-y-6">
                  <h4 className="text-2xl font-headline text-primary italic pt-8">
                    Sign in &amp; Role
                  </h4>
                  <p className="text-secondary leading-relaxed font-light">
                    Teachers host, students join. Chronos intelligently routes
                    everyone to their dedicated experience.
                  </p>
                </div>
              </div>

              <div className="relative bg-white p-12 rounded-[3rem] premium-shadow border border-surface-container-high transform hover:-translate-y-4 transition-transform translate-y-12 z-20">
                <span className="text-8xl font-headline text-surface-container-highest/20 absolute -top-16 left-8 italic">
                  02
                </span>
                <div className="space-y-6">
                  <h4 className="text-2xl font-headline text-primary italic pt-8">
                    Verify &amp; Enter
                  </h4>
                  <p className="text-secondary leading-relaxed font-light">
                    Quick, humane checks before class ensure trust and visibility
                    are established from the first second.
                  </p>
                </div>
              </div>

              <div className="relative bg-white p-12 rounded-[3rem] premium-shadow border border-surface-container-high transform hover:-translate-y-4 transition-transform translate-y-24 z-10">
                <span className="text-8xl font-headline text-surface-container-highest/20 absolute -top-16 left-8 italic">
                  03
                </span>
                <div className="space-y-6">
                  <h4 className="text-2xl font-headline text-primary italic pt-8">
                    Monitor &amp; Review
                  </h4>
                  <p className="text-secondary leading-relaxed font-light">
                    Surface concerns quietly in real-time. Deep dive into
                    timelines and reports after the session ends.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 6 — Trust & Privacy
        ══════════════════════════════════════════════════════════════ */}
        <section className="editorial-spacing bg-white">
          <div className="max-w-5xl mx-auto px-10 text-center relative">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-surface-container rounded-full mb-16 shadow-inner">
              <span className="material-symbols-outlined text-primary text-4xl">
                diversity_1
              </span>
            </div>
            <span className="text-[10px] font-bold tracking-[0.4em] text-tertiary-fixed-dim uppercase block mb-8">
              Trust and privacy
            </span>
            <h2 className="text-5xl md:text-7xl font-headline text-primary italic mb-12">
              Fairness depends on visibility.
            </h2>

            <div className="space-y-12 text-2xl text-secondary font-light leading-relaxed max-w-3xl mx-auto">
              <p>
                Chronos is designed to support educators without turning
                uncertainty into accusation. We provide context, not just data.
              </p>

              {/* Privacy guarantees grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-12 text-left text-sm mt-24 pt-24 border-t border-surface-container-high">
                <div className="flex items-start gap-6 group">
                  <div className="p-3 bg-surface-container-low rounded-xl transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <span className="material-symbols-outlined">
                      no_photography
                    </span>
                  </div>
                  <p className="pt-2 font-medium text-primary">
                    Raw video is never stored by default
                  </p>
                </div>

                <div className="flex items-start gap-6 group">
                  <div className="p-3 bg-surface-container-low rounded-xl transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <span className="material-symbols-outlined">block</span>
                  </div>
                  <p className="pt-2 font-medium text-primary">
                    No URL or application recording
                  </p>
                </div>

                <div className="flex items-start gap-6 group">
                  <div className="p-3 bg-surface-container-low rounded-xl transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <span className="material-symbols-outlined">campaign</span>
                  </div>
                  <p className="pt-2 font-medium text-primary">
                    Soft nudges prioritize student recovery
                  </p>
                </div>

                <div className="flex items-start gap-6 group">
                  <div className="p-3 bg-surface-container-low rounded-xl transition-colors group-hover:bg-primary group-hover:text-on-primary">
                    <span className="material-symbols-outlined">info</span>
                  </div>
                  <p className="pt-2 font-medium text-primary">
                    Explainable signals support judgment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 7 — CTA "Bring clarity back"
        ══════════════════════════════════════════════════════════════ */}
        <section className="editorial-spacing bg-background text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(203,231,245,0.2)_0%,_transparent_70%)]" />
          <div className="max-w-4xl mx-auto px-10 relative z-10">
            <h2 className="text-7xl md:text-9xl font-headline text-primary mb-12 italic">
              Bring clarity back.
            </h2>
            <p className="text-2xl text-secondary mb-20 font-light max-w-xl mx-auto">
              Create an account to host or join a session, or sign in to
              continue.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-10">
              <Link
                to="/signup"
                className="bg-primary text-on-primary px-20 py-6 rounded-full font-body text-xs font-bold tracking-[0.3em] uppercase transition-all hover:scale-105 hover:shadow-2xl"
              >
                Sign up
              </Link>
              <Link
                to="/signin"
                className="bg-white text-primary border border-surface-container-high px-20 py-6 rounded-full font-body text-xs font-bold tracking-[0.3em] uppercase transition-all hover:bg-surface-container-low"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ══════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════ */}
      <footer className="bg-white py-32 border-t border-surface-container-high">
        <div className="max-w-7xl mx-auto px-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-20">

            {/* Brand blurb */}
            <div className="space-y-6">
              <div className="text-4xl font-headline italic text-primary">
                Chronos
              </div>
              <p className="text-base text-secondary font-light max-w-sm leading-relaxed">
                Explainable classroom intelligence built for the architecture of
                presence.
              </p>
            </div>

            {/* Footer nav */}
            <div className="flex flex-col sm:flex-row gap-24">
              <div className="space-y-8">
                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-tertiary-fixed-dim">
                  Experience
                </span>
                <ul className="space-y-5 text-sm font-medium text-secondary">
                  <li>
                    <Link
                      to="/signin"
                      className="hover:text-primary transition-colors"
                    >
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/signup"
                      className="hover:text-primary transition-colors"
                    >
                      Sign up
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-8">
                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-tertiary-fixed-dim">
                  Trust
                </span>
                <ul className="space-y-5 text-sm font-medium text-secondary">
                  <li>
                    <a href="#" className="hover:text-primary transition-colors">
                      Privacy Policy
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-primary transition-colors">
                      Terms of Service
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-32 pt-10 border-t border-surface-container flex flex-col md:flex-row justify-between items-center gap-6 text-[9px] font-bold uppercase tracking-[0.4em] text-secondary/40">
            <span>© 2024 Chronos — Intelligence for Presence</span>
            <span className="italic">Built for the humane classroom</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
