import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ChronosMark from "../components/chronos-mark.jsx";
import RoomWindow from "../components/home/room-frame.jsx";
import ModeSettings from "../components/home/mode-settings.jsx";
import { useRevealOnce } from "../components/home/use-home-motion.js";
import { STATES } from "../components/home/session-data.js";
import { useMotionPreference } from "../components/motion/use-motion-preference.js";
import "../styles/home-page.css";
import "../styles/home-motion.css";

const FLAGS = STATES.filter((state) => state.kind === "flag");

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
  const [scrolled, setScrolled] = useState(false);
  const { reduced } = useMotionPreference();
  const bandRef = useRef(null);
  const chainRef = useRef(null);
  useRevealOnce(bandRef, !reduced);
  useRevealOnce(chainRef, !reduced);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="home">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className={`topbar ${scrolled ? "is-scrolled" : ""}`}>
        <div className="wrap nav-inner">
          <Brand tone={scrolled ? "ink" : "cream"} />
          <nav className="nav-links" aria-label="Primary">
            <a href="#room">The room</a>
            <a href="#labels">The labels</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="nav-actions">
            <Link className="nav-signin" to="/signin">
              Sign in
            </Link>
            <Link
              className={`btn btn-small ${scrolled ? "btn-ink" : "btn-cream"}`}
              to="/signup"
            >
              Host a class
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap hero-grid">
            <h1 id="hero-title">
              Notice the room.
              <br />
              <em>Not the score.</em>
            </h1>
            <div className="hero-side">
              <p className="hero-lede">
                A live class is twenty people, not one average. Chronos names one
                state at a time and hands the next move to the teacher.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-cream" to="/signup">
                  Host a class
                  <ArrowIcon />
                </Link>
                <Link className="btn btn-ghost" to="/signin">
                  Join with a link
                </Link>
              </div>
              <p className="hero-note">
                <i aria-hidden="true" />
                Signals, not surveillance.
              </p>
            </div>
          </div>

          <div className="wrap room-wrap">
            <RoomWindow />
          </div>
        </section>

        <section className="labels" id="labels" aria-labelledby="labels-title">
          <div className="wrap">
            <div className="section-head">
              <h2 id="labels-title">
                Six labels.
                <br />
                <em>No blended score.</em>
              </h2>
              <div className="section-side">
                <p>
                  Three score bands, three flags. A student is in one state at a
                  time, and no face in frame is a camera miss — not a verdict.
                </p>
                <p className="section-fine">
                  No emotion. No ranking. No student score that changes a grade.
                </p>
              </div>
            </div>

            <div className="band">
              <div ref={bandRef} className="band-zones">
                <div className="band-zone zone-away">
                  <div className="zone-head">
                    <span>Away</span>
                    <span>Below 0.40</span>
                  </div>
                  <p>A flag, never an automatic action.</p>
                </div>
                <div className="band-zone zone-distracted">
                  <div className="zone-head">
                    <span>Distracted</span>
                    <span>0.40 – 0.70</span>
                  </div>
                  <p>Time and a nudge first.</p>
                </div>
                <div className="band-zone zone-attentive">
                  <div className="zone-head">
                    <span>Attentive</span>
                    <span>Above 0.70</span>
                  </div>
                  <p>Present and looking at the room.</p>
                </div>
              </div>
              <div className="band-ticks" aria-hidden="true">
                <span>0</span>
                <span>0.40</span>
                <span>0.70</span>
                <span>1</span>
              </div>
            </div>

            <div className="flags">
              <div className="flags-head">
                <h3>Three flags, not bands</h3>
                <p>They interrupt the band. They never blend into a score.</p>
              </div>
              <ul>
                {FLAGS.map((state) => (
                  <li key={state.key}>
                    <div className="flag-name">
                      <i
                        className={`state-dot dot-${state.key}`}
                        aria-hidden="true"
                      />
                      <h4>{state.label}</h4>
                    </div>
                    <p className="flag-range">{state.range}</p>
                    <p className="flag-rule">{state.rule}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          className="settings-section"
          id="settings"
          aria-labelledby="settings-title"
        >
          <div className="wrap">
            <div className="section-head">
              <h2 id="settings-title">
                Strict or normal.
                <br />
                <em>Class or exam.</em>
              </h2>
              <p>
                Two independent settings, both visible before class. Neither is
                a proctoring claim.
              </p>
            </div>
            <ModeSettings />
          </div>
        </section>

        <section className="stance" aria-labelledby="stance-title">
          <div className="wrap">
            <div className="stance-head">
              <h2 id="stance-title">
                The signal points.
                <br />
                <em>The teacher decides.</em>
              </h2>
              <p>
                A nudge goes to the student first. The teacher sees repeated
                concerns, never a live feed of every glance. Nothing is
                automated.
              </p>
            </div>

            <ol ref={chainRef} className="chain">
              <li>
                <span>Signal</span>
                <p>One state changes. The room shows it.</p>
              </li>
              <li>
                <span>Private nudge</span>
                <p>The student gets a quiet message, not a mark.</p>
              </li>
              <li>
                <span>Time</span>
                <p>The label waits for attention to return.</p>
              </li>
              <li>
                <span>Teacher&rsquo;s call</span>
                <p>Mark engaged, message, ignore, or remove.</p>
              </li>
            </ol>

            <div className="views">
              <div className="view">
                <h3>The teacher sees</h3>
                <p>
                  The room, the six labels, the record. Repeated concerns, not
                  every glance.
                </p>
              </div>
              <div className="view">
                <h3>The student sees</h3>
                <p>
                  Their own state and a private nudge. Never a grade, never a
                  recording.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="privacy"
          id="privacy"
          aria-labelledby="privacy-title"
        >
          <div className="wrap">
            <div className="section-head">
              <h2 id="privacy-title">
                A record,
                <br />
                <em>not a recording.</em>
              </h2>
              <p>
                The session leaves analytics, not footage. Identity embeddings
                are kept to verify a student; the video they came from is not.
              </p>
            </div>

            <div className="ledger">
              <div className="ledger-col">
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
              <div className="ledger-col">
                <h3>Never kept</h3>
                <ul>
                  <li>
                    <MinusIcon />
                    <span>Raw video frames</span>
                  </li>
                  <li>
                    <MinusIcon />
                    <span>Audio</span>
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

            <p className="privacy-close">
              No footage. No audio. No page content. No grades.
            </p>
          </div>
        </section>

        <section className="close" aria-labelledby="close-title">
          <div className="wrap">
            <h2 id="close-title">
              Open a room.
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
              <Link className="btn btn-ghost" to="/signin">
                Join with a link
              </Link>
            </div>
            <p className="close-fine">
              Signals, not surveillance. No video stored. Not a proctoring tool.
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
              <a href="#labels">The labels</a>
              <a href="#settings">Settings</a>
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
