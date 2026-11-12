// src/api/teacher-actions.js
// Workstream W7: Scalable Teacher Triage & Batch Actions

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function getAuthHeaders() {
  let token = "";
  try {
    const raw = sessionStorage.getItem("chronos_user");
    if (raw) {
      const u = JSON.parse(raw);
      token = u?.token || u?.access_token || "";
    }
  } catch {
    token = "";
  }
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchSessionCases(sessionId, view = null) {
  if (!sessionId || sessionId === "default-session") {
    return { status: "success", count: 0, cases: [] };
  }
  const url = new URL(`${BASE}/api/v1/sessions/${sessionId}/cases`);
  if (view) {
    url.searchParams.set("view", view);
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch session cases: ${response.statusText}`);
  }
  return response.json();
}

export async function sendTeacherAction(sessionId, userId, action, messageText = null, options = {}) {
  const body = {
    session_id: sessionId,
    user_id: userId,
    action,
    action_type: action,
    ...options,
  };
  if (messageText) body.message_text = messageText;

  const response = await fetch(`${BASE}/teacher/action`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || `Teacher action failed: ${response.statusText}`);
  }
  return response.json();
}

export async function sendBatchTeacherAction(
  sessionId,
  {
    caseIds = [],
    participantIds = [],
    actionType,
    note = null,
    snoozeDurationMinutes = null,
  }
) {
  const body = {
    session_id: sessionId,
    case_ids: caseIds,
    participant_ids: participantIds,
    action_type: actionType,
    note,
    snooze_duration_minutes: snoozeDurationMinutes,
  };

  const response = await fetch(`${BASE}/api/v1/sessions/${sessionId}/cases/actions`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || `Batch teacher action failed: ${response.statusText}`);
  }
  return response.json();
}
