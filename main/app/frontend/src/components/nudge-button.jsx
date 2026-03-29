import { useState } from "react";
import { sendNudge } from "../api/nudge";

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.75L14.06 8.92L18.66 9.59L15.33 12.84L16.12 17.42L12 15.25L7.88 17.42L8.67 12.84L5.34 9.59L9.94 8.92L12 4.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="td-spin">
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.22"
      />
      <path
        d="M20 12C20 7.58 16.42 4 12 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NudgeButton({
  userId,
  sessionId,
  className = "",
  variant = "default",
  iconOnly = false,
  title = "Send nudge",
  disabled = false,
}) {
  const [sending, setSending] = useState(false);

  const handleNudge = async () => {
    if (sending) return;

    setSending(true);
    try {
      await sendNudge(sessionId, userId, "soft");
    } catch (error) {
      console.error("Error sending nudge:", error);
      alert("Failed to send nudge. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const isIconMode = iconOnly || variant === "teacherIcon";
  const resolvedDisabled = disabled || sending;

  if (isIconMode) {
    return (
      <button
        type="button"
        onClick={handleNudge}
        disabled={resolvedDisabled}
        className={className}
        title={title}
        aria-label={sending ? "Sending nudge" : "Nudge"}
      >
        {sending ? <SpinnerIcon /> : <StarIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleNudge}
      disabled={resolvedDisabled}
      title={title}
      aria-label={sending ? "Sending nudge" : "Nudge"}
      className={`bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ${className}`.trim()}
    >
      {sending ? "Sending..." : "Nudge"}
    </button>
  );
}

export default NudgeButton;
