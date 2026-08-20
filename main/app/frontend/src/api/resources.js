/**
 * Chronos Assessment Resources API Client
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
 * Fetches all resources published for a session.
 * @param {string} sessionId
 * @param {string} [token]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchSessionResources(sessionId, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/resources`, {
    method: "GET",
    headers: getHeaders(token, true),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to fetch session resources: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : data.resources || [];
}

/**
 * Uploads a primary question paper or supplementary PDF/image resource.
 * @param {string} sessionId
 * @param {FormData} formData
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function uploadSessionResource(sessionId, formData, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/resources/upload`, {
    method: "POST",
    headers: getHeaders(token, false), // Do not set Content-Type for FormData
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to upload resource: ${res.status}`);
  }

  return res.json();
}

/**
 * Publishes a declared external link resource.
 * @param {string} sessionId
 * @param {Object} linkData
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function addExternalLink(sessionId, linkData, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/resources/external-link`, {
    method: "POST",
    headers: getHeaders(token, true),
    body: JSON.stringify(linkData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to add external link: ${res.status}`);
  }

  return res.json();
}

/**
 * Deletes a resource prior to session start.
 * @param {string} sessionId
 * @param {string} resourceId
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function deleteSessionResource(sessionId, resourceId, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/resources/${resourceId}`, {
    method: "DELETE",
    headers: getHeaders(token, true),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to delete resource: ${res.status}`);
  }

  return res.json();
}

/**
 * Retrieves signed access details / URL for a declared resource.
 * @param {string} sessionId
 * @param {string} resourceId
 * @param {string} [token]
 * @returns {Promise<{resource_id: string, access_url: string, expires_in_seconds: number}>}
 */
export async function getResourceAccess(sessionId, resourceId, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/resources/${resourceId}/access`, {
    method: "GET",
    headers: getHeaders(token, true),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to get resource access: ${res.status}`);
  }

  return res.json();
}

/**
 * Records resource interaction telemetry (RESOURCE_OPENED, RESOURCE_CLOSED, EXTERNAL_RESOURCE_CLICKED).
 * @param {string} sessionId
 * @param {string} resourceId
 * @param {string} eventType
 * @param {number} [durationMs]
 * @param {string} [token]
 * @returns {Promise<Object>}
 */
export async function recordResourceEvent(sessionId, resourceId, eventType, durationMs = 0, token) {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/resources/${resourceId}/events`, {
    method: "POST",
    headers: getHeaders(token, true),
    body: JSON.stringify({
      event_type: eventType,
      duration_ms: durationMs || 0,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.message || `Failed to record resource event: ${res.status}`);
  }

  return res.json();
}
