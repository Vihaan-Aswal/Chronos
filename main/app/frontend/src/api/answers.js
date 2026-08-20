/**
 * Chronos Assessment Answer Submissions API Client
 * Workstream: Resource-Supported Assessment Vertical Slice
 */

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function resolveToken(token) {
  if (token) return token;
  try {
    return sessionStorage.getItem("chronos_token") || localStorage.getItem("token") || "";
  } catch {
    return "";
  }
}

function getHeaders(token, isJson = true) {
  const authToken = resolveToken(token);
  const headers = {};
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Saves an auto-saved draft of typed answer text without consuming version quota.
 * @param {string} sessionId
 * @param {string} typedContent
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function saveAnswerDraft(sessionId, typedContent, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/answers/draft`, {
    method: "POST",
    headers: getHeaders(token, true),
    body: JSON.stringify({
      typed_content: typedContent,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to save answer draft: ${res.status}`);
  }

  return res.json();
}

/**
 * Submits typed text as a versioned answer submission.
 * @param {string} sessionId
 * @param {Object} payload
 * @param {string} payload.typedContent
 * @param {boolean} [payload.isFinal=true]
 * @param {string} [payload.clientSubmissionId]
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function submitTypedAnswer(sessionId, { typedContent, isFinal = true, clientSubmissionId }, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/answers/submit`, {
    method: "POST",
    headers: getHeaders(token, true),
    body: JSON.stringify({
      typed_content: typedContent,
      is_final: isFinal,
      client_submission_id: clientSubmissionId || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to submit typed answer: ${res.status}`);
  }

  return res.json();
}

/**
 * Submits an uploaded file (PDF / Image) as a versioned answer submission.
 * @param {string} sessionId
 * @param {FormData} formData
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function submitFileAnswer(sessionId, formData, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/answers/submit`, {
    method: "POST",
    headers: getHeaders(token, false), // Browser automatically sets multipart/form-data boundary
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to submit file answer: ${res.status}`);
  }

  return res.json();
}

/**
 * Retrieves full submission version history for the authenticated student.
 * @param {string} sessionId
 * @param {string} [token]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchMySubmissions(sessionId, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/answers/mine`, {
    method: "GET",
    headers: getHeaders(token, true),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to fetch submissions: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.submissions || data.items || [];
}

/**
 * Retrieves all student submissions in a session for teacher review.
 * @param {string} sessionId
 * @param {string} [token]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchTeacherSubmissions(sessionId, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/submissions`, {
    method: "GET",
    headers: getHeaders(token, true),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to fetch teacher submissions: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.submissions || data.items || [];
}

/**
 * Retrieves a signed, secure download URL for an answer submission artifact.
 * @param {string} sessionId
 * @param {string} submissionId
 * @param {string} [token]
 * @returns {Promise<{answer_id: string, download_url: string, typed_content?: string, expires_in_seconds: number}>}
 */
export async function getSubmissionDownloadUrl(sessionId, submissionId, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/submissions/${submissionId}/download`, {
    method: "GET",
    headers: getHeaders(token, true),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to get submission download URL: ${res.status}`);
  }

  return res.json();
}
