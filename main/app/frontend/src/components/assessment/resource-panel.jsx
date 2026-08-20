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
    <div className={`flex flex-col h-full bg-[#051421]/95 text-[#d3e4f8] rounded-2xl border border-[rgba(211,228,248,0.12)] p-4 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[rgba(211,228,248,0.1)] mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#dcc492]/15 border border-[#dcc492]/30 flex items-center justify-center text-[#dcc492]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Assessment Resources</h3>
            <p className="text-xs text-[#d3e4f8]/60">Authorized materials & links</p>
          </div>
        </div>
        <button
          onClick={loadResources}
          disabled={loading}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#d3e4f8]/70 hover:text-white transition disabled:opacity-50"
          title="Refresh resources"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <span className="font-bold">!</span>
          <span>{error}</span>
        </div>
      )}

      {loading && resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#d3e4f8]/50 text-xs">
          <svg className="animate-spin h-6 w-6 mb-2 text-[#dcc492]" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading session materials...
        </div>
      ) : resources.length === 0 ? (
        <div className="text-center py-10 px-4 bg-white/[0.02] rounded-xl border border-dashed border-[rgba(211,228,248,0.1)] text-[#d3e4f8]/50 text-xs">
          <p className="font-medium text-white/80 mb-1">No Resources Published</p>
          <p>No question papers or external links have been attached to this session yet.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Section 1: Primary Question Paper */}
          {primaryPaper && (
            <div className="rounded-xl bg-gradient-to-b from-[#dcc492]/10 to-[#0b1d2e] border border-[#dcc492]/30 p-3.5 shadow-lg relative overflow-hidden">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#dcc492] text-[#020e18]">
                    Primary Question Paper
                  </span>
                  {primaryPaper.required && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30">
                      Required
                    </span>
                  )}
                </div>
                {primaryPaper.size_bytes > 0 && (
                  <span className="text-[11px] text-[#d3e4f8]/60 font-mono">
                    {formatBytes(primaryPaper.size_bytes)}
                  </span>
                )}
              </div>

              <h4 className="text-sm font-semibold text-white mb-1">{primaryPaper.title}</h4>
              {primaryPaper.description && (
                <p className="text-xs text-[#d3e4f8]/75 mb-3 leading-relaxed">{primaryPaper.description}</p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleOpenPreview(primaryPaper)}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#dcc492] hover:bg-[#ebd5a7] text-[#020e18] text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  View Question Paper
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDownload(primaryPaper, e)}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center gap-1.5 transition border border-white/10"
                  title="Download copy"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#d3e4f8]/90 tracking-wide uppercase">
                  Supplementary Resources ({supplementaryList.length}/5)
                </span>
              </div>
              <div className="space-y-2">
                {supplementaryList.map((res) => {
                  const isPdf = res.type === "uploaded_pdf" || res.storage_path?.endsWith(".pdf");
                  const avail = checkAvailability(res);

                  return (
                    <div
                      key={res.resource_id}
                      onClick={() => handleOpenPreview(res)}
                      className={`p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-[rgba(211,228,248,0.08)] hover:border-[rgba(211,228,248,0.2)] transition cursor-pointer flex items-center justify-between gap-3 ${
                        !avail.available ? "opacity-60 pointer-events-none" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
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
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{res.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-[#d3e4f8]/60 mt-0.5">
                            <span>{isPdf ? "PDF Document" : "Image"}</span>
                            {res.size_bytes > 0 && <span>• {formatBytes(res.size_bytes)}</span>}
                            {!avail.available && (
                              <span className="text-amber-400 font-medium">• {avail.reason}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDownload(res, e)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-[#d3e4f8]/60 hover:text-white transition"
                          title="Download resource"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Declared External Links */}
          {externalLinksList.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#d3e4f8]/90 tracking-wide uppercase">
                  Declared External Links ({externalLinksList.length}/5)
                </span>
              </div>
              <div className="space-y-2">
                {externalLinksList.map((link) => {
                  const avail = checkAvailability(link);
                  return (
                    <div
                      key={link.resource_id}
                      onClick={() => handleExternalLinkClick(link)}
                      className={`p-3 rounded-xl bg-blue-500/[0.04] hover:bg-blue-500/[0.08] border border-blue-400/20 hover:border-blue-400/40 transition cursor-pointer flex items-center justify-between gap-3 ${
                        !avail.available ? "opacity-60 pointer-events-none" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300 shrink-0">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-white truncate">{link.title}</p>
                            {link.required && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30">
                                Req
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-blue-300/70 mt-0.5 truncate font-mono">
                            <span>{link.allowed_domain || "External Reference"}</span>
                            {!avail.available && (
                              <span className="text-amber-400 font-sans">• {avail.reason}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="text-blue-400 text-xs shrink-0 flex items-center gap-1 font-medium">
                        Open
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#04111d] border border-blue-400/30 rounded-2xl max-w-md w-full p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-400/30 text-blue-400 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </div>

            <h3 className="text-base font-bold text-white text-center mb-2">Opening External Resource</h3>
            <p className="text-xs text-[#d3e4f8]/80 text-center mb-4">
              You are navigating to: <strong className="text-blue-300">{pendingExternalLink.declared_url || pendingExternalLink.title}</strong>
            </p>

            {/* MANDATED INVARIANT DISCLAIMER */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-5 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Privacy & Proctoring Notice
              </div>
              <p className="leading-relaxed">
                <em>"Chronos page hidden while viewing external resource. Destination cannot be verified."</em>
              </p>
              <p className="text-[11px] text-amber-200/70">
                Opening an external link will record a resource click event. Return to Chronos immediately after consulting the resource.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPendingExternalLink(null)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[#d3e4f8] text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmOpenExternalLink}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-md"
              >
                Proceed to Resource
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Resource Viewer Preview Modal */}
      {activePreviewResource && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="bg-[#030e17] border border-[rgba(211,228,248,0.18)] rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in">
            {/* Modal Topbar */}
            <div className="px-5 py-3.5 border-b border-[rgba(211,228,248,0.12)] bg-[#051726] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#dcc492]/20 text-[#dcc492] flex items-center justify-center font-bold text-xs shrink-0">
                  {activePreviewResource.is_primary ? "QP" : "RES"}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{activePreviewResource.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-[#d3e4f8]/60">
                    <span>{activePreviewResource.storage_path?.split("/").pop() || "Document"}</span>
                    {activePreviewResource.size_bytes > 0 && (
                      <span>• {formatBytes(activePreviewResource.size_bytes)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleDownload(activePreviewResource, e)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/20 text-[#d3e4f8] hover:text-red-300 transition"
                  title="Close viewer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body: Document / Image Preview */}
            <div className="flex-1 bg-[#01080f] relative overflow-hidden flex items-center justify-center p-2">
              {loadingPreview ? (
                <div className="flex flex-col items-center justify-center gap-2 text-xs text-[#d3e4f8]/60">
                  <svg className="animate-spin h-8 w-8 text-[#dcc492]" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Fetching secure artifact...
                </div>
              ) : previewUrl ? (
                activePreviewResource.storage_path?.endsWith(".pdf") || activePreviewResource.type === "uploaded_pdf" ? (
                  <iframe
                    src={`${previewUrl}#toolbar=1&navpanes=0`}
                    title={activePreviewResource.title}
                    className="w-full h-full rounded border border-[rgba(211,228,248,0.08)] bg-white"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                    <img
                      src={previewUrl}
                      alt={activePreviewResource.title}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
                    />
                  </div>
                )
              ) : (
                <div className="text-xs text-red-400">Failed to render preview. Please use the download option.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
