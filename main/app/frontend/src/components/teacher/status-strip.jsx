import { useEffect, useState } from "react";
import { UsersIcon } from "../app/icons.jsx";

function formatElapsed(startTimestamp) {
  if (!startTimestamp) return "00:00:00";
  const elapsed = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function StatusStrip({
  sessionStartRef,
  presentCount,
  attentiveCount,
  distractedCount,
  flaggedCount,
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
    <section className="room-kpis" aria-label="Session status">
      <div className="room-kpi">
        <b className="num" aria-hidden="true">
          {elapsed}
        </b>
        <span>Elapsed</span>
      </div>
      <div className="room-kpi">
        <b>{presentCount}</b>
        <span>Present</span>
      </div>
      <div className="room-kpi">
        <b>{attentiveCount}</b>
        <span>Attentive</span>
      </div>
      <div className="room-kpi">
        <b>{distractedCount}</b>
        <span>Distracted</span>
      </div>
      <div className={`room-kpi ${flaggedCount > 0 ? "is-critical" : ""}`.trim()}>
        <b>{flaggedCount}</b>
        <span>Flagged</span>
      </div>

      <div className="room-legend" aria-hidden="true">
        <span>
          <i className="dot dot-attentive" /> Attentive
        </span>
        <span>
          <i className="dot dot-distracted" /> Distracted
        </span>
        <span>
          <i className="dot dot-away" /> Away
        </span>
        <span>
          <i className="dot dot-disengaged" /> Flagged
        </span>
      </div>

      <button
        ref={toggleButtonRef}
        type="button"
        className="room-toggle"
        onClick={onToggleRail}
        aria-expanded={railOpen}
        aria-controls={railId}
      >
        <UsersIcon />
        {railOpen ? "Hide students" : "Students"}
      </button>
    </section>
  );
}
