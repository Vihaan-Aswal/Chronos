import ChronosMark from "../chronos-mark.jsx";

function ClassIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4.5"
        y="5.25"
        width="15"
        height="14.25"
        rx="3.25"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4 7.75H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M7.5 4.5V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16.5 4.5V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StrictIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4.5"
        y="3.5"
        width="15"
        height="17"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 9.5L12 5.5L16 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 5.5V18.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SimIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.75 12C4.75 7.99 7.99 4.75 12 4.75C16.01 4.75 19.25 7.99 19.25 12C19.25 16.01 16.01 19.25 12 19.25"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M19.25 15.5V19.25H15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.75 9.75H14.25V14.25H9.75V9.75Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function AssessmentIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="14 2 14 8 20 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="16"
        y1="13"
        x2="8"
        y2="13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="17"
        x2="8"
        y2="17"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4.75L14.06 8.92L18.66 9.59L15.33 12.84L16.12 17.42L12 15.25L7.88 17.42L8.67 12.84L5.34 9.59L9.94 8.92L12 4.75Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardTopbar({
  sessionId,
  user,
  connected,
  classContextMode,
  onToggleClassContext,
  strictMode,
  onToggleStrictMode,
  simulateClassroom,
  onToggleSimulate,
  livenessLoading,
  onCheckEngagement,
  onOpenAssessmentModal,
}) {
  const userLabel = user?.email || "Teacher";

  return (
    <header className="td-topbar">
      <div className="td-brand-group">
        <div className="td-brand-mark" aria-label="Chronos">
          <ChronosMark size={20} variant="gold" />
        </div>
        <div className="td-brand-copy">
          <div className="td-brand-name">Chronos</div>
          <div className="td-brand-meta" title={`${sessionId} ${userLabel}`}>
            <span>Teacher Dashboard</span>
            <span className="td-brand-sep">.</span>
            <span>{sessionId}</span>
            <span className="td-brand-sep">.</span>
            <span>{userLabel}</span>
          </div>
        </div>
      </div>

      <div className="td-topbar-right">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold tracking-wide" title="Session running in accelerated demo timing">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Accelerated Demo Mode
        </div>

        <div
          className={`td-ws-badge ${connected ? "" : "disconnected"}`}
          title="WebSocket connection status"
        >
          <span className="td-ws-dot" />
          {connected ? "Live" : "Offline"}
        </div>

        <div className="td-seg-wrap" role="group" aria-label="Session controls">
          <button
            type="button"
            className={`td-seg-btn ${classContextMode === "class" ? "active-gold" : "active-blue"}`}
            onClick={onToggleClassContext}
            title="Toggle class and exam mode"
            aria-pressed={classContextMode === "class"}
          >
            <ClassIcon />
            {classContextMode === "class" ? "Class" : "Exam"}
          </button>

          <button
            type="button"
            className={`td-seg-btn ${strictMode ? "active-blue" : ""}`}
            onClick={onToggleStrictMode}
            title="Toggle strict tab policy"
            aria-pressed={strictMode}
          >
            <StrictIcon />
            {strictMode ? "Strict tab" : "Normal tab"}
          </button>

          <button
            type="button"
            className={`td-seg-btn ${simulateClassroom ? "active-green" : ""}`}
            onClick={onToggleSimulate}
            title="Toggle classroom simulator"
            aria-pressed={simulateClassroom}
          >
            <SimIcon />
            {simulateClassroom ? "Simulate on" : "Simulate"}
          </button>

          {onOpenAssessmentModal && (
            <button
              type="button"
              className="td-seg-btn active-gold"
              onClick={onOpenAssessmentModal}
              title="Assessment & Submissions Management"
            >
              <AssessmentIcon />
              Assessment
            </button>
          )}
        </div>

        <button
          type="button"
          className="td-cta-btn"
          onClick={() => onCheckEngagement()}
          disabled={livenessLoading}
          title="Trigger engagement and liveness check for all students"
        >
          <StarIcon />
          {livenessLoading ? "Sending..." : "Check engagement (all)"}
        </button>
      </div>
    </header>
  );
}
