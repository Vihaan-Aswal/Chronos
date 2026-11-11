import { useState } from "react";
import { sendNudge } from "../api/nudge";
import { StarIcon } from "./app/icons.jsx";

function NudgeButton({
  userId,
  sessionId,
  className = "icon-btn",
  variant = "default",
  iconOnly = false,
  title = "Send nudge",
  disabled = false,
  onError,
}) {
  const [sending, setSending] = useState(false);

  const handleNudge = async () => {
    if (sending) return;
    setSending(true);
    try {
      await sendNudge(sessionId, userId, "soft");
    } catch (error) {
      console.error("Error sending nudge:", error);
      onError?.("Nudge could not be sent. Check the connection and try again.");
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
        aria-label={
          sending ? "Sending nudge" : title || `Nudge ${userId || "student"}`
        }
      >
        <StarIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleNudge}
      disabled={resolvedDisabled}
      title={title}
      className={`btn btn-line btn-sm ${className}`.trim()}
    >
      {sending ? "Sending…" : "Nudge"}
    </button>
  );
}

export default NudgeButton;
