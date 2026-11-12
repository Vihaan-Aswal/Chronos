/**
 * Chronos Active Presence API Client
 * Workstream W4: Local Observation, Browser Context, and Active Presence
 */

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function getAuthHeaders() {
  const token = sessionStorage.getItem("chronos_token") || localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Requests an Active Presence challenge for a student.
 * @param {string} sessionId
 * @param {Object} [payload]
 */
export async function requestPresenceChallenge(sessionId, payload = {}) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/presence/challenge/request`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to request presence challenge: ${res.status}`);
  }
  return res.json();
}

/**
 * Submits student challenge response proof with cryptographic binding.
 * @param {string} sessionId
 * @param {Object} responseData
 */
export async function respondPresenceChallenge(sessionId, responseData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/presence/challenge/respond`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(responseData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to submit presence challenge: ${res.status}`);
  }
  return res.json();
}

/**
 * Declines an active presence challenge (non-punitive fallback path).
 * @param {string} sessionId
 * @param {Object} declineData
 */
export async function declinePresenceChallenge(sessionId, declineData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/presence/challenge/decline`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(declineData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to decline presence challenge: ${res.status}`);
  }
  return res.json();
}

/**
 * Requests teacher manual verification for accessibility or hardware reasons.
 * @param {string} sessionId
 * @param {Object} reviewData
 */
export async function requestManualReview(sessionId, reviewData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/presence/challenge/manual-request`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(reviewData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to request manual review: ${res.status}`);
  }
  return res.json();
}
