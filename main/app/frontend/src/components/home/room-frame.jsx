import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ROWS,
  SEATS,
  STATES,
  TIMELINE,
  labelFor,
  stateFor,
} from "./session-data.js";

const MOMENTS = [
  { key: "before", label: "Before class" },
  { key: "live", label: "In session" },
  { key: "after", label: "After class" },
];

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

function noteFor(state, isNudged, isRecovered) {
  if (isRecovered) {
    return {
      title: "Back with you",
      body: "The label changes when attention returns, not when the nudge lands.",
    };
  }
  if (isNudged) {
    return {
      title: "Nudge received",
      body: "Take a breath. Come back when you can. This is a message, not a mark.",
    };
  }
  if (state === "attentive") {
    return {
      title: "Present",
      body: "Your teacher sees the state, not your camera feed. Nothing is recorded.",
    };
  }
  if (state === "identity") {
    return {
      title: "Identity check",
      body: "Two checks did not match. Your teacher sees a flag and decides what happens next.",
    };
  }
  if (state === "nodata") {
    return {
      title: "Camera miss",
      body: "No face in frame. This is not a strike, and your teacher sees it as a camera miss.",
    };
  }
  if (state === "disengaged") {
    return {
      title: "Three strikes",
      body: "Your teacher sees the flag. They can mark you engaged, message you, or leave it.",
    };
  }
  if (state === "away") {
    return {
      title: "Away from the room",
      body: "A flag is waiting for your teacher. Nothing happens automatically.",
    };
  }
  return {
    title: "No nudge yet",
    body: "If you drift, a quiet message can arrive here. It is never a mark.",
  };
}

