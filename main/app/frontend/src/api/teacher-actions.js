const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function sendTeacherAction(sessionId, userId, action, messageText = null) {
  const body = { session_id: sessionId, user_id: userId, action };
  if (messageText) body.message_text = messageText;
  const response = await fetch(`${BASE}/teacher/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed: ${response.statusText}`);
  }
  return response.json();
}
