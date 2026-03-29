const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/**
 * Send nudge to a student
 */
export async function sendNudge(sessionId, userId, type) {
  const response = await fetch(`${BASE}/nudge/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      user_id: userId,
      nudge_type: type,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send nudge: ${response.statusText}`);
  }

  return response.json();
}