export default function RoomWindow() {
  const [moment, setMoment] = useState("live");
  const [selected, setSelected] = useState("R.K.");
  const [filter, setFilter] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [nudged, setNudged] = useState([]);
  const [recovered, setRecovered] = useState([]);
  const [status, setStatus] = useState("");
  const [exportNote, setExportNote] = useState("");
  const timeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const seatMap = useMemo(
    () => Object.fromEntries(SEATS.map((seat) => [seat.initials, seat])),
    [],
  );

  const selectedSeat = seatMap[selected] ?? SEATS[0];
  const selectedState = overrides[selected] ?? selectedSeat.state;
  const isNudged = nudged.includes(selected);
  const isRecovered = recovered.includes(selected);
  const note = noteFor(selectedState, isNudged, isRecovered);
  const selectedHistory =
    overrides[selected] === "attentive"
      ? [...selectedSeat.history.slice(0, 19), "attentive"]
      : selectedSeat.history;

  const counts = useMemo(() => {
    const next = Object.fromEntries(STATES.map((state) => [state.key, 0]));
    SEATS.forEach((seat) => {
      const key = overrides[seat.initials] ?? seat.state;
      next[key] += 1;
    });
    return next;
  }, [overrides]);

  const sendNudge = () => {
    if (isNudged || selectedState === "attentive") return;
    setNudged((previous) => [...previous, selected]);
    setStatus(`Private nudge sent to ${selected}.`);
    if (selected === "R.K.") {
      timeoutRef.current = window.setTimeout(() => {
        setOverrides((previous) => ({ ...previous, "R.K.": "attentive" }));
        setRecovered((previous) => [...previous, "R.K."]);
        setStatus(
          "R.K. returned to the room. The label followed attention, not the button.",
        );
      }, 2400);
    }
  };

  const markEngaged = () => {
    setOverrides((previous) => ({ ...previous, [selected]: "attentive" }));
    setStatus(`${selected} marked engaged by you.`);
  };

  const handleTabKey = (event, index) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowLeft") {
      next = (index - 1 + MOMENTS.length) % MOMENTS.length;
    }
    if (event.key === "ArrowRight") next = (index + 1) % MOMENTS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = MOMENTS.length - 1;
    setMoment(MOMENTS[next].key);
    document.getElementById(`room-tab-${MOMENTS[next].key}`)?.focus();
  };

  const roomId =
    moment === "live"
      ? { title: "Live · Algebra II", meta: "Period 3 · 20 present · 42:00" }
      : moment === "before"
        ? { title: "Room open", meta: "0 present · nothing measured yet" }
        : { title: "Session ended", meta: "42:00 · 20 learners" };

  return (
    <div className="room-window" id="room">
      <div className="room-head">
        <div className="room-id">
          <i
            className={`live-dot ${moment === "live" ? "is-live" : "is-quiet"}`}
            aria-hidden="true"
          />
          <p className="room-title">{roomId.title}</p>
          <p className="room-meta">{roomId.meta}</p>
        </div>
        <div className="room-tabs" role="tablist" aria-label="Session moment">
          {MOMENTS.map((item, index) => (
            <button
              key={item.key}
              id={`room-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={moment === item.key}
              aria-controls="room-panel"
              tabIndex={moment === item.key ? 0 : -1}
              className="room-tab"
              onClick={() => setMoment(item.key)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="room-panel"
        key={moment}
        role="tabpanel"
        aria-labelledby={`room-tab-${moment}`}
        className="room-panel"
      >
        {moment === "before" && <BeforePanel />}
        {moment === "live" && (
          <div className="room-body">
            <h2 className="sr-only">Live room</h2>
            <div className="room-stage">
              <div className="room-arch">
                <div className="room-board">
                  <span className="board-label">Front</span>
                  <p>Quadratic forms</p>
                  <span className="board-live">
                    <i aria-hidden="true" />
                    Live
                  </span>
                </div>

                <div className="teacher-desk">
                  <i aria-hidden="true" />
                  You
                </div>

                <div className="desk-rows">
                  {ROWS.map((row) => (
                    <div className="desk-row" key={row.number}>
                      {row.seats.map((initials) => {
                        const seat = seatMap[initials];
                        const state = overrides[initials] ?? seat.state;
                        const isSelected = selected === initials;
                        return (
                          <button
                            key={initials}
                            type="button"
                            className={`desk desk-${state} ${
                              isSelected ? "is-selected" : ""
                            } ${
                              filter && filter !== state && !isSelected
                                ? "is-dimmed"
                                : ""
                            }`}
                            aria-pressed={isSelected}
                            aria-label={`${initials}, ${labelFor(state)}, row ${seat.row}`}
                            onClick={() => setSelected(initials)}
                          >
                            <span>{initials}</span>
                            <i
                              className={`desk-dot dot-${state}`}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="room-legend">
                <div className="legend-head">
                  <p className="micro">Six labels · one at a time</p>
                  <p className="legend-hint" aria-live="polite">
                    {filter
                      ? `${labelFor(filter)} · ${stateFor(filter).rule}`
                      : "Select a label to find it in the room."}
                  </p>
                </div>
                <div className="legend-grid" role="group" aria-label="Filter by state">
                  {STATES.map((state) => (
                    <button
                      key={state.key}
                      type="button"
                      className="legend-btn"
                      aria-pressed={filter === state.key}
                      onClick={() =>
                        setFilter((previous) =>
                          previous === state.key ? null : state.key,
                        )
                      }
                    >
                      <span className="legend-name">
                        <i
                          className={`state-dot dot-${state.key}`}
                          aria-hidden="true"
                        />
                        {state.label}
                      </span>
                      <span className="legend-count">{counts[state.key]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <aside className="room-inspector" aria-label="Selected student">
              <div className="inspector-top">
                <p className="micro">Selected</p>
                <p className="micro">Row {selectedSeat.row}</p>
              </div>

              <div className="inspector-name-row">
                <h3 className="inspector-name">{selectedSeat.initials}</h3>
                <span className="inspector-id">Illustrative</span>
              </div>

              <p className={`inspector-state state-${selectedState}`}>
                <i
                  className={`state-dot dot-${selectedState}`}
                  aria-hidden="true"
                />
                {labelFor(selectedState)}
              </p>
              <p className="inspector-meta">
                {isRecovered ? "Back after 2 min" : stateFor(selectedState).meta}
              </p>

              <div className="history">
                <div className="history-head">
                  <span>Last 4 minutes</span>
                  <span>every 12s</span>
                </div>
                <div
                  className="history-bar"
                  role="img"
                  aria-label={`${selectedSeat.initials}'s last 4 minutes: ${selectedHistory
                    .filter((value, index) => value !== selectedHistory[index - 1])
                    .map((value) => labelFor(value))
                    .join(", then ")}.`}
                >
                  {selectedHistory.map((state, index) => (
                    <span
                      key={index}
                      className={`history-cell cell-${state}`}
                    />
                  ))}
                </div>
              </div>

              <div className={`student-note ${isNudged ? "is-nudged" : ""}`}>
                <p className="note-label">What {selectedSeat.initials} sees</p>
                <b>{note.title}</b>
                <p>{note.body}</p>
              </div>

              <div className="inspector-actions">
                {selectedState === "attentive" ? (
                  <p className="inspector-quiet">
                    No action needed. The label follows attention.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-ink"
                      onClick={sendNudge}
                      disabled={isNudged}
                    >
                      {isNudged ? "Nudge sent" : "Send a private nudge"}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={markEngaged}
                    >
                      Mark engaged
                    </button>
                  </>
                )}
              </div>

              <p className="inspector-fine">
                A nudge is a private message, not a mark. Camera frames are never
                stored.
              </p>
            </aside>
          </div>
        )}

        {moment === "after" && (
          <AfterPanel
            nudged={nudged.includes("R.K.")}
            recovered={recovered.includes("R.K.")}
            exportNote={exportNote}
            setExportNote={setExportNote}
          />
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function BeforePanel() {
  return (
    <div className="room-body">
      <h2 className="sr-only">Before class</h2>
      <div className="room-stage">
        <div className="room-arch is-empty">
          <div className="room-board is-quiet">
            <span className="board-label">Room open</span>
            <p>No one has joined yet.</p>
          </div>

          <div className="teacher-desk">
            <i aria-hidden="true" />
            You
          </div>

          <div className="desk-rows is-empty" aria-hidden="true">
            {[4, 5, 6, 5].map((count, rowIndex) => (
              <div className="desk-row" key={rowIndex}>
                {Array.from({ length: count }, (_, index) => (
                  <span className="desk desk-empty" key={index} />
                ))}
              </div>
            ))}
          </div>

          <p className="room-caption">
            Nothing is measured until a student walks in. No session record
            exists before the first join.
          </p>
        </div>
      </div>

      <aside className="room-inspector is-before" aria-label="Before class">
        <div className="inspector-top">
          <p className="micro">Before class</p>
          <p className="micro">Your check</p>
        </div>
        <h3 className="inspector-title">Ready when you are.</h3>
        <p className="inspector-lede">
          The check runs before the room opens. It is not a test, and it is not
          stored as video.
        </p>
        <ul className="check-list">
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
        <div className="inspector-actions">
          <Link className="btn btn-ink" to="/signup">
            Start a class
            <ArrowIcon />
          </Link>
          <Link className="text-btn" to="/signin">
            Join with a link
          </Link>
        </div>
        <p className="inspector-fine">
          No frames are stored. Identity embeddings are kept only to verify you.
        </p>
      </aside>
    </div>
  );
}

function AfterPanel({ nudged, recovered, exportNote, setExportNote }) {
  return (
    <div className="room-body is-record">
      <h2 className="sr-only">Session record</h2>
      <div className="record">
        <div className="record-lead">
          <p className="micro">Session record</p>
          <p className="tpi-label">
            TPI <span>· Teacher Performance Index</span>
          </p>
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
                <span key={index} className={`cell-${state}`} />
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

          <div className="followups">
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

        <div className="archive">
          <div>
            <p className="micro">Past sessions</p>
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
    </div>
  );
}
