import { createPortal } from "react-dom";

function NudgeNotification({ message }) {
  if (!message) return null;

  return createPortal(
    <div className="sd-nudge-toast animate-nudge-slide-in">
      <span className="sd-nudge-icon" aria-hidden="true">
        🔔
      </span>
      <span className="sd-nudge-message">{message}</span>
    </div>,
    document.body,
  );
}

export default NudgeNotification;
