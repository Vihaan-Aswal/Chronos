import React from "react";
import ChronosMark from "../chronos-mark.jsx";

export default function StudentTopbar({
  wsConnected,
  sessionId,
  userName,
  railOpen,
  onToggleRail,
  onLeave,
  onOpenPrivacy,
  railId = "student-signals",
}) {
  const isDemo =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem("chronos_is_demo") === "true";

  return (
    <header className="room-bar">
      <div className="room-bar-inner">
        <span className="room-brand">
          <span aria-hidden="true">
            <ChronosMark size={20} variant="gold" />
          </span>
          <span>Chronos</span>
        </span>

        <div className="room-session" title={`${sessionId} · ${userName}`}>
          <b>{sessionId}</b>
          <span className="room-sep" aria-hidden="true" />
          <span className="room-session-label">Student room</span>
        </div>

        <span
          className={`room-connection ${wsConnected ? "" : "is-offline"}`.trim()}
          title="Connection to the classroom signal stream"
        >
          <i aria-hidden="true" />
          {wsConnected ? "Live" : "Offline"}
        </span>

        <div className="room-bar-actions">
          {isDemo && (
            <span className="room-demo-chip" title="Session running in accelerated demo timing">
              Accelerated demo
            </span>
          )}
          {onOpenPrivacy && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onOpenPrivacy}
              title="Privacy, consent, and technical context"
            >
              Privacy
            </button>
          )}
          {onToggleRail && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onToggleRail}
              aria-expanded={railOpen}
              aria-controls={railId}
            >
              {railOpen ? "Hide signals" : "Your signals"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-cream"
            onClick={onLeave}
            title="Leave the room and return home"
          >
            Leave
          </button>
        </div>
      </div>
    </header>
  );
}
