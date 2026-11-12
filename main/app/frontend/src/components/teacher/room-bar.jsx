import ChronosMark from "../chronos-mark.jsx";
import { LeaveIcon, ShieldIcon } from "../app/icons.jsx";

function ClassIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="5.5" width="15" height="13.5" rx="2.5" />
      <path d="M4.5 9h15M8 4.5v3M16 4.5v3" />
    </svg>
  );
}

function StrictIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="3" />
      <path d="M9 9.5l3-3 3 3M12 6.5v11" />
    </svg>
  );
}

function SimIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 12a7.25 7.25 0 1 1 2.1 5.1" />
      <path d="M4.75 17.5v-3.2h3.2" />
      <rect x="9.75" y="9.75" width="4.5" height="4.5" />
    </svg>
  );
}

export default function RoomBar({
  sessionId,
  connected,
  classContextMode,
  onToggleClassContext,
  strictMode,
  onToggleStrictMode,
  simulateClassroom,
  onToggleSimulate,
  livenessLoading,
  onCheckEngagement,
  onOpenAssessment,
  onEndSession,
}) {
  return (
    <header className="room-bar">
      <div className="room-bar-inner">
        <span className="room-brand">
          <span aria-hidden="true">
            <ChronosMark size={20} variant="gold" />
          </span>
          <span>Chronos</span>
        </span>

        <div className="room-session" title={sessionId}>
          <b>{sessionId}</b>
          <span className="room-sep" aria-hidden="true" />
          <span className="room-session-label">Teacher room</span>
        </div>

        <span
          className={`room-connection ${connected ? "" : "is-offline"}`.trim()}
          title="Live connection to the classroom signal stream"
        >
          <i aria-hidden="true" />
          {connected ? "Live" : "Offline"}
        </span>

        <div className="room-bar-actions">
          <div className="seg" role="group" aria-label="Session settings">
            <button
              type="button"
              onClick={onToggleClassContext}
              aria-pressed={classContextMode === "exam"}
              title="Class is lenient; exam applies the stricter gaze rule"
            >
              <ClassIcon />
              {classContextMode === "class" ? "Class" : "Exam"}
            </button>
            <button
              type="button"
              onClick={onToggleStrictMode}
              aria-pressed={strictMode}
              title="Strict notices when the tab loses focus; students are told before class"
            >
              <StrictIcon />
              {strictMode ? "Strict tab" : "Normal tab"}
            </button>
            <button
              type="button"
              onClick={onToggleSimulate}
              aria-pressed={simulateClassroom}
              title="Add a simulated cohort to try the room without students"
            >
              <SimIcon />
              {simulateClassroom ? "Sim on" : "Simulate"}
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={onOpenAssessment}
            title="Question paper, resources, and submissions"
          >
            Assessment
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onCheckEngagement()}
            disabled={livenessLoading}
            title="Ask every student for a liveness check"
          >
            <ShieldIcon />
            {livenessLoading ? "Sending" : "Check engagement"}
          </button>

          <button
            type="button"
            className="btn btn-cream"
            onClick={onEndSession}
            title="End the session and open the record"
          >
            <LeaveIcon />
            End session
          </button>
        </div>
      </div>
    </header>
  );
}
