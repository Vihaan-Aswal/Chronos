/**
 * Chronos Report Read-Model & Export API Service
 * Workstream W8: Timeline-Led Reports and Exports
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

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
 * Fetch authoritative post-session report read model.
 * @param {string} sessionId
 * @param {Object} options
 * @param {boolean} [options.forceRebuild=false]
 * @param {string} [options.token]
 */
export async function fetchSessionReport(sessionId, { forceRebuild = false, token = null } = {}) {
  const url = `${BASE_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/report${
    forceRebuild ? "?force_rebuild=true" : ""
  }`;
  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(token, true),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch report (HTTP ${response.status})`);
  }

  const result = await response.json();
  return result.report;
}

/**
 * Force deterministic rebuild of the report read model from durable event stream.
 * @param {string} sessionId
 * @param {string} [token]
 */
export async function rebuildSessionReport(sessionId, token = null) {
  const url = `${BASE_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/report/rebuild`;
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(token, true),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to rebuild report (HTTP ${response.status})`);
  }

  const result = await response.json();
  return result.report;
}

/**
 * Record an audit log entry for report export.
 * @param {string} sessionId
 * @param {Object} options
 * @param {string} [options.exportFormat="pdf"]
 * @param {string} [options.token]
 */
export async function recordReportExportAudit(sessionId, { exportFormat = "pdf", token = null } = {}) {
  const url = `${BASE_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/report/export-audit?export_format=${encodeURIComponent(
    exportFormat
  )}`;
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(token, true),
  });

  if (!response.ok) {
    console.warn("Failed to record report export audit", response.status);
    return false;
  }
  return true;
}
