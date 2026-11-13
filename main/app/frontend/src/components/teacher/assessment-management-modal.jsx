import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchSessionResources,
  uploadSessionResource,
  addExternalLink,
  deleteSessionResource,
} from "../../api/resources.js";
import {
  fetchTeacherSubmissions,
  getSubmissionDownloadUrl,
} from "../../api/answers.js";

const MAX_PRIMARY_PAPERS = 1;
const MAX_SUPPLEMENTARY = 5;
const MAX_EXTERNAL_LINKS = 5;

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDateUtc(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    return `${d.toISOString().replace("T", " ").substring(0, 19)} UTC`;
  } catch {
    return isoStr;
  }
}

export default function AssessmentManagementModal({
  isOpen,
  onClose,
  sessionId,
  token,
  sessionStatus = "DRAFT", // "DRAFT" | "SCHEDULED" | "ACTIVE" | "ENDED" | "EXPIRED"
  studentsList = [],
}) {
  const [activeTab, setActiveTab] = useState("resources"); // "resources" | "submissions"

  // Resources Tab State
  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceActionLoading, setResourceActionLoading] = useState(false);
  const [resourceError, setResourceError] = useState(null);
  const [resourceSuccess, setResourceSuccess] = useState(null);

  // Upload Primary Form State
  const [showUploadPrimary, setShowUploadPrimary] = useState(false);
  const [primaryFile, setPrimaryFile] = useState(null);
  const [primaryTitle, setPrimaryTitle] = useState("");
  const [primaryDesc, setPrimaryDesc] = useState("");
  const [primaryRequired, setPrimaryRequired] = useState(true);

  // Upload Supplementary Form State
  const [showUploadSupp, setShowUploadSupp] = useState(false);
  const [suppFile, setSuppFile] = useState(null);
  const [suppTitle, setSuppTitle] = useState("");
  const [suppDesc, setSuppDesc] = useState("");
  const [suppAllowedFrom, setSuppAllowedFrom] = useState("");
  const [suppAllowedUntil, setSuppAllowedUntil] = useState("");

  // Add External Link Form State
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [linkDomain, setLinkDomain] = useState("");
  const [linkRequired, setLinkRequired] = useState(false);
  const [linkAllowedFrom, setLinkAllowedFrom] = useState("");
  const [linkAllowedUntil, setLinkAllowedUntil] = useState("");

  // Submissions Tab State
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState("ALL");
  const [viewingTypedSubmission, setViewingTypedSubmission] = useState(null);

  const isSessionStarted = ["ACTIVE", "ENDED", "EXPIRED"].includes(sessionStatus);
  const isMountedRef = useRef(true);

  // Fetch Resources
  const loadResources = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (isMountedRef.current) setLoadingResources(true);
      const items = await fetchSessionResources(sessionId, token);
      if (isMountedRef.current) {
        setResources(items || []);
        setResourceError(null);
      }
    } catch (err) {
      if (isMountedRef.current) setResourceError(err.message || "Failed to load resources");
    } finally {
      if (isMountedRef.current) setLoadingResources(false);
    }
  }, [sessionId, token]);

  // Fetch Submissions
  const loadSubmissions = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (isMountedRef.current) setLoadingSubmissions(true);
      const list = await fetchTeacherSubmissions(sessionId, token);
      if (isMountedRef.current) {
        setSubmissions(list || []);
      }
    } catch (err) {
      console.warn("Failed to load submissions for teacher review:", err);
    } finally {
      if (isMountedRef.current) setLoadingSubmissions(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      loadResources();
      loadSubmissions();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen, loadResources, loadSubmissions]);

  // Upload Primary Question Paper Handler
  const handleUploadPrimary = async (e) => {
    e.preventDefault();
    if (!primaryFile) {
      setResourceError("Please select a file for the primary question paper");
      return;
    }
    setResourceActionLoading(true);
    setResourceError(null);

    try {
      const formData = new FormData();
      formData.append("file", primaryFile);
      formData.append("title", primaryTitle.trim() || primaryFile.name);
      if (primaryDesc.trim()) formData.append("description", primaryDesc.trim());
      formData.append("is_primary", "true");
      formData.append("required", primaryRequired ? "true" : "false");

      await uploadSessionResource(sessionId, formData, token);
      setResourceSuccess("Primary Question Paper published successfully!");
      setShowUploadPrimary(false);
      setPrimaryFile(null);
      setPrimaryTitle("");
      setPrimaryDesc("");
      await loadResources();
    } catch (err) {
      setResourceError(err.message || "Failed to publish primary question paper");
    } finally {
      if (isMountedRef.current) setResourceActionLoading(false);
    }
  };

  // Upload Supplementary Resource Handler
  const handleUploadSupplementary = async (e) => {
    e.preventDefault();
    if (!suppFile) {
      setResourceError("Please select a supplementary file");
      return;
    }
    setResourceActionLoading(true);
    setResourceError(null);

    try {
      const formData = new FormData();
      formData.append("file", suppFile);
      formData.append("title", suppTitle.trim() || suppFile.name);
      if (suppDesc.trim()) formData.append("description", suppDesc.trim());
      formData.append("is_primary", "false");
      if (suppAllowedFrom) formData.append("allowed_from", new Date(suppAllowedFrom).toISOString());
      if (suppAllowedUntil) formData.append("allowed_until", new Date(suppAllowedUntil).toISOString());

      await uploadSessionResource(sessionId, formData, token);
      setResourceSuccess("Supplementary resource uploaded successfully!");
      setShowUploadSupp(false);
      setSuppFile(null);
      setSuppTitle("");
      setSuppDesc("");
      setSuppAllowedFrom("");
      setSuppAllowedUntil("");
      await loadResources();
    } catch (err) {
      setResourceError(err.message || "Failed to upload supplementary resource");
    } finally {
      if (isMountedRef.current) setResourceActionLoading(false);
    }
  };

  // Add Declared External Link Handler
  const handleAddExternalLink = async (e) => {
    e.preventDefault();
    if (!linkUrl || !linkUrl.startsWith("https://")) {
      setResourceError("External link must start with https://");
      return;
    }
    setResourceActionLoading(true);
    setResourceError(null);

    try {
      let domain = linkDomain.trim();
      if (!domain) {
        try {
          domain = new URL(linkUrl).hostname;
        } catch {
          domain = "";
        }
      }

      const payload = {
        title: linkTitle.trim() || domain || linkUrl,
        description: linkDesc.trim() || null,
        declared_url: linkUrl.trim(),
        allowed_domain: domain || null,
        required: linkRequired,
        allowed_from: linkAllowedFrom ? new Date(linkAllowedFrom).toISOString() : null,
        allowed_until: linkAllowedUntil ? new Date(linkAllowedUntil).toISOString() : null,
      };

      await addExternalLink(sessionId, payload, token);
      setResourceSuccess("Declared external link added successfully!");
      setShowAddLink(false);
      setLinkUrl("");
      setLinkTitle("");
      setLinkDesc("");
      setLinkDomain("");
      setLinkAllowedFrom("");
      setLinkAllowedUntil("");
      await loadResources();
    } catch (err) {
      setResourceError(err.message || "Failed to add external link");
    } finally {
      if (isMountedRef.current) setResourceActionLoading(false);
    }
  };

  // Delete Resource Handler
  const handleDeleteResource = async (resourceId, title) => {
    if (isSessionStarted) {
      alert("Cannot delete resources: Assessment session is already active or ended.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete '${title}'?`)) return;

    setResourceActionLoading(true);
    try {
      await deleteSessionResource(sessionId, resourceId, token);
      setResourceSuccess(`Resource '${title}' deleted successfully.`);
      await loadResources();
    } catch (err) {
      setResourceError(err.message || "Failed to delete resource");
    } finally {
      if (isMountedRef.current) setResourceActionLoading(false);
    }
  };

  // Download Submission Artifact
  const handleDownloadSubmission = async (sub) => {
    try {
      const data = await getSubmissionDownloadUrl(sessionId, sub.answer_id, token);
      if (data.download_url) {
        window.open(data.download_url, "_blank", "noopener,noreferrer");
      } else if (data.typed_content) {
        setViewingTypedSubmission({
          studentId: sub.participant_id,
          version: sub.version,
          content: data.typed_content,
          submittedAt: sub.submitted_at,
          contentHash: sub.content_hash,
        });
      }
    } catch (err) {
      alert(err.message || "Failed to retrieve student artifact");
    }
  };

  // Categorize resources & capacity limits
  const primaryPapers = resources.filter((r) => r.is_primary || r.type === "primary_question_paper");
  const supplementaryResources = resources.filter((r) => !r.is_primary && r.type !== "primary_question_paper" && r.type !== "external_link");
  const externalLinks = resources.filter((r) => r.type === "external_link");

  // Submissions live roster mapping
  // Build a roster combining any connected students with submission records
  const allSubmissionsMapped = (() => {
    const map = new Map();
    // 1. First add known students from roster as NOT_SUBMITTED
    studentsList.forEach((st) => {
      const id = st.userId || st.id;
      if (id) {
        map.set(id, {
          participant_id: id,
          displayName: st.userName || st.email || id,
          status: "NOT_SUBMITTED",
          version: "-",
          submitted_at: null,
          content_hash: "-",
          byte_size: 0,
          artifact_type: "-",
          answer_id: null,
        });
      }
    });

    // 2. Overlay actual submissions (keeping latest per student, or all versions)
    submissions.forEach((sub) => {
      const id = sub.participant_id;
      const existing = map.get(id);
      map.set(id, {
        ...sub,
        displayName: existing?.displayName || id,
      });
    });

    return Array.from(map.values());
  })();

  // Filter Submissions
  const filteredSubmissions = allSubmissionsMapped.filter((s) => {
    const matchesSearch =
      (s.participant_id || "").toLowerCase().includes(submissionSearch.toLowerCase()) ||
      (s.displayName || "").toLowerCase().includes(submissionSearch.toLowerCase()) ||
      (s.content_hash || "").toLowerCase().includes(submissionSearch.toLowerCase());

    const matchesStatus =
      submissionStatusFilter === "ALL" || s.status === submissionStatusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!isOpen) return null;

  return (
    <div className="app surface-overlay">
      <div
        className="surface-modal surface-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-modal-title"
      >
        {/* Modal Topbar */}
        <div className="surface-head">
          <div className="surface-head-main">
            <div className="surface-mark surface-mark--forest" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div>
              <div className="surface-head-title-row">
                <h2 className="surface-title" id="assessment-modal-title">Assessment Management</h2>
                <span className={`badge ${isSessionStarted ? "badge-distracted" : "badge-attentive"}`}>
                  Session {sessionStatus}
                </span>
              </div>
              <p className="surface-sub">
                Session ID: <span className="surface-mono">{sessionId}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-btn icon-btn-sm"
            aria-label="Close assessment management"
            title="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="surface-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("resources")}
            className="surface-tab"
            aria-pressed={activeTab === "resources"}
          >
            Publish Resources <b>({resources.length})</b>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("submissions");
              loadSubmissions();
            }}
            className="surface-tab"
            aria-pressed={activeTab === "submissions"}
          >
            Student Submissions <b>({submissions.length})</b>
          </button>
        </div>

        {/* Status Alerts */}
        {resourceSuccess && (
          <div className="notice notice-ok am-alert" role="status">
            <span>{resourceSuccess}</span>
            <button
              type="button"
              onClick={() => setResourceSuccess(null)}
              className="icon-btn icon-btn-sm"
              aria-label="Dismiss success message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {resourceError && (
          <div className="notice notice-flag am-alert" role="alert">
            <span>{resourceError}</span>
            <button
              type="button"
              onClick={() => setResourceError(null)}
              className="icon-btn icon-btn-sm"
              aria-label="Dismiss error message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Immutable Session Lock Warning */}
        {isSessionStarted && activeTab === "resources" && (
          <div className="notice notice-quiet am-alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p>
              <strong>Immutability Invariant Enforced:</strong> Resources are
              locked and immutable after session start. Adding or deleting
              materials is restricted while session is {sessionStatus}.
            </p>
          </div>
        )}

        {/* Modal Body */}
        <div className="surface-body">
          {/* TAB 1: Publish Resources */}
          {activeTab === "resources" && (
            <div className="surface-panel">
              {/* Capacity Header & Action Buttons */}
              <div className="am-capacity">
                <dl>
                  <div>
                    <dt>Primary QP</dt>
                    <dd className={primaryPapers.length >= MAX_PRIMARY_PAPERS ? "is-full" : ""}>
                      {primaryPapers.length}/{MAX_PRIMARY_PAPERS}
                    </dd>
                  </div>
                  <div>
                    <dt>Supplementary</dt>
                    <dd className={supplementaryResources.length >= MAX_SUPPLEMENTARY ? "is-full" : ""}>
                      {supplementaryResources.length}/{MAX_SUPPLEMENTARY}
                    </dd>
                  </div>
                  <div>
                    <dt>External Links</dt>
                    <dd className={externalLinks.length >= MAX_EXTERNAL_LINKS ? "is-full" : ""}>
                      {externalLinks.length}/{MAX_EXTERNAL_LINKS}
                    </dd>
                  </div>
                </dl>

                {!isSessionStarted && (
                  <div className="am-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadPrimary(true);
                        setShowUploadSupp(false);
                        setShowAddLink(false);
                      }}
                      disabled={primaryPapers.length >= MAX_PRIMARY_PAPERS}
                      className="btn btn-ink btn-sm"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      + Primary Paper
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadSupp(true);
                        setShowUploadPrimary(false);
                        setShowAddLink(false);
                      }}
                      disabled={supplementaryResources.length >= MAX_SUPPLEMENTARY}
                      className="btn btn-line btn-sm"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      + Supplementary
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAddLink(true);
                        setShowUploadPrimary(false);
                        setShowUploadSupp(false);
                      }}
                      disabled={externalLinks.length >= MAX_EXTERNAL_LINKS}
                      className="btn btn-line btn-sm"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      + External Link
                    </button>
                  </div>
                )}
              </div>

              {/* Form 1: Upload Primary Paper Form */}
              {showUploadPrimary && (
                <form onSubmit={handleUploadPrimary} className="am-form">
                  <div className="am-form-head">
                    <h4 className="am-form-title">Upload Primary Question Paper</h4>
                    <button type="button" onClick={() => setShowUploadPrimary(false)} className="btn btn-quiet btn-sm">
                      Cancel
                    </button>
                  </div>

                  <div className="surface-fieldset">
                    <div className="surface-grid2">
                      <div className="field">
                        <label htmlFor="primary-title">Title / Exam Name *</label>
                        <input
                          id="primary-title"
                          type="text"
                          required
                          value={primaryTitle}
                          onChange={(e) => setPrimaryTitle(e.target.value)}
                          placeholder="e.g. Final Mathematics Examination 2026"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="primary-file">File (PDF, PNG, JPG up to 20MB) *</label>
                        <input
                          id="primary-file"
                          type="file"
                          required
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(e) => setPrimaryFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="primary-desc">Instructions / Description</label>
                      <textarea
                        id="primary-desc"
                        value={primaryDesc}
                        onChange={(e) => setPrimaryDesc(e.target.value)}
                        placeholder="Optional notes or instructions for students..."
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="am-form-foot">
                    <label className="surface-check">
                      <input
                        type="checkbox"
                        checked={primaryRequired}
                        onChange={(e) => setPrimaryRequired(e.target.checked)}
                      />
                      Mark as required reading for all students
                    </label>

                    <button
                      type="submit"
                      disabled={resourceActionLoading}
                      className="btn btn-ink btn-sm"
                    >
                      {resourceActionLoading ? "Publishing..." : "Publish Question Paper"}
                    </button>
                  </div>
                </form>
              )}

              {/* Form 2: Upload Supplementary Resource Form */}
              {showUploadSupp && (
                <form onSubmit={handleUploadSupplementary} className="am-form">
                  <div className="am-form-head">
                    <h4 className="am-form-title">
                      Upload Supplementary Resource ({supplementaryResources.length}/5)
                    </h4>
                    <button type="button" onClick={() => setShowUploadSupp(false)} className="btn btn-quiet btn-sm">
                      Cancel
                    </button>
                  </div>

                  <div className="surface-fieldset">
                    <div className="surface-grid2">
                      <div className="field">
                        <label htmlFor="supp-title">Resource Title *</label>
                        <input
                          id="supp-title"
                          type="text"
                          required
                          value={suppTitle}
                          onChange={(e) => setSuppTitle(e.target.value)}
                          placeholder="e.g. Formula Sheet / Case Study"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="supp-file">File (PDF, PNG, JPG up to 20MB) *</label>
                        <input
                          id="supp-file"
                          type="file"
                          required
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(e) => setSuppFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>

                    <div className="surface-grid2">
                      <div className="field">
                        <label htmlFor="supp-from">Allowed From (Optional)</label>
                        <input
                          id="supp-from"
                          type="datetime-local"
                          value={suppAllowedFrom}
                          onChange={(e) => setSuppAllowedFrom(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="supp-until">Allowed Until (Optional)</label>
                        <input
                          id="supp-until"
                          type="datetime-local"
                          value={suppAllowedUntil}
                          onChange={(e) => setSuppAllowedUntil(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="am-form-foot">
                    <button
                      type="submit"
                      disabled={resourceActionLoading}
                      className="btn btn-ink btn-sm"
                    >
                      {resourceActionLoading ? "Uploading..." : "Upload Supplementary Resource"}
                    </button>
                  </div>
                </form>
              )}

              {/* Form 3: Add External Link Form */}
              {showAddLink && (
                <form onSubmit={handleAddExternalLink} className="am-form">
                  <div className="am-form-head">
                    <h4 className="am-form-title">
                      Add Declared External Link ({externalLinks.length}/5)
                    </h4>
                    <button type="button" onClick={() => setShowAddLink(false)} className="btn btn-quiet btn-sm">
                      Cancel
                    </button>
                  </div>

                  <div className="surface-fieldset">
                    <div className="surface-grid2">
                      <div className="field">
                        <label htmlFor="link-url">HTTPS Destination URL *</label>
                        <input
                          id="link-url"
                          type="url"
                          required
                          value={linkUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLinkUrl(val);
                            try {
                              if (val.startsWith("https://")) {
                                setLinkDomain(new URL(val).hostname);
                              }
                            } catch {
                              // ignore url parsing error while typing
                            }
                          }}
                          placeholder="https://docs.python.org/3/"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="link-title">Display Title *</label>
                        <input
                          id="link-title"
                          type="text"
                          required
                          value={linkTitle}
                          onChange={(e) => setLinkTitle(e.target.value)}
                          placeholder="e.g. Official Python Standard Documentation"
                        />
                      </div>
                    </div>

                    <div className="surface-grid2">
                      <div className="field">
                        <label htmlFor="link-domain">Allowed Domain Hostname</label>
                        <input
                          id="link-domain"
                          type="text"
                          value={linkDomain}
                          onChange={(e) => setLinkDomain(e.target.value)}
                          placeholder="e.g. docs.python.org"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="link-desc">Description (Optional)</label>
                        <input
                          id="link-desc"
                          type="text"
                          value={linkDesc}
                          onChange={(e) => setLinkDesc(e.target.value)}
                          placeholder="e.g. Authorized language reference"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="am-form-foot">
                    <label className="surface-check">
                      <input
                        type="checkbox"
                        checked={linkRequired}
                        onChange={(e) => setLinkRequired(e.target.checked)}
                      />
                      Mark as required reference
                    </label>

                    <button
                      type="submit"
                      disabled={resourceActionLoading}
                      className="btn btn-ink btn-sm"
                    >
                      {resourceActionLoading ? "Adding..." : "Add External Link"}
                    </button>
                  </div>
                </form>
              )}

              {/* Published Resources List */}
              <div className="surface-section">
                <div className="surface-section-head">
                  <h3 className="surface-label">
                    Published Session Materials ({resources.length})
                  </h3>
                </div>

                {loadingResources ? (
                  <div className="surface-loading">
                    <span className="surface-spin" aria-hidden="true" />
                    Loading materials...
                  </div>
                ) : resources.length === 0 ? (
                  <div className="empty">
                    <h3>No Assessment Materials Published</h3>
                    <p>
                      Upload a Primary Question Paper, Supplementary PDFs/Images,
                      or add External Links before starting the session.
                    </p>
                  </div>
                ) : (
                  <div>
                    {resources.map((r) => {
                      const isPrimary = r.is_primary || r.type === "primary_question_paper";
                      const isExt = r.type === "external_link";
                      return (
                        <div key={r.resource_id} className="am-resource">
                          <div className="surface-row-main">
                            <div className={`surface-mark${isPrimary ? " surface-mark--gold" : ""}`}>
                              {isPrimary ? "QP" : isExt ? "EXT" : "PDF"}
                            </div>

                            <div className="surface-row-copy">
                              <div className="am-resource-title">
                                <h4>{r.title}</h4>
                                {r.required && (
                                  <span className="badge badge-flag">Required</span>
                                )}
                              </div>
                              <div className="am-resource-meta">
                                <span>{isExt ? r.declared_url : r.storage_path?.split("/").pop()}</span>
                                {r.size_bytes > 0 && <span>{formatBytes(r.size_bytes)}</span>}
                                {r.content_hash && (
                                  <span className="surface-mono" title={r.content_hash}>
                                    SHA: {r.content_hash.slice(0, 8)}...
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="surface-row-actions">
                            {!isSessionStarted && (
                              <button
                                type="button"
                                onClick={() => handleDeleteResource(r.resource_id, r.title)}
                                className="icon-btn icon-btn-sm"
                                title="Delete resource"
                                aria-label={`Delete ${r.title}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Student Submissions Review */}
          {activeTab === "submissions" && (
            <div className="surface-panel">
              {/* Filter and Search Bar */}
              <div className="am-toolbar">
                <div className="am-toolbar-fields">
                  <div className="field am-search">
                    <label className="sr-only" htmlFor="submission-search">
                      Search submissions
                    </label>
                    <input
                      id="submission-search"
                      type="text"
                      value={submissionSearch}
                      onChange={(e) => setSubmissionSearch(e.target.value)}
                      placeholder="Search student ID, name, or SHA-256..."
                    />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>

                  <div className="field">
                    <label htmlFor="submission-status">Status</label>
                    <select
                      id="submission-status"
                      value={submissionStatusFilter}
                      onChange={(e) => setSubmissionStatusFilter(e.target.value)}
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="SUBMITTED">SUBMITTED</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="REPLACED">REPLACED</option>
                      <option value="LATE">LATE</option>
                      <option value="NOT_SUBMITTED">NOT_SUBMITTED</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={loadSubmissions}
                  disabled={loadingSubmissions}
                  className="btn btn-line btn-sm"
                >
                  <svg className={loadingSubmissions ? "is-spinning" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Refresh Live
                </button>
              </div>

              {/* Submissions Live Table */}
              <div className="am-table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student ID / Name</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th>Submitted At (UTC)</th>
                      <th>Artifact / Hash</th>
                      <th>Size</th>
                      <th className="num">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSubmissions ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="surface-loading">
                            <span className="surface-spin" aria-hidden="true" />
                            Loading student submissions...
                          </div>
                        </td>
                      </tr>
                    ) : filteredSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty">
                            <h3>No submissions matching criteria.</h3>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredSubmissions.map((s, idx) => {
                        const hasArtifact = s.answer_id && s.status !== "NOT_SUBMITTED";
                        return (
                          <tr key={s.answer_id || `sub-roster-${idx}`}>
                            <td>
                              <div className="strong">{s.displayName || s.participant_id}</div>
                              <div className="surface-meta surface-mono">{s.participant_id}</div>
                            </td>

                            <td>
                              <span
                                className={`badge ${
                                  s.status === "SUBMITTED"
                                    ? "badge-attentive"
                                    : s.status === "LATE"
                                    ? "badge-flag"
                                    : s.status === "DRAFT"
                                    ? "badge-distracted"
                                    : s.status === "REPLACED"
                                    ? ""
                                    : "badge-away"
                                }`.trim()}
                              >
                                {s.status}
                              </span>
                            </td>

                            <td className="num">
                              {s.version && s.version !== "-" ? `v${s.version}` : "-"}
                            </td>

                            <td className="surface-meta">
                              {s.submitted_at ? formatDateUtc(s.submitted_at) : "-"}
                            </td>

                            <td>
                              {s.content_hash && s.content_hash !== "-" ? (
                                <div className="surface-mono truncate am-hash" title={s.content_hash}>
                                  {s.content_hash}
                                </div>
                              ) : (
                                <span className="surface-meta">-</span>
                              )}
                              <div className="surface-meta">{s.artifact_type || "-"}</div>
                            </td>

                            <td className="num">
                              {s.byte_size ? formatBytes(s.byte_size) : "-"}
                            </td>

                            <td className="num">
                              {hasArtifact ? (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadSubmission(s)}
                                  className="btn btn-line btn-sm"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Artifact
                                </button>
                              ) : (
                                <span className="surface-meta">No File</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Typed Submission View Modal */}
      {viewingTypedSubmission && (
        <div className="app surface-overlay surface-overlay--stacked">
          <div
            className="surface-modal surface-modal--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="typed-answer-title"
          >
            <div className="surface-head">
              <div>
                <h3 className="surface-title" id="typed-answer-title">
                  Typed Answer — Student {viewingTypedSubmission.studentId}
                </h3>
                <p className="surface-sub surface-mono">
                  Version {viewingTypedSubmission.version} •{" "}
                  {formatDateUtc(viewingTypedSubmission.submittedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingTypedSubmission(null)}
                className="icon-btn icon-btn-sm"
                aria-label="Close typed answer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="surface-body">
              <pre className="am-typed">{viewingTypedSubmission.content}</pre>

              {viewingTypedSubmission.contentHash && (
                <p className="surface-note surface-mono">
                  SHA-256: {viewingTypedSubmission.contentHash}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
