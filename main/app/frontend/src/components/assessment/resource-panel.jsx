import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchSessionResources,
  getResourceAccess,
  recordResourceEvent,
} from "../../api/resources.js";

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoStr;
  }
}

function checkAvailability(resource) {
  const now = new Date();
  if (resource.allowed_from) {
    const fromDt = new Date(resource.allowed_from);
    if (now < fromDt) {
      return { available: false, reason: `Unlocks at ${formatDate(resource.allowed_from)}` };
    }
  }
  if (resource.allowed_until) {
    const untilDt = new Date(resource.allowed_until);
    if (now > untilDt) {
      return { available: false, reason: `Closed at ${formatDate(resource.allowed_until)}` };
    }
  }
  return { available: true };
}

export default function ResourcePanel({
  sessionId,
  token,
  visibilityTrackerRef = null,
  policyId = "RESOURCE_SUPPORTED_ASSESSMENT",
  className = "",
}) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Preview Modal State
  const [activePreviewResource, setActivePreviewResource] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewOpenTimeRef = useRef(null);

  // External link disclaimer dialog state
  const [pendingExternalLink, setPendingExternalLink] = useState(null);

  const isMountedRef = useRef(true);

  const loadResources = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (isMountedRef.current) setLoading(true);
      const items = await fetchSessionResources(sessionId, token);
      if (isMountedRef.current) {
        setResources(items);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to load assessment resources");
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    isMountedRef.current = true;
    loadResources();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadResources]);

  // Open resource preview modal & track RESOURCE_OPENED
  const handleOpenPreview = async (resource) => {
    const avail = checkAvailability(resource);
    if (!avail.available) {
      alert(`Resource is currently unavailable: ${avail.reason}`);
      return;
    }

    setActivePreviewResource(resource);
    setLoadingPreview(true);
    previewOpenTimeRef.current = Date.now();

    // Telemetry: record RESOURCE_OPENED (suppressed if NO_ANALYTICS)
    if (policyId !== "NO_ANALYTICS") {
      try {
        await recordResourceEvent(sessionId, resource.resource_id, "RESOURCE_OPENED", 0, token);
      } catch (err) {
        console.warn("Failed to record RESOURCE_OPENED event:", err);
      }
    }

    try {
      const accessData = await getResourceAccess(sessionId, resource.resource_id, token);
      if (isMountedRef.current) {
        setPreviewUrl(accessData.access_url);
      }
    } catch (err) {
      console.error("Failed to load resource access URL:", err);
      alert(err.message || "Failed to access resource file");
      setActivePreviewResource(null);
    } finally {
      if (isMountedRef.current) {
        setLoadingPreview(false);
      }
    }
  };

  // Close resource preview & track RESOURCE_CLOSED with duration
  const handleClosePreview = async () => {
    if (!activePreviewResource) return;
    const durationMs = previewOpenTimeRef.current ? Math.max(0, Date.now() - previewOpenTimeRef.current) : 0;
    const resourceId = activePreviewResource.resource_id;

    setActivePreviewResource(null);
    setPreviewUrl(null);
    previewOpenTimeRef.current = null;

    if (policyId !== "NO_ANALYTICS") {
      try {
        await recordResourceEvent(sessionId, resourceId, "RESOURCE_CLOSED", durationMs, token);
      } catch (err) {
        console.warn("Failed to record RESOURCE_CLOSED event:", err);
      }
    }
  };

  // Trigger resource download
  const handleDownload = async (resource, e) => {
    e?.stopPropagation();
    const avail = checkAvailability(resource);
    if (!avail.available) {
      alert(`Resource is currently unavailable: ${avail.reason}`);
      return;
    }

    try {
      const accessData = await getResourceAccess(sessionId, resource.resource_id, token);
      if (accessData.access_url) {
        const link = document.createElement("a");
        link.href = accessData.access_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.download = resource.title || "resource";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      alert(err.message || "Failed to download resource");
    }
  };

  // Handle external link click: disclaimer & visibility tracker
  const handleExternalLinkClick = (resource) => {
    const avail = checkAvailability(resource);
    if (!avail.available) {
      alert(`External link is currently unavailable: ${avail.reason}`);
      return;
    }
    setPendingExternalLink(resource);
  };

  const confirmOpenExternalLink = async () => {
    if (!pendingExternalLink) return;
    const resource = pendingExternalLink;
    setPendingExternalLink(null);

    // 1. Inform visibility tracker if provided
    const tracker = visibilityTrackerRef?.current || visibilityTrackerRef;
    if (tracker && typeof tracker.recordExternalResourceClick === "function") {
      tracker.recordExternalResourceClick(resource.resource_id);
    }

    // 2. Telemetry: record EXTERNAL_RESOURCE_CLICKED
    if (policyId !== "NO_ANALYTICS") {
      try {
        await recordResourceEvent(sessionId, resource.resource_id, "EXTERNAL_RESOURCE_CLICKED", 0, token);
      } catch (err) {
        console.warn("Failed to record EXTERNAL_RESOURCE_CLICKED event:", err);
      }
    }

    // 3. Open declared URL in new window safely
    const targetUrl = resource.declared_url || resource.storage_path;
    if (targetUrl) {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Categorize resources
  const primaryPaper = resources.find(
    (r) => r.is_primary || r.type === "primary_question_paper"
  );
  const supplementaryList = resources.filter(
    (r) => !r.is_primary && r.type !== "primary_question_paper" && r.type !== "external_link"
  );
  const externalLinksList = resources.filter((r) => r.type === "external_link");

  return (
    <div className={`res-panel ${className}`.trim()}>
      {/* Header */}
      <div className="res-head">
        <div className="surface-head-main">
          <div className="surface-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div>
            <h3 className="res-title">Assessment Resources</h3>
            <p className="surface-meta">Authorized materials &amp; links</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadResources}
          disabled={loading}
          className="icon-btn icon-btn-sm"
          title="Refresh resources"
          aria-label="Refresh resources"
        >
          <svg className={loading ? "is-spinning" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="notice notice-flag res-alert" role="alert">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      )}

      {loading && resources.length === 0 ? (
        <div className="surface-loading">
          <span className="surface-spin" aria-hidden="true" />
          Loading session materials...
        </div>
      ) : resources.length === 0 ? (
        <div className="empty">
          <h3>No Resources Published</h3>
          <p>No question papers or external links have been attached to this session yet.</p>
        </div>
      ) : (
        <div>
          {/* Section 1: Primary Question Paper */}
          {primaryPaper && (
            <div className="res-primary">
              <div className="res-primary-top">
                <div className="surface-row-actions">
                  <span className="badge badge-ink">Primary Question Paper</span>
                  {primaryPaper.required && (
                    <span className="badge badge-flag">Required</span>
                  )}
                </div>
                {primaryPaper.size_bytes > 0 && (
                  <span className="surface-meta surface-mono">
                    {formatBytes(primaryPaper.size_bytes)}
                  </span>
                )}
              </div>

              <h4>{primaryPaper.title}</h4>
              {primaryPaper.description && (
                <p>{primaryPaper.description}</p>
              )}

              {/* Action Buttons */}
              <div className="res-primary-actions">
                <button
                  type="button"
                  onClick={() => handleOpenPreview(primaryPaper)}
                  className="btn btn-ink btn-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  View Question Paper
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDownload(primaryPaper, e)}
                  className="btn btn-line btn-sm"
                  title="Download copy"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          )}

          {/* Section 2: Supplementary Resources */}
          {supplementaryList.length > 0 && (
            <div className="surface-section">
              <div className="surface-section-head">
                <h4 className="surface-label">
                  Supplementary Resources ({supplementaryList.length}/5)
                </h4>
              </div>
              <div>
                {supplementaryList.map((res) => {
                  const isPdf = res.type === "uploaded_pdf" || res.storage_path?.endsWith(".pdf");
                  const avail = checkAvailability(res);

                  return (
                    <div
                      key={res.resource_id}
                      onClick={() => handleOpenPreview(res)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenPreview(res);
                        }
                      }}
                      role="button"
                      tabIndex={avail.available ? 0 : -1}
                      aria-disabled={!avail.available}
                      className={`res-item${!avail.available ? " is-unavailable" : ""}`}
                    >
                      <div className="res-item-main">
                        <div className="surface-mark" aria-hidden="true">
                          {isPdf ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="res-item-title">{res.title}</p>
                          <div className="res-item-meta">
                            <span>{isPdf ? "PDF Document" : "Image"}</span>
                            {res.size_bytes > 0 && <span>• {formatBytes(res.size_bytes)}</span>}
                            {!avail.available && (
                              <span className="is-waiting">• {avail.reason}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDownload(res, e)}
                        className="icon-btn icon-btn-sm"
                        title="Download resource"
                        aria-label={`Download ${res.title}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Declared External Links */}
          {externalLinksList.length > 0 && (
            <div className="surface-section">
              <div className="surface-section-head">
                <h4 className="surface-label">
                  Declared External Links ({externalLinksList.length}/5)
                </h4>
              </div>
              <div>
                {externalLinksList.map((link) => {
                  const avail = checkAvailability(link);
                  return (
                    <div
                      key={link.resource_id}
                      onClick={() => handleExternalLinkClick(link)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleExternalLinkClick(link);
                        }
                      }}
                      role="button"
                      tabIndex={avail.available ? 0 : -1}
                      aria-disabled={!avail.available}
                      className={`res-item${!avail.available ? " is-unavailable" : ""}`}
                    >
                      <div className="res-item-main">
                        <div className="surface-mark" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </div>
                        <div>
                          <div className="res-item-title-row">
                            <p className="res-item-title">{link.title}</p>
                            {link.required && (
                              <span className="badge badge-flag">Req</span>
                            )}
                          </div>
                          <div className="res-item-meta">
                            <span className="surface-mono">
                              {link.allowed_domain || "External Reference"}
                            </span>
                            {!avail.available && (
                              <span className="is-waiting">• {avail.reason}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="res-open">
                        Open
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* External Link Disclaimer Alert Modal */}
      {pendingExternalLink && (
        <div className="app surface-overlay">
          <div
            className="surface-modal surface-modal--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="external-link-title"
          >
            <div className="surface-head">
              <div className="surface-head-main">
                <div className="surface-mark" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </div>
                <div>
                  <h3 className="surface-title" id="external-link-title">
                    Opening External Resource
                  </h3>
                  <p className="surface-sub">
                    You are navigating to:{" "}
                    <strong>
                      {pendingExternalLink.declared_url || pendingExternalLink.title}
                    </strong>
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-body">
              {/* MANDATED INVARIANT DISCLAIMER */}
              <div className="notice notice-quiet">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <p className="strong">Privacy &amp; Proctoring Notice</p>
                  <p>
                    <em>
                      &quot;Chronos page hidden while viewing external resource.
                      Destination cannot be verified.&quot;
                    </em>
                  </p>
                  <p className="surface-note">
                    Opening an external link will record a resource click event.
                    Return to Chronos immediately after consulting the resource.
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-actions">
              <button
                type="button"
                onClick={() => setPendingExternalLink(null)}
                className="btn btn-line btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmOpenExternalLink}
                className="btn btn-ink btn-sm"
              >
                Proceed to Resource
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Resource Viewer Preview Modal */}
      {activePreviewResource && (
        <div className="app surface-overlay">
          <div
            className="surface-modal res-viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-viewer-title"
          >
            {/* Modal Topbar */}
            <div className="res-viewer-head">
              <div className="surface-head-main">
                <div className="surface-mark surface-mark--gold" aria-hidden="true">
                  {activePreviewResource.is_primary ? "QP" : "RES"}
                </div>
                <div>
                  <h3 className="surface-title truncate" id="resource-viewer-title">
                    {activePreviewResource.title}
                  </h3>
                  <div className="surface-row-meta">
                    <span>
                      {activePreviewResource.storage_path?.split("/").pop() || "Document"}
                    </span>
                    {activePreviewResource.size_bytes > 0 && (
                      <span>• {formatBytes(activePreviewResource.size_bytes)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="surface-row-actions">
                <button
                  type="button"
                  onClick={(e) => handleDownload(activePreviewResource, e)}
                  className="btn btn-line btn-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="icon-btn icon-btn-sm"
                  title="Close viewer"
                  aria-label="Close viewer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body: Document / Image Preview */}
            <div className="res-viewer-body">
              {loadingPreview ? (
                <div className="surface-loading res-viewer-loading">
                  <span className="surface-spin" aria-hidden="true" />
                  Fetching secure artifact...
                </div>
              ) : previewUrl ? (
                activePreviewResource.storage_path?.endsWith(".pdf") || activePreviewResource.type === "uploaded_pdf" ? (
                  <iframe
                    src={`${previewUrl}#toolbar=1&navpanes=0`}
                    title={activePreviewResource.title}
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt={activePreviewResource.title}
                  />
                )
              ) : (
                <div className="res-viewer-error" role="alert">
                  Failed to render preview. Please use the download option.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
