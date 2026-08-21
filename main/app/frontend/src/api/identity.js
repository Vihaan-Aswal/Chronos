import { getAuthToken } from "./ws-auth.js";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export async function registerIdentity(userId, embedding) {
  try {
    const token = getAuthToken();
    const res = await fetch(`${BASE}/identity/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        user_id: userId,
        embedding: Array.from(embedding),
      }),
    });

    return await res.json();
  } catch (err) {
    return { status: "error", message: err.message || String(err) };
  }
}

export async function fetchIdentity(userId) {
  try {
    const token = getAuthToken();
    const res = await fetch(`${BASE}/identity/${encodeURIComponent(userId)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return await res.json();
  } catch (err) {
    return { exists: false, error: err.message || String(err) };
  }
}
