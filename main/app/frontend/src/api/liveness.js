const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function triggerLiveness(sessionId, userId = null) {
  const body = { session_id: sessionId };
  if (userId) body.user_id = userId;
  const response = await fetch(`${BASE}/liveness/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed: ${response.statusText}`);
  }
  return response.json();
}
