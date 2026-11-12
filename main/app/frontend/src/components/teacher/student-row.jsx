import NudgeButton from "../nudge-button.jsx";
import { StateBadge } from "../app/state.jsx";
import {
  CheckIcon,
  CloseIcon,
  EyeOffIcon,
  MessageIcon,
  ShieldIcon,
} from "../app/icons.jsx";

function initials(value) {
  if (!value) return "ST";
  const clean = String(value).replace(/[_.-]/g, " ");
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function StudentRow({
  student,
  sessionId,
  statusLabel,
  kind,
  isSimulated,
  isFlagged,
  signals,
  livenessLoading,
  actionNote,
  onMarkEngaged,
  onMessage,
  onIgnore,
  onRemove,
  onVerify,
  onNudgeError,
}) {
  const lastSeen = student?.timestamp
    ? new Date(student.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "No signal yet";
  const scorePercent = Math.round((student?.score || 0) * 100);
  const visibleSignals = signals.filter(
    (signal) =>
      !["Stable", "Focus dip"].includes(signal.label) &&
      signal.label.toLowerCase() !== String(statusLabel).toLowerCase(),
  );
  return (
    <li className={`room-row ${isFlagged ? "is-priority" : ""}`.trim()}>
      <div className="room-row-top">
        <span className="room-avatar" aria-hidden="true">
          {initials(student?.userId)}
        </span>
        <span className="room-name" title={student?.userId}>
          {student?.userId || "Unnamed student"}
        </span>
        <span className="room-score num">{scorePercent}%</span>
        <StateBadge kind={kind}>{statusLabel}</StateBadge>
      </div>

      <div className="room-row-meta">
        {isSimulated && (
          <>
            <span>Simulated (demo)</span>
            <span className="room-sep" aria-hidden="true" />
          </>
        )}
        <span>Updated {lastSeen}</span>
      </div>

      {visibleSignals.length > 0 && (
        <div className="room-signals">
          {visibleSignals.map((signal) => (
            <span
              key={signal.label}
              className={`badge ${signal.tone === "alert" ? "badge-flag" : signal.tone === "warn" ? "badge-distracted" : ""}`.trim()}
            >
              {signal.label}
            </span>
          ))}
        </div>
      )}

      <div className="room-row-actions" role="group" aria-label={`Actions for ${student?.userId || "student"}`}>
        <NudgeButton
          userId={student.userId}
          sessionId={sessionId}
          variant="teacherIcon"
          iconOnly
          title={`Nudge ${student?.userId || "student"}`}
          disabled={isSimulated}
          onError={onNudgeError}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => onMarkEngaged(student.userId)}
          title="Mark engaged"
          aria-label={`Mark ${student?.userId || "student"} engaged`}
        >
          <CheckIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onMessage(student.userId)}
          disabled={isSimulated}
          title="Send a message"
          aria-label={`Send a message to ${student?.userId || "student"}`}
        >
          <MessageIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onVerify(student.userId)}
          disabled={isSimulated || livenessLoading}
          title="Ask for a liveness check"
          aria-label={`Ask ${student?.userId || "student"} for a liveness check`}
        >
          <ShieldIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onIgnore(student.userId)}
          title="Ignore this concern"
          aria-label={`Ignore the concern for ${student?.userId || "student"}`}
        >
          <EyeOffIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onRemove(student.userId)}
          title="Remove from the room"
          aria-label={`Remove ${student?.userId || "student"} from the room`}
        >
          <CloseIcon />
        </button>
      </div>

      {actionNote && (
        <p className="room-row-note" role="status">
          {actionNote}
        </p>
      )}
    </li>
  );
}
