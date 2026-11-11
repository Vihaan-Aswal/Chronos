import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ChronosMark from "../components/chronos-mark.jsx";
import RoomFrame from "../components/home/room-frame.jsx";
import ModeSettings from "../components/home/mode-settings.jsx";
import { STATES } from "../components/home/session-data.js";
import "../styles/home-page.css";

function ArrowIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}

function Brand({ tone = "ink" }) {
  return (
    <Link className={`brand brand-${tone}`} to="/" aria-label="Chronos home">
      <span aria-hidden="true">
        <ChronosMark size={26} variant={tone === "cream" ? "gold" : "dark"} />
      </span>
      <span>Chronos</span>
    </Link>
  );
}

export default function HomePage() {
  const [mode, setMode] = useState("live");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showRecord = () => {
    setMode("after");
    document.getElementById("room")?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="home">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className={`topbar ${scrolled ? "is-scrolled" : ""}`}>
        <div className="wrap nav-inner">
          <Brand />
          <nav className="nav-links" aria-label="Primary">
            <a href="#room">The room</a>
            <a href="#rules">The rules</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="nav-actions">
            <Link className="nav-signin" to="/signin">
              Sign in
            </Link>
            <Link className="btn btn-ink btn-small" to="/signup">
              Host a class
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-field">
            <div className="wrap hero-intro">
              <h1 id="hero-title">
                One room.{" "}
                <br />
                <em>Three</em> moments.
              </h1>
              <div className="hero-side">
                <p className="hero-lede">
                  Chronos shows a live class as it unfolds: the empty room, the
                  six states while it runs, and the record it leaves behind. One
                  state at a time. No blended score.
                </p>
                <div className="hero-actions">
                  <Link className="btn btn-ink" to="/signup">
                    Host a class
                    <ArrowIcon />
                  </Link>
                  <Link className="text-link" to="/signin">
                    Join a class
                  </Link>
                </div>
                <p className="hero-note">
                  <i className="hero-note-dot" aria-hidden="true" />
                  Signals, not surveillance.
                </p>
              </div>
            </div>

            <div className="wrap">
              <RoomFrame mode={mode} setMode={setMode} />

              <div className="record-strip">
                <div className="record-strip-inner">
                  <p className="record-strip-meta">42:00 · 20 learners</p>
                  <p className="record-strip-tpi">
                    TPI <b>75</b>
                    <span>/100</span>
                  </p>
                  <p className="record-strip-follow">2 follow-ups</p>
                  {mode === "after" ? (
                    <span className="record-strip-open">
                      <CheckIcon />
                      Record open
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="record-strip-btn"
                      onClick={showRecord}
                    >
                      See the record
                      <ArrowIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rules" id="rules" aria-labelledby="rules-title">
          <div className="wrap">
            <div className="section-head">
              <h2 id="rules-title">
                Six labels.{" "}
                <br />
                <em>No blended score.</em>
              </h2>
              <p>
                A student is in one state at a time. The bands are fixed, the
                flags are visible, and no face in frame has its own label.
                Nothing here is an emotion.
              </p>
            </div>

            <div className="scale" aria-hidden="true">
              <div className="scale-bar">
                <span className="scale-away">Away</span>
                <span className="scale-distracted">Distracted</span>
                <span className="scale-attentive">Attentive</span>
              </div>
              <div className="scale-ticks">
                <span className="tick-0">0</span>
                <span className="tick-40">0.40</span>
                <span className="tick-70">0.70</span>
                <span className="tick-1">1</span>
              </div>
            </div>

            <div className="state-ledger">
              {STATES.map((state) => (
                <div key={state.key} className="state-row">
                  <div className="state-name">
                    <i
                      className={`state-dot dot-${state.key}`}
                      aria-hidden="true"
                    />
                    <h3>{state.label}</h3>
                    {state.flag && <span className="flag">Flag</span>}
                  </div>
                  <p className="state-rule">{state.range}</p>
                  <p className="state-copy">{state.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="stance" aria-labelledby="stance-title">
          <div className="wrap stance-inner">
            <h2 id="stance-title" className="stance-quote">
              The signal points. <em>The teacher decides.</em>
            </h2>
            <p className="stance-body">
              A nudge goes to the student first. The teacher sees repeated
              concerns, not every glance. No automated discipline. No student
              score that changes a grade.
            </p>
            <div className="views">
              <div className="view-row">
                <h3>Teacher</h3>
                <p>
                  Sees the room, the six labels, and the record. Sends a nudge,
                  or does nothing.
                </p>
              </div>
              <div className="view-row">
                <h3>Student</h3>
                <p>
                  Sees their own state and a private nudge. Never a grade, never
                  a recording.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="privacy" id="privacy" aria-labelledby="privacy-title">
          <div className="wrap">
            <div className="privacy-head">
              <h2 id="privacy-title">
                Strict or normal.{" "}
                <br />
                <em>Class or exam.</em>
              </h2>
              <p>
                Two independent settings, both visible before class. Neither is
                a proctoring claim.
              </p>
            </div>

            <ModeSettings />

            <div className="receipt">
              <p className="receipt-line">
                The session leaves analytics, not footage.
              </p>
              <div className="receipt-cols">
                <div>
                  <h3>Kept</h3>
                  <ul>
                    <li>
                      <CheckIcon />
                      <span>Engagement analytics and the six states</span>
                    </li>
                    <li>
                      <CheckIcon />
                      <span>Identity embeddings used to verify a student</span>
                    </li>
                    <li>
                      <CheckIcon />
                      <span>Teacher actions and the session record</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3>Never kept</h3>
                  <ul>
                    <li>
                      <MinusIcon />
                      <span>Raw video frames</span>
                    </li>
                    <li>
                      <MinusIcon />
                      <span>Page or app content</span>
                    </li>
                    <li>
                      <MinusIcon />
                      <span>Grades</span>
                    </li>
                  </ul>
                </div>
              </div>
              <p className="privacy-note">
                Identity embeddings are stored to verify a student across
                sessions. The video they came from is not. Frames and content
                are never stored.
              </p>
            </div>
          </div>
        </section>

        <section className="close" aria-labelledby="close-title">
          <div className="wrap">
            <h2 id="close-title">
              Open a room.{" "}
              <br />
              <em>Keep the judgment.</em>
            </h2>
            <p>
              Host a class, or join one with the link your teacher shared. The
              preview above is yours to try either way.
            </p>
            <div className="close-actions">
              <Link className="btn btn-cream" to="/signup">
                Host a class
                <ArrowIcon />
              </Link>
              <Link className="btn btn-ghost-cream" to="/signin">
                Join a class
              </Link>
            </div>
            <p className="close-fine">
              Signals, not surveillance. No video stored.
            </p>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand">
              <Brand tone="cream" />
              <p>
                Explainable engagement and identity signals for live sessions.
                Teacher judgment stays central.
              </p>
            </div>
            <nav className="foot-links" aria-label="Footer">
              <a href="#room">The room</a>
              <a href="#rules">The rules</a>
              <a href="#privacy">Privacy</a>
              <Link to="/signin">Sign in</Link>
              <Link to="/signup">Host a class</Link>
            </nav>
            <p className="foot-note">
              Illustrative preview.
              <br />
              Not a proctoring tool.
            </p>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Chronos · Intelligence for Presence</span>
            <span>Built for the humane classroom.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
