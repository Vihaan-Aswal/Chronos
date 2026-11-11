import { Link, useNavigate } from "react-router-dom";
import AppHeader from "../components/app/app-header.jsx";
import AppFooter from "../components/app/app-footer.jsx";
import { CheckIcon } from "../components/app/icons.jsx";
import "../styles/app-system.css";
import "../styles/choose.css";

const ROLES = [
  {
    key: "teacher",
    title: "Teach a class",
    summary:
      "Host a live class, read the room, and keep the record. The signal points; you decide what follows.",
    facts: [
      "One state at a time, six labels, no blended score.",
      "A private nudge reaches the student before you act.",
      "A session record you can save or export.",
    ],
    action: "Continue as teacher",
  },
  {
    key: "student",
    title: "Join a class",
    summary:
      "Join with your class account and see your own signals. Nothing here becomes a grade.",
    facts: [
      "Only your own state is shown to you.",
      "A nudge is a quiet message, not a mark.",
      "No video, audio, or page content is stored.",
    ],
    action: "Continue as student",
  },
];

export default function ChooseRolePage() {
  const navigate = useNavigate();

  let user = null;
  try {
    const raw = sessionStorage.getItem("chronos_user");
    if (raw) user = JSON.parse(raw);
  } catch {
    user = null;
  }

  function selectRole(role) {
    sessionStorage.setItem("chronos_role", role);
    navigate("/readiness", { replace: true });
  }

  return (
    <div className="app page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader
        user={user}
        links={[{ label: "Home", to: "/" }]}
      />

      <main className="page-main" id="main">
        <div className="wrap choose">
          <header className="choose-head">
            <h1>
              How will you use
              <br />
              <em>Chronos?</em>
            </h1>
            <p>
              Teachers host and read the room. Students join and see their own
              signals. You can choose the other way next time.
            </p>
          </header>

          <div className="choose-grid">
            {ROLES.map((role) => (
              <section
                key={role.key}
                className="choose-col"
                aria-labelledby={`role-${role.key}`}
              >
                <h2 id={`role-${role.key}`}>{role.title}</h2>
                <p>{role.summary}</p>
                <ul className="choose-facts">
                  {role.facts.map((fact) => (
                    <li key={fact} className="choose-fact">
                      <CheckIcon />
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-ink btn-lg btn-block"
                  onClick={() => selectRole(role.key)}
                >
                  {role.action}
                </button>
              </section>
            ))}
          </div>

          <p className="choose-foot">
            <span>
              A face embedding verifies you before class. The video is not kept.
            </span>
            <Link to="/">Back to the homepage</Link>
          </p>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
