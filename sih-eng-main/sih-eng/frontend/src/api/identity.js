const BASE = import.meta.env.VITE_BACKEND_URL;

export async function registerIdentity(userId, embedding) {
  try {
    const res = await fetch(`${BASE}/identity/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${BASE}/identity/${encodeURIComponent(userId)}`);
    return await res.json();
  } catch (err) {
    return { exists: false, error: err.message || String(err) };
  }
}
