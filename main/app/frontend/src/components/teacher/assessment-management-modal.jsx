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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in">
      <div className="bg-[#030e17] border border-[rgba(211,228,248,0.18)] rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Topbar */}
        <div className="px-6 py-4 border-b border-[rgba(211,228,248,0.12)] bg-[#051726] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#dcc492]/15 border border-[#dcc492]/30 flex items-center justify-center text-[#dcc492]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Assessment Management</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isSessionStarted ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                }`}>
                  Session {sessionStatus}
                </span>
              </div>
              <p className="text-xs text-[#d3e4f8]/60">Session ID: <span className="font-mono text-white/80">{sessionId}</span></p>
            </div>
          </div>

          {/* Tab Switcher & Close */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/[0.05] p-1 rounded-xl border border-[rgba(211,228,248,0.08)]">
              <button
                type="button"
                onClick={() => setActiveTab("resources")}
                className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition ${
                  activeTab === "resources"
                    ? "bg-[#dcc492] text-[#020e18] shadow-sm"
                    : "text-[#d3e4f8]/70 hover:text-white"
                }`}
              >
                Publish Resources ({resources.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("submissions");
                  loadSubmissions();
                }}
                className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition ${
                  activeTab === "submissions"
                    ? "bg-[#7eb2ff] text-[#020e18] shadow-sm"
                    : "text-[#d3e4f8]/70 hover:text-white"
                }`}
              >
                Student Submissions ({submissions.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#d3e4f8]/70 hover:text-white transition"
              title="Close modal"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {resourceSuccess && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-6 py-2.5 text-emerald-300 text-xs flex items-center justify-between">
            <span>✓ {resourceSuccess}</span>
            <button onClick={() => setResourceSuccess(null)} className="hover:text-white font-bold">✕</button>
          </div>
        )}

        {resourceError && (
          <div className="bg-red-500/15 border-b border-red-500/30 px-6 py-2.5 text-red-300 text-xs flex items-center justify-between">
            <span>! {resourceError}</span>
            <button onClick={() => setResourceError(null)} className="hover:text-white font-bold">✕</button>
          </div>
        )}

        {/* Immutable Session Lock Warning */}
        {isSessionStarted && activeTab === "resources" && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-2.5 text-amber-200 text-xs flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span><strong>Immutability Invariant Enforced:</strong> Resources are locked and immutable after session start. Adding or deleting materials is restricted while session is {sessionStatus}.</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#020a12] text-[#d3e4f8]">
          {/* TAB 1: Publish Resources */}
          {activeTab === "resources" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Capacity Header & Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-[rgba(211,228,248,0.08)]">
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#d3e4f8]/50">Primary QP:</span>
                    <span className={`font-bold ${primaryPapers.length >= MAX_PRIMARY_PAPERS ? "text-amber-400" : "text-white"}`}>
                      {primaryPapers.length}/{MAX_PRIMARY_PAPERS}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#d3e4f8]/50">Supplementary:</span>
                    <span className={`font-bold ${supplementaryResources.length >= MAX_SUPPLEMENTARY ? "text-amber-400" : "text-white"}`}>
                      {supplementaryResources.length}/{MAX_SUPPLEMENTARY}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#d3e4f8]/50">External Links:</span>
                    <span className={`font-bold ${externalLinks.length >= MAX_EXTERNAL_LINKS ? "text-amber-400" : "text-white"}`}>
                      {externalLinks.length}/{MAX_EXTERNAL_LINKS}
                    </span>
                  </div>
                </div>

                {!isSessionStarted && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUploadPrimary(true);
                        setShowUploadSupp(false);
                        setShowAddLink(false);
                      }}
                      disabled={primaryPapers.length >= MAX_PRIMARY_PAPERS}
                      className="px-3 py-1.5 rounded-xl bg-[#dcc492] hover:bg-[#ebd5a7] disabled:opacity-40 text-[#020e18] text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs font-medium transition flex items-center gap-1.5 border border-white/10"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 disabled:opacity-40 text-xs font-medium transition flex items-center gap-1.5 border border-blue-500/30"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <form onSubmit={handleUploadPrimary} className="p-5 rounded-2xl bg-[#051726] border border-[#dcc492]/40 shadow-xl space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-[rgba(211,228,248,0.1)]">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#dcc492]" />
                      Upload Primary Question Paper
                    </h4>
                    <button type="button" onClick={() => setShowUploadPrimary(false)} className="text-xs text-[#d3e4f8]/50 hover:text-white">Cancel</button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Title / Exam Name *</label>
                      <input
                        type="text"
                        required
                        value={primaryTitle}
                        onChange={(e) => setPrimaryTitle(e.target.value)}
                        placeholder="e.g. Final Mathematics Examination 2026"
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-[#dcc492]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">File (PDF, PNG, JPG up to 20MB) *</label>
                      <input
                        type="file"
                        required
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => setPrimaryFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-[#d3e4f8]/70 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#dcc492] file:text-[#020e18] hover:file:bg-[#ebd5a7] cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1">Instructions / Description</label>
                    <textarea
                      value={primaryDesc}
                      onChange={(e) => setPrimaryDesc(e.target.value)}
                      placeholder="Optional notes or instructions for students..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-[#dcc492] resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs text-[#d3e4f8]/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primaryRequired}
                        onChange={(e) => setPrimaryRequired(e.target.checked)}
                        className="rounded border-[rgba(211,228,248,0.2)] text-[#dcc492] focus:ring-0"
                      />
                      Mark as required reading for all students
                    </label>

                    <button
                      type="submit"
                      disabled={resourceActionLoading}
                      className="px-4 py-2 rounded-xl bg-[#dcc492] hover:bg-[#ebd5a7] text-[#020e18] text-xs font-bold transition shadow-md disabled:opacity-50"
                    >
                      {resourceActionLoading ? "Publishing..." : "Publish Question Paper"}
                    </button>
                  </div>
                </form>
              )}

              {/* Form 2: Upload Supplementary Resource Form */}
              {showUploadSupp && (
                <form onSubmit={handleUploadSupplementary} className="p-5 rounded-2xl bg-[#051726] border border-indigo-500/40 shadow-xl space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-[rgba(211,228,248,0.1)]">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      Upload Supplementary Resource ({supplementaryResources.length}/5)
                    </h4>
                    <button type="button" onClick={() => setShowUploadSupp(false)} className="text-xs text-[#d3e4f8]/50 hover:text-white">Cancel</button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Resource Title *</label>
                      <input
                        type="text"
                        required
                        value={suppTitle}
                        onChange={(e) => setSuppTitle(e.target.value)}
                        placeholder="e.g. Formula Sheet / Case Study"
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">File (PDF, PNG, JPG up to 20MB) *</label>
                      <input
                        type="file"
                        required
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => setSuppFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-[#d3e4f8]/70 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Allowed From (Optional)</label>
                      <input
                        type="datetime-local"
                        value={suppAllowedFrom}
                        onChange={(e) => setSuppAllowedFrom(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Allowed Until (Optional)</label>
                      <input
                        type="datetime-local"
                        value={suppAllowedUntil}
                        onChange={(e) => setSuppAllowedUntil(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={resourceActionLoading}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md disabled:opacity-50"
                    >
                      {resourceActionLoading ? "Uploading..." : "Upload Supplementary Resource"}
                    </button>
                  </div>
                </form>
              )}

              {/* Form 3: Add External Link Form */}
              {showAddLink && (
                <form onSubmit={handleAddExternalLink} className="p-5 rounded-2xl bg-[#051726] border border-blue-500/40 shadow-xl space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-[rgba(211,228,248,0.1)]">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      Add Declared External Link ({externalLinks.length}/5)
                    </h4>
                    <button type="button" onClick={() => setShowAddLink(false)} className="text-xs text-[#d3e4f8]/50 hover:text-white">Cancel</button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">HTTPS Destination URL *</label>
                      <input
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
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Display Title *</label>
                      <input
                        type="text"
                        required
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                        placeholder="e.g. Official Python Standard Documentation"
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Allowed Domain Hostname</label>
                      <input
                        type="text"
                        value={linkDomain}
                        onChange={(e) => setLinkDomain(e.target.value)}
                        placeholder="e.g. docs.python.org"
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-blue-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/80 mb-1">Description (Optional)</label>
                      <input
                        type="text"
                        value={linkDesc}
                        onChange={(e) => setLinkDesc(e.target.value)}
                        placeholder="e.g. Authorized language reference"
                        className="w-full px-3 py-2 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.15)] text-white text-xs outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs text-[#d3e4f8]/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={linkRequired}
                        onChange={(e) => setLinkRequired(e.target.checked)}
                        className="rounded border-[rgba(211,228,248,0.2)] text-blue-500 focus:ring-0"
                      />
                      Mark as required reference
                    </label>

                    <button
                      type="submit"
                      disabled={resourceActionLoading}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md disabled:opacity-50"
                    >
                      {resourceActionLoading ? "Adding..." : "Add External Link"}
                    </button>
                  </div>
                </form>
              )}

              {/* Published Resources List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d3e4f8]/70">
                  Published Session Materials ({resources.length})
                </h3>

                {loadingResources ? (
                  <div className="text-center py-10 text-xs text-[#d3e4f8]/60">Loading materials...</div>
                ) : resources.length === 0 ? (
                  <div className="text-center py-12 px-4 bg-white/[0.02] rounded-2xl border border-dashed border-[rgba(211,228,248,0.1)] text-xs text-[#d3e4f8]/50">
                    <p className="font-semibold text-white/80 mb-1">No Assessment Materials Published</p>
                    <p>Upload a Primary Question Paper, Supplementary PDFs/Images, or add External Links before starting the session.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {resources.map((r) => {
                      const isPrimary = r.is_primary || r.type === "primary_question_paper";
                      const isExt = r.type === "external_link";
                      return (
                        <div
                          key={r.resource_id}
                          className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition ${
                            isPrimary
                              ? "bg-[#dcc492]/10 border-[#dcc492]/40"
                              : isExt
                              ? "bg-blue-500/[0.04] border-blue-400/20"
                              : "bg-white/[0.03] border-[rgba(211,228,248,0.08)]"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isPrimary
                                ? "bg-[#dcc492] text-[#020e18]"
                                : isExt
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-indigo-500/20 text-indigo-300"
                            }`}>
                              {isPrimary ? "QP" : isExt ? "EXT" : "PDF"}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-white truncate">{r.title}</h4>
                                {r.required && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30">
                                    Required
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-[#d3e4f8]/60 font-mono mt-0.5 truncate">
                                <span>{isExt ? r.declared_url : r.storage_path?.split("/").pop()}</span>
                                {r.size_bytes > 0 && <span>• {formatBytes(r.size_bytes)}</span>}
                                {r.content_hash && (
                                  <span className="truncate max-w-[140px]" title={r.content_hash}>• SHA: {r.content_hash.slice(0, 8)}...</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {!isSessionStarted && (
                              <button
                                type="button"
                                onClick={() => handleDeleteResource(r.resource_id, r.title)}
                                className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-300 text-xs font-medium transition"
                                title="Delete resource"
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
            <div className="space-y-4">
              {/* Filter and Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-[rgba(211,228,248,0.08)]">
                <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={submissionSearch}
                      onChange={(e) => setSubmissionSearch(e.target.value)}
                      placeholder="Search student ID, name, or SHA-256..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.12)] text-xs text-white placeholder-[#d3e4f8]/30 outline-none focus:border-[#7eb2ff]"
                    />
                    <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#d3e4f8]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>

                  <select
                    value={submissionStatusFilter}
                    onChange={(e) => setSubmissionStatusFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.12)] text-xs text-white outline-none focus:border-[#7eb2ff]"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SUBMITTED">SUBMITTED</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="REPLACED">REPLACED</option>
                    <option value="LATE">LATE</option>
                    <option value="NOT_SUBMITTED">NOT_SUBMITTED</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={loadSubmissions}
                  disabled={loadingSubmissions}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <svg className={`w-3.5 h-3.5 ${loadingSubmissions ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Refresh Live
                </button>
              </div>

              {/* Submissions Live Table */}
              <div className="rounded-2xl border border-[rgba(211,228,248,0.1)] overflow-hidden bg-white/[0.01]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/[0.04] border-b border-[rgba(211,228,248,0.08)] text-[#d3e4f8]/70 text-[11px] font-mono uppercase tracking-wider">
                      <th className="py-3 px-4">Student ID / Name</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Version</th>
                      <th className="py-3 px-3">Submitted At (UTC)</th>
                      <th className="py-3 px-3">Artifact / Hash</th>
                      <th className="py-3 px-3">Size</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(211,228,248,0.06)]">
                    {loadingSubmissions ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-xs text-[#d3e4f8]/50">Loading student submissions...</td>
                      </tr>
                    ) : filteredSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-xs text-[#d3e4f8]/50">No submissions matching criteria.</td>
                      </tr>
                    ) : (
                      filteredSubmissions.map((s, idx) => {
                        const hasArtifact = s.answer_id && s.status !== "NOT_SUBMITTED";
                        return (
                          <tr key={s.answer_id || `sub-roster-${idx}`} className="hover:bg-white/[0.02] transition">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white truncate max-w-[180px]">{s.displayName || s.participant_id}</div>
                              <div className="text-[10px] text-[#d3e4f8]/50 font-mono">{s.participant_id}</div>
                            </td>

                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                s.status === "SUBMITTED"
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : s.status === "LATE"
                                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                  : s.status === "DRAFT"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : s.status === "REPLACED"
                                  ? "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                                  : "bg-white/5 text-white/40"
                              }`}>
                                {s.status}
                              </span>
                            </td>

                            <td className="py-3 px-3 font-mono font-bold text-white/90">
                              {s.version && s.version !== "-" ? `v${s.version}` : "-"}
                            </td>

                            <td className="py-3 px-3 text-[11px] font-mono text-[#d3e4f8]/70">
                              {s.submitted_at ? formatDateUtc(s.submitted_at) : "-"}
                            </td>

                            <td className="py-3 px-3 font-mono text-[11px]">
                              {s.content_hash && s.content_hash !== "-" ? (
                                <div className="truncate max-w-[150px] text-[#7eb2ff]" title={s.content_hash}>
                                  {s.content_hash}
                                </div>
                              ) : (
                                <span className="text-[#d3e4f8]/40">-</span>
                              )}
                              <div className="text-[10px] text-[#d3e4f8]/50">{s.artifact_type || "-"}</div>
                            </td>

                            <td className="py-3 px-3 font-mono text-[11px] text-[#d3e4f8]/70">
                              {s.byte_size ? formatBytes(s.byte_size) : "-"}
                            </td>

                            <td className="py-3 px-4 text-right">
                              {hasArtifact ? (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadSubmission(s)}
                                  className="px-2.5 py-1 rounded-lg bg-[#7eb2ff]/15 hover:bg-[#7eb2ff]/25 text-[#7eb2ff] text-xs font-semibold transition border border-[#7eb2ff]/30 inline-flex items-center gap-1"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Artifact
                                </button>
                              ) : (
                                <span className="text-[10px] text-[#d3e4f8]/30 italic">No File</span>
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
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#030e17] border border-[rgba(211,228,248,0.2)] rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(211,228,248,0.1)] mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Typed Answer — Student {viewingTypedSubmission.studentId}</h3>
                <p className="text-[11px] text-[#d3e4f8]/60 font-mono">
                  Version {viewingTypedSubmission.version} • {formatDateUtc(viewingTypedSubmission.submittedAt)}
                </p>
              </div>
              <button
                onClick={() => setViewingTypedSubmission(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 rounded-xl bg-[#01080f] border border-[rgba(211,228,248,0.08)] font-mono text-xs text-white whitespace-pre-wrap leading-relaxed">
              {viewingTypedSubmission.content}
            </div>

            {viewingTypedSubmission.contentHash && (
              <div className="mt-3 text-[10px] font-mono text-[#d3e4f8]/60 truncate">
                SHA-256: <span className="text-[#7eb2ff]">{viewingTypedSubmission.contentHash}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
