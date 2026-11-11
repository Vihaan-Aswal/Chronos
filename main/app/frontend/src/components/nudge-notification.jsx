import { createPortal } from "react-dom";

function NudgeNotification({ message }) {
  if (!message) return null;

  return createPortal(
    <div className="app room-nudge" role="status" aria-live="polite">
      <span className="room-nudge-mark" aria-hidden="true">
        <i />
      </span>
      <div>
        <p className="room-nudge-label">A quiet nudge</p>
        <p>{message}</p>
      </div>
    </div>,
    document.body,
  );
}

export default NudgeNotification;
