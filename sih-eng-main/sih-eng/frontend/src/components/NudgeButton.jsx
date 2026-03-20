import { useState } from "react";
import { sendNudge } from "../api/nudge";

function NudgeButton({ userId, sessionId }) {
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

  return (
    <button
      onClick={handleNudge}
      disabled={sending}
      className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
    >
      {sending ? "Sending..." : "Nudge"}
    </button>
  );
}

export default NudgeButton;












