/**
 * ws-auth.js
 * Centralized WebSocket ticket helper for Chronos zero-trust admission.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export function getAuthToken() {
  try {
    const rawToken = sessionStorage.getItem("chronos_token");
    if (rawToken) return rawToken;

    const rawUser = sessionStorage.getItem("chronos_user");
    if (rawUser) {
      const user = JSON.parse(rawUser);
      if (user?.token) return user.token;
    }
  } catch {
    // fallback
  }
  return "";
}

/**
 * Request a single-use 30-second WebSocket admission ticket.
 * @param {string} sessionId
 * @param {"engagement"|"teacher"} channel
 * @returns {Promise<string>} ticket string (e.g. wst_...)
 */
export async function getWebSocketTicket(sessionId, channel = "engagement") {
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}/ws/ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      session_id: sessionId,
      channel,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Failed to acquire WebSocket ticket (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.ticket;
}
