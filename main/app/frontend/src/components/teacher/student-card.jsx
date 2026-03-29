import NudgeButton from "../nudge-button.jsx";
import { ActionIconButton } from "./teacher-buttons.jsx";

function initials(value) {
  if (!value) return "ST";
  const clean = String(value).replace(/[_.-]/g, " ");
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7.5C5 6.4 5.9 5.5 7 5.5H17C18.1 5.5 19 6.4 19 7.5V13.5C19 14.6 18.1 15.5 17 15.5H11L7 18.5V15.5C5.9 15.5 5 14.6 5 13.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 12.5L10 16L18 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VerifyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.75L18 6.75V12C18 15.47 15.87 18.66 12.63 19.82L12 20.05L11.37 19.82C8.13 18.66 6 15.47 6 12V6.75L12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M9.5 11.9L11.2 13.6L14.7 10.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IgnoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.75 12C6.62 8.83 9.1 7.25 12 7.25C14.9 7.25 17.38 8.83 19.25 12C17.38 15.17 14.9 16.75 12 16.75C9.1 16.75 6.62 15.17 4.75 12Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 5.5L18.5 18.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 8L16 16M16 8L8 16"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function mapStatusClass(statusKey) {
  if (statusKey === "identity") return "identity";
  if (statusKey === "risk") return "risk";
  if (statusKey === "away") return "away";
  if (statusKey === "disengaged") return "disengaged";
  if (statusKey === "distracted") return "distracted";
  return "attentive";
}

export default function StudentCard({
  student,
  statusLabel,
  statusKey,
  priority,
  isSimulated,
  isFlagged,
  livenessLoading,
  signals,
  onMarkEngaged,
  onMessage,
  onIgnore,
  onRemove,
  onVerify,
  sessionId,
}) {
  const mappedStatus = mapStatusClass(statusKey);
  const lastSeen = student?.timestamp
    ? new Date(student.timestamp).toLocaleTimeString()
    : "--";
  const scorePercent = ((student?.score || 0) * 100).toFixed(0);

  return (
    <article className="td-student-card" data-priority={priority}>
      <div className="td-sc-top">
        <div className="td-sc-identity">
          <div className="td-sc-avatar">{initials(student?.userId)}</div>
          <span className="td-sc-name" title={student?.userId}>
            {isSimulated
              ? student?.userId
              : `${String(student?.userId || "").slice(0, 14)}${String(student?.userId || "").length > 14 ? "..." : ""}`}
          </span>
        </div>

        <span className="td-sc-score">{scorePercent}%</span>
        <span className={`td-sc-badge ${mappedStatus}`}>{statusLabel}</span>
      </div>

      <div className="td-card-foot">
        <span className={`td-score-large ${mappedStatus}`}>
          {scorePercent}%
        </span>
        <span className="td-last-seen">Last: {lastSeen}</span>
      </div>

      <div className="td-signals">
        {signals.map((sig) => (
          <span key={sig.label} className={`td-pill ${sig.tone}`}>
            {sig.label}
          </span>
        ))}
        {isSimulated && <span className="td-pill violet">Simulated</span>}
        {isFlagged && !signals.length && (
          <span className="td-pill warn">Priority</span>
        )}
      </div>

      <div className="td-actions">
        <NudgeButton
          userId={student.userId}
          sessionId={sessionId}
          variant="teacherIcon"
          iconOnly
          className="td-btn td-btn-icon td-btn-nudge"
          title="Nudge"
          disabled={isSimulated}
        />

        <ActionIconButton
          variant="engaged"
          onClick={() => onMarkEngaged(student.userId)}
          title="Mark engaged"
        >
          <CheckIcon />
        </ActionIconButton>

        <ActionIconButton
          variant="message"
          onClick={() => onMessage(student.userId)}
          disabled={isSimulated}
          title="Message"
        >
          <MessageIcon />
        </ActionIconButton>

        <ActionIconButton
          variant="ignore"
          onClick={() => onIgnore(student.userId)}
          title="Ignore"
        >
          <IgnoreIcon />
        </ActionIconButton>

        <ActionIconButton
          variant="remove"
          onClick={() => onRemove(student.userId)}
          title="Remove"
        >
          <RemoveIcon />
        </ActionIconButton>

        <ActionIconButton
          variant="verify"
          onClick={() => onVerify(student.userId)}
          disabled={isSimulated || livenessLoading}
          title="Verify"
        >
          <VerifyIcon />
        </ActionIconButton>
      </div>
    </article>
  );
}
