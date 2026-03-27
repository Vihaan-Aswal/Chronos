import { useEffect, useState } from "react";

function formatElapsed(startTimestamp) {
  if (!startTimestamp) return "00:00:00";

  const elapsed = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");

  return `${h}:${m}:${s}`;
}

export default function StatusStrip({
  sessionId,
  sessionStartRef,
  presentCount,
  attentiveCount,
  distractedCount,
  criticalCount,
  railOpen = false,
  onToggleRail,
  railId = "teacher-live-dashboard-rail",
  toggleButtonRef,
}) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    const update = () => {
      setElapsed(formatElapsed(sessionStartRef?.current?.getTime?.() || null));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sessionStartRef]);

  return (
    <section className="td-status-bar" aria-label="Session status strip">
      <div className="td-status-left">
        <span className="td-session-id">{sessionId}</span>
        <span className="td-sep-line" />
        <span className="td-timer">{elapsed}</span>
        <span className="td-sep-line" />

        <div className="td-kpi-inline">
          <div className="td-kpi-chip gold">
            <span className="kpi-n">{presentCount}</span>
            <span className="kpi-lbl">Present</span>
          </div>

          <div className="td-kpi-chip green">
            <span className="kpi-n">{attentiveCount}</span>
            <span className="kpi-lbl">Attentive</span>
          </div>

          <div className="td-kpi-chip warn">
            <span className="kpi-n">{distractedCount}</span>
            <span className="kpi-lbl">Distracted</span>
          </div>

          <div className="td-kpi-chip danger">
            <span className="kpi-n">{criticalCount}</span>
            <span className="kpi-lbl">Critical</span>
          </div>
        </div>
      </div>

      <div className="td-status-right">
        <div className="td-status-legend" aria-label="Student state legend">
          <span className="td-status-legend-item">
            <span className="td-legend-dot green" />
            Attentive
          </span>
          <span className="td-status-legend-item">
            <span className="td-legend-dot warn" />
            Distracted
          </span>
          <span className="td-status-legend-item">
            <span className="td-legend-dot red" />
            Away
          </span>
          <span className="td-status-legend-item">
            <span className="td-legend-dot violet" />
            Flagged
          </span>
        </div>

        <button
          ref={toggleButtonRef}
          type="button"
          className="td-radar-btn td-status-radar-btn"
          onClick={onToggleRail}
          title="Toggle live dashboard"
          aria-expanded={railOpen}
          aria-controls={railId}
        >
          <span className="td-radar-dot" />
          {railOpen ? "Hide dashboard" : "Live dashboard"}
        </button>
      </div>
    </section>
  );
}
