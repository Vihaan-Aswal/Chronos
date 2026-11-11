import { useState } from "react";
import { Link } from "react-router-dom";
import { SEATS, STATES, TIMELINE } from "./session-data.js";

const MODES = [
  { key: "before", label: "Before class" },
  { key: "live", label: "In session" },
  { key: "after", label: "After class" },
];

const VISIBLE = new Set([
  "A.B.",
  "A.M.",
  "D.S.",
  "H.K.",
  "I.N.",
  "J.P.",
  "K.R.",
  "R.K.",
  "S.N.",
  "U.G.",
  "Z.A.",
  "A.C.",
]);

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

function labelFor(key) {
  return STATES.find((state) => state.key === key)?.label ?? key;
}

export default function RoomFrame({ mode, setMode }) {
  const [nudged, setNudged] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [exportNote, setExportNote] = useState("");

  // R.K. returns a beat after the nudge; the label follows behaviour, not the button.
  const sendNudge = () => {
    setNudged(true);
    window.setTimeout(() => setRecovered(true), 2400);
  };

  const handleTabKey = (event, index) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + MODES.length) % MODES.length;
    if (event.key === "ArrowRight") next = (index + 1) % MODES.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = MODES.length - 1;
    setMode(MODES[next].key);
    document.getElementById(`room-tab-${MODES[next].key}`)?.focus();
  };

  return (
    <div className="room-frame" id="room">
      <div className="room-bar">
        <div className="room-tabs" role="tablist" aria-label="Session moment">
          {MODES.map((item, index) => (
            <button
              key={item.key}
              id={`room-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={mode === item.key}
              aria-controls="room-panel"
              tabIndex={mode === item.key ? 0 : -1}
              className="room-tab"
              onClick={() => setMode(item.key)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="room-bar-note">Illustrative room · sample data</p>
      </div>

      <div className="room-arch">
        <div
          id="room-panel"
          key={mode}
          role="tabpanel"
          aria-labelledby={`room-tab-${mode}`}
          className="room-panel"
        >
          {mode === "before" && <BeforePanel />}
          {mode === "live" && (
            <LivePanel
              nudged={nudged}
              recovered={recovered}
              onNudge={sendNudge}
            />
          )}
          {mode === "after" && (
            <AfterPanel
              nudged={nudged}
              recovered={recovered}
              exportNote={exportNote}
              setExportNote={setExportNote}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BeforePanel() {
  return (
    <div className="panel panel-before">
      <div className="panel-head">
        <span className="panel-status">
          <i className="status-dot status-dot-quiet" aria-hidden="true" />
          Room ready
        </span>
        <span className="panel-meta">0 present</span>
      </div>

      <div className="before-layout">
        <div className="before-room">
          <h2>No one has joined yet.</h2>
          <p className="before-copy">
            The room is open. Nothing is measured until a student walks in.
          </p>
          <div className="before-actions">
            <Link className="btn btn-ink" to="/signup">
              Start a class
              <ArrowIcon />
            </Link>
            <Link className="btn btn-line" to="/signin">
              Join with a link
            </Link>
          </div>
          <p className="before-fine">
            No session record before the first student joins.
          </p>
          <div className="empty-seats" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="empty-seat" />
            ))}
          </div>
        </div>

        <aside
          className="student-arch readiness-arch"
          aria-label="Your readiness check"
        >
          <div className="student-top">
            <span>Your check</span>
            <span>Before class</span>
          </div>
          <div className="student-state">
            <i className="state-dot dot-attentive" aria-hidden="true" />
            <span>Ready to join</span>
          </div>
          <ul className="readiness-list">
            <li>
              <CheckIcon />
              <span>Face detected</span>
            </li>
            <li>
              <CheckIcon />
              <span>Centred in frame</span>
            </li>
            <li>
              <CheckIcon />
              <span>Lighting good</span>
            </li>
            <li>
              <CheckIcon />
              <span>Identity verified</span>
            </li>
            <li>
              <CheckIcon />
              <span>Consent given</span>
            </li>
          </ul>
          <p className="student-fine">
            Checks happen before the room opens. No frames are stored.
          </p>
        </aside>
      </div>
    </div>
  );
}

function LivePanel({ nudged, recovered, onNudge }) {
  const visibleSeats = SEATS.filter((seat) => VISIBLE.has(seat.initials));
  const hiddenCount = SEATS.length - visibleSeats.length;

  return (
    <div className="panel panel-live">
      <h2 className="sr-only">Live room</h2>
      <div className="panel-head">
        <span className="panel-status">
          <i className="status-dot" aria-hidden="true" />
          Live room
        </span>
        <span className="panel-meta">
          <b>20</b> in the room · updates every 3s
        </span>
      </div>

      <div className="live-layout">
        <div className="live-main">
          <div
            className="seat-grid"
            role="group"
            aria-label="Students in the room"
          >
            {visibleSeats.map((seat) => {
              const state =
                seat.initials === "R.K." && recovered
                  ? "attentive"
                  : seat.state;
              const target = seat.initials === "R.K.";
              return (
                <div
                  key={seat.initials}
                  role="img"
                  aria-label={`${seat.initials}, ${labelFor(state)}${
                    target && !recovered ? ", needs a nudge" : ""
                  }`}
                  className={`seat seat-${state} ${
                    target ? "is-target" : ""
                  } ${target && nudged ? "is-nudged" : ""}`}
                >
                  <span>{seat.initials}</span>
                  <i
                    className={`seat-dot dot-${state}`}
                    aria-hidden="true"
                  />
                </div>
              );
            })}
            <div
              className="seat seat-more"
              role="img"
              aria-label={`${hiddenCount} more students in the room`}
            >
              <span>+{hiddenCount}</span>
              <small>more</small>
            </div>
          </div>

          <div className="live-foot">
            <div>
              <p className="foot-label">
                {recovered ? "Nudged" : "Needs a nudge"}
              </p>
              <p className="foot-name">
                {recovered
                  ? "R.K. · back after 2 min"
                  : "R.K. · Distracted for 4 min"}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ink btn-small"
              onClick={onNudge}
              disabled={nudged}
            >
              {nudged ? "Nudge sent" : "Send a private nudge"}
            </button>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {nudged
              ? recovered
                ? "R.K. returned to the room."
                : "A private nudge was sent to R.K."
              : ""}
          </p>
        </div>

        <aside
          className={`student-arch ${nudged ? "is-nudged" : ""}`}
          aria-label="The student's own view"
        >
          <div className="student-top">
            <span>Your view</span>
            <span>R.K.</span>
          </div>
          <div className="student-state">
            <i
              className={`state-dot dot-${recovered ? "attentive" : "distracted"}`}
              aria-hidden="true"
            />
            <span>{recovered ? "Attentive" : "Distracted"}</span>
          </div>
          <p className="student-copy">
            A nudge is a private message. It is not a mark.
          </p>
          <div className="student-note">
            {recovered ? (
              <>
                <b>Back with you</b>
                <p>
                  The label changes when you look back, not when the nudge
                  lands.
                </p>
              </>
            ) : nudged ? (
              <>
                <b>Nudge received</b>
                <p>Take a breath. Come back when you can.</p>
              </>
            ) : (
              <>
                <b>No nudge yet</b>
                <p>If you drift, a quiet message can arrive here.</p>
              </>
            )}
          </div>
          <p className="student-fine">
            Your teacher sees your state. Your camera feed is not stored.
          </p>
        </aside>
      </div>
    </div>
  );
}

function AfterPanel({ nudged, recovered, exportNote, setExportNote }) {
  return (
    <div className="panel panel-after">
      <h2 className="sr-only">Session record</h2>
      <div className="panel-head">
        <span className="panel-status">
          <i className="status-dot status-dot-quiet" aria-hidden="true" />
          Session ended
        </span>
        <span className="panel-meta">42:00 · 20 learners</span>
      </div>

      <div className="record-top">
        <div className="record-head">
          <p className="record-label">Teacher Performance Index</p>
          <p className="tpi">
            75<span>/100</span>
          </p>
          <p className="record-formula">
            60% mean engagement + 40% attention retention. Computed after class,
            rounded to an integer.
          </p>
          <p className="record-note">
            A session index for the teacher, not a grade for the student.
          </p>
          <div className="record-stats">
            <div>
              <span>Mean engagement</span>
              <b>0.71</b>
            </div>
            <div>
              <span>Attention retention</span>
              <b>0.80</b>
            </div>
          </div>
        </div>

        <div className="record-main">
          <div className="timeline">
            <div className="timeline-head">
              <span>Attention timeline</span>
              <span>42 min</span>
            </div>
            <div
              className="timeline-bar"
              role="img"
              aria-label="Class attention over 42 minutes: mostly attentive, with distracted periods, two NO_DATA gaps, and one away period."
            >
              {TIMELINE.map((state, index) => (
                <span
                  key={index}
                  className={`timeline-cell cell-${state}`}
                />
              ))}
            </div>
            <div className="timeline-ticks">
              <span>Start</span>
              <span>End</span>
            </div>
            <div className="timeline-legend">
              <span>
                <i className="state-dot dot-attentive" aria-hidden="true" />
                Attentive
              </span>
              <span>
                <i className="state-dot dot-distracted" aria-hidden="true" />
                Distracted
              </span>
              <span>
                <i className="state-dot dot-away" aria-hidden="true" />
                Away
              </span>
              <span>
                <i className="state-dot dot-nodata" aria-hidden="true" />
                NO_DATA
              </span>
            </div>
          </div>

          <div className="followup">
            <h3>Needs a follow-up</h3>
            <ul>
              <li>
                <span className="followup-name">
                  <i className="state-dot dot-distracted" aria-hidden="true" />
                  R.K.
                </span>
                <p>
                  Distracted for 9 min
                  {nudged ? " · nudged at 14:08" : ""}
                  {recovered ? " · returned" : ""}
                </p>
              </li>
              <li>
                <span className="followup-name">
                  <i className="state-dot dot-identity" aria-hidden="true" />
                  A.C.
                </span>
                <p>Identity check unresolved</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="archive">
        <div>
          <p className="archive-label">Past sessions</p>
          <p className="archive-empty">No past sessions</p>
        </div>
        <p className="archive-copy">
          This is the first record. Earlier sessions will collect here.
        </p>
        <div className="archive-action">
          <button
            type="button"
            className="btn btn-line btn-small"
            onClick={() =>
              setExportNote(
                "Export opens inside a hosted session. This preview does not download.",
              )
            }
          >
            Export PDF
          </button>
          {exportNote && (
            <p className="archive-note" role="status">
              {exportNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
