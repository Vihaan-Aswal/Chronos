/**
 * Chronos Privacy & Data Lifecycle API Client
 * Specification: PRIVACY_DATA_MODEL.md §4, §5 & QUALITY_REQUIREMENTS.md §6
 */
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/**
 * Record granular consent choices (single scope or batch map)
 */
export async function recordConsent(token, { scopes, scope, grant, sessionId, policyVersion = "v1" }) {
  const payload = {
    session_id: sessionId,
    policy_version: policyVersion,
  };
  if (scopes) {
    payload.scopes = scopes;
  } else {
    payload.scope = scope;
    payload.grant = grant;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/privacy/consent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to record consent" }));
    throw new Error(err.detail || "Failed to record consent");
  }
  return response.json();
}

/**
 * Withdraw consent for an optional processing category mid-session
 */
export async function withdrawConsent(token, { scope, sessionId, policyVersion = "v1" }) {
  const response = await fetch(`${API_BASE_URL}/api/v1/privacy/consent/withdraw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      scope,
      session_id: sessionId,
      policy_version: policyVersion,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to withdraw consent" }));
    throw new Error(err.detail || "Failed to withdraw consent");
  }
  return response.json();
}

/**
 * Fetch current user's consent records
 */
export async function getMyConsents(token, sessionId = null) {
  const url = new URL(`${API_BASE_URL}/api/v1/privacy/consent/mine`);
  if (sessionId) {
    url.searchParams.append("session_id", sessionId);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch consent records");
  }
  return response.json();
}

/**
 * Subject Access Request (SAR): Export all personal data
 */
export async function exportMyData(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/privacy/data-export`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to export personal data");
  }
  return response.json();
}

/**
 * Submit Data Erasure / Deletion Request
 */
export async function requestErasure(token, { sessionId = null, dataClasses = null, reason = "" } = {}) {
  const response = await fetch(`${API_BASE_URL}/api/v1/privacy/deletion-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      data_classes: dataClasses,
      reason,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit deletion request");
  }
  return response.json();
}

/**
 * Submit student technical context / appeal
 */
export async function submitStudentContext(token, sessionId, { appealCategory, explanationText, requestedHelp, attachedToEventIds = [] }) {
  const response = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      appeal_category: appealCategory,
      explanation_text: explanationText,
      requested_help: requestedHelp,
      attached_to_event_ids: attachedToEventIds,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to submit student context");
  }
  return response.json();
}
