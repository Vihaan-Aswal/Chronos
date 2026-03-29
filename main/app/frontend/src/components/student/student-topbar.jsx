import ChronosMark from "../chronos-mark.jsx";

export default function StudentTopbar({ wsConnected, sessionId, userName }) {
  return (
    <header className="sd-topbar" aria-label="Student meeting header">
      <div className="sd-brand-group">
        <div className="sd-brand-mark" aria-hidden="true">
          <ChronosMark size={20} variant="gold" />
        </div>
        <div className="sd-brand-copy">
          <span className="sd-brand-name">Chronos</span>
          <span className="sd-brand-meta" title={`${sessionId} ${userName}`}>
            Student Meeting
            <span className="sd-brand-sep">.</span>
            {userName}
            <span className="sd-brand-sep">.</span>
            {sessionId}
          </span>
        </div>
      </div>

      <div className="sd-topbar-right">
        <span className={`sd-ws-badge ${wsConnected ? "" : "disconnected"}`}>
          <span className="sd-ws-dot" aria-hidden="true" />
          {wsConnected ? "Connected" : "Offline"}
        </span>
      </div>
    </header>
  );
}
