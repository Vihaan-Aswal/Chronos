import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveAnswerDraft,
  submitTypedAnswer,
  submitFileAnswer,
  fetchMySubmissions,
  getSubmissionDownloadUrl,
} from "../../api/answers.js";

const MAX_SUBMISSIONS = 3;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

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

export default function AnswerSubmissionPanel({
  sessionId,
  token,
  className = "",
}) {
  const [activeTab, setActiveTab] = useState("typed"); // "typed" | "file" | "history"

  // Typed Answer State
  const [typedContent, setTypedContent] = useState("");
  const [draftStatus, setDraftStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const debounceTimerRef = useRef(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const fileInputRef = useRef(null);

  // Submission History State
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Confirmation Modal State (Before replacing a submitted version)
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [pendingSubmissionType, setPendingSubmissionType] = useState(null); // "typed" | "file"

  const isMountedRef = useRef(true);

  // Load submissions history
  const loadSubmissions = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (isMountedRef.current) setLoadingSubmissions(true);
      const list = await fetchMySubmissions(sessionId, token);
      if (isMountedRef.current) {
        setSubmissions(list || []);
        // If there is a draft in history and typedContent is empty, populate it
        const draft = (list || []).find((s) => s.status === "DRAFT" && s.typed_content);
        if (draft && !typedContent) {
          setTypedContent(draft.typed_content);
          if (draft.submitted_at) {
            setDraftSavedAt(new Date(draft.submitted_at).toLocaleTimeString());
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load submissions:", err);
    } finally {
      if (isMountedRef.current) setLoadingSubmissions(false);
    }
  }, [sessionId, token, typedContent]);

  useEffect(() => {
    isMountedRef.current = true;
    loadSubmissions();
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [loadSubmissions]);

  // Handle Typed Content Change & Auto-Save Debounce (2s)
  const handleTypedContentChange = (e) => {
    const text = e.target.value;
    setTypedContent(text);
    setDraftStatus("unsaved");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (!sessionId || !text.trim()) return;
      try {
        setDraftStatus("saving");
        await saveAnswerDraft(sessionId, text, token);
        if (isMountedRef.current) {
          setDraftStatus("saved");
          const nowStr = new Date().toLocaleTimeString();
          setDraftSavedAt(nowStr);
        }
      } catch (err) {
        console.warn("Draft auto-save error:", err);
        if (isMountedRef.current) setDraftStatus("error");
      }
    }, 2000);
  };

  // Filter valid submitted versions (v1, v2, v3)
  const submittedVersions = submissions.filter(
    (s) => (s.status === "SUBMITTED" || s.status === "REPLACED" || s.status === "LATE") && (s.version || 0) >= 1
  );
  const currentSubmissionCount = submittedVersions.length;
  const isMaxReached = currentSubmissionCount >= MAX_SUBMISSIONS;
  const latestSubmission = submittedVersions.find((s) => s.status === "SUBMITTED" || s.status === "LATE") || submittedVersions[submittedVersions.length - 1];

  // Validate and handle file drop / selection
  const handleFileSelect = (file) => {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const allowedExts = [".pdf", ".png", ".jpg", ".jpeg"];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!allowedExts.includes(ext)) {
      setFileError(`Invalid file format '${ext}'. Allowed: .pdf, .png, .jpg, .jpeg`);
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File size (${formatBytes(file.size)}) exceeds maximum limit of 20MB.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  // Submission Entrypoint: Check if replacement warning is needed
  const initiateSubmit = (type) => {
    setSubmitError(null);
    setSubmitSuccess(null);

    if (isMaxReached) {
      setSubmitError(`Maximum ${MAX_SUBMISSIONS} submissions reached. Further submissions are locked.`);
      return;
    }

    if (type === "typed" && !typedContent.trim()) {
      setSubmitError("Please enter your answer text before submitting.");
      return;
    }

    if (type === "file" && !selectedFile) {
      setSubmitError("Please select a file to submit.");
      return;
    }

    if (currentSubmissionCount > 0) {
      // Prompt confirmation modal for version replacement
      setPendingSubmissionType(type);
      setShowReplaceModal(true);
    } else {
      executeSubmission(type);
    }
  };

  // Execute Submission API call
  const executeSubmission = async (type) => {
    setShowReplaceModal(false);
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (type === "typed") {
        const result = await submitTypedAnswer(
          sessionId,
          {
            typedContent,
            isFinal: true,
            clientSubmissionId: `typed-${Date.now()}`,
          },
          token
        );
        setSubmitSuccess(`Version ${result.version || currentSubmissionCount + 1} submitted successfully!`);
      } else {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("is_final", "true");
        formData.append("client_submission_id", `file-${Date.now()}`);

        const result = await submitFileAnswer(sessionId, formData, token);
        setSubmitSuccess(`Version ${result.version || currentSubmissionCount + 1} (${selectedFile.name}) submitted successfully!`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }

      await loadSubmissions();
    } catch (err) {
      setSubmitError(err.message || "Failed to submit answer.");
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  // Download submitted artifact
  const handleDownloadSubmission = async (sub) => {
    try {
      const data = await getSubmissionDownloadUrl(sessionId, sub.answer_id, token);
      if (data.download_url) {
        window.open(data.download_url, "_blank", "noopener,noreferrer");
      } else if (data.typed_content) {
        const blob = new Blob([data.typed_content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `answer_v${sub.version || 1}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(err.message || "Failed to retrieve submission artifact.");
    }
  };

  // Calculate word and char count
  const charCount = typedContent.length;
  const wordCount = typedContent.trim() ? typedContent.trim().split(/\s+/).length : 0;

  return (
    <div className={`flex flex-col h-full bg-[#051421]/95 text-[#d3e4f8] rounded-2xl border border-[rgba(211,228,248,0.12)] p-4 overflow-y-auto ${className}`}>
      {/* Header with Version Counter */}
      <div className="flex items-center justify-between pb-3 border-b border-[rgba(211,228,248,0.1)] mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#7eb2ff]/15 border border-[#7eb2ff]/30 flex items-center justify-center text-[#7eb2ff]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Answer Submission</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-medium ${isMaxReached ? "text-amber-400 font-bold" : "text-[#7eb2ff]"}`}>
                Version {currentSubmissionCount} of {MAX_SUBMISSIONS}
              </span>
              <span className="text-[#d3e4f8]/50">• Max {MAX_SUBMISSIONS} allowed</span>
            </div>
          </div>
        </div>

        {/* Latest Submission Status Badge */}
        {latestSubmission && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-[rgba(211,228,248,0.12)] text-xs">
            <span className={`w-2 h-2 rounded-full ${
              latestSubmission.status === "LATE" ? "bg-red-500 animate-pulse" : "bg-emerald-400"
            }`} />
            <span className="font-semibold text-white">v{latestSubmission.version}</span>
            <span className={`text-[10px] uppercase font-bold tracking-wider ${
              latestSubmission.status === "LATE" ? "text-red-400" : "text-emerald-400"
            }`}>
              {latestSubmission.status}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.04] rounded-xl border border-[rgba(211,228,248,0.08)] mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("typed")}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "typed"
              ? "bg-[#7eb2ff] text-[#020e18] shadow-sm"
              : "text-[#d3e4f8]/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
          Typed Answer
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("file")}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "file"
              ? "bg-[#7eb2ff] text-[#020e18] shadow-sm"
              : "text-[#d3e4f8]/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          File Upload
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "history"
              ? "bg-[#7eb2ff] text-[#020e18] shadow-sm"
              : "text-[#d3e4f8]/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History ({submittedVersions.length})
        </button>
      </div>

      {/* Success / Error Banners */}
      {submitSuccess && (
        <div className="p-3 mb-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold">✓</span>
            <span>{submitSuccess}</span>
          </div>
          <button onClick={() => setSubmitSuccess(null)} className="text-emerald-300/70 hover:text-emerald-200">✕</button>
        </div>
      )}

      {submitError && (
        <div className="p-3 mb-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold">!</span>
            <span>{submitError}</span>
          </div>
          <button onClick={() => setSubmitError(null)} className="text-red-300/70 hover:text-red-200">✕</button>
        </div>
      )}

      {/* TAB 1: Typed Answer */}
      {activeTab === "typed" && (
        <div className="flex flex-col flex-1 min-h-[320px]">
          {/* Editor Status Bar */}
          <div className="flex items-center justify-between text-[11px] text-[#d3e4f8]/60 mb-2 px-1">
            <div className="flex items-center gap-2">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>{charCount} characters</span>
            </div>

            <div className="flex items-center gap-1.5 font-mono">
              {draftStatus === "saving" && (
                <span className="text-amber-300 flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving draft...
                </span>
              )}
              {draftStatus === "saved" && draftSavedAt && (
                <span className="text-emerald-400">✓ Draft saved at {draftSavedAt}</span>
              )}
              {draftStatus === "unsaved" && (
                <span className="text-[#d3e4f8]/40">Unsaved edits</span>
              )}
              {draftStatus === "error" && (
                <span className="text-red-400">Draft auto-save failed</span>
              )}
            </div>
          </div>

          {/* Clean Text Area */}
          <div className="relative flex-1 mb-3">
            <textarea
              value={typedContent}
              onChange={handleTypedContentChange}
              disabled={isMaxReached || submitting}
              placeholder="Type your essay, code solution, or markdown answer here..."
              className="w-full h-full min-h-[220px] p-3.5 rounded-xl bg-[#020a12] border border-[rgba(211,228,248,0.14)] focus:border-[#7eb2ff] focus:ring-1 focus:ring-[#7eb2ff] text-white placeholder-[#d3e4f8]/30 text-xs font-mono resize-y leading-relaxed outline-none transition disabled:opacity-50"
            />
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-between pt-2 border-t border-[rgba(211,228,248,0.08)]">
            <div className="text-[11px] text-[#d3e4f8]/60">
              {isMaxReached ? (
                <span className="text-amber-400 font-semibold">Submissions locked (Max 3 reached)</span>
              ) : currentSubmissionCount > 0 ? (
                <span>Submitting will replace Version {latestSubmission?.version || currentSubmissionCount}</span>
              ) : (
                <span>First submission (Version 1)</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => initiateSubmit("typed")}
              disabled={isMaxReached || submitting || !typedContent.trim()}
              className="px-4 py-2 rounded-xl bg-[#7eb2ff] hover:bg-[#9cc4ff] disabled:opacity-40 disabled:hover:bg-[#7eb2ff] text-[#020e18] text-xs font-bold transition shadow-md flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Submit Typed Answer (v{currentSubmissionCount + 1})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: File Upload */}
      {activeTab === "file" && (
        <div className="flex flex-col flex-1 min-h-[320px]">
          {/* Dropzone Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => !isMaxReached && fileInputRef.current?.click()}
            className={`flex-1 border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition cursor-pointer mb-4 ${
              selectedFile
                ? "border-[#7eb2ff]/60 bg-[#7eb2ff]/5"
                : "border-[rgba(211,228,248,0.18)] hover:border-[#7eb2ff]/40 bg-white/[0.02]"
            } ${isMaxReached ? "opacity-50 pointer-events-none" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />

            <div className="w-12 h-12 rounded-2xl bg-[#7eb2ff]/10 border border-[#7eb2ff]/20 text-[#7eb2ff] flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-xs font-bold text-white truncate max-w-xs">{selectedFile.name}</p>
                <p className="text-[11px] text-[#7eb2ff] font-mono">{formatBytes(selectedFile.size)}</p>
                <p className="text-[10px] text-[#d3e4f8]/60 mt-2">Click or drop another file to replace</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-white">Click or drag & drop answer file</p>
                <p className="text-[11px] text-[#d3e4f8]/60">Supports PDF, PNG, JPG (up to 20MB)</p>
              </div>
            )}
          </div>

          {fileError && (
            <div className="p-2.5 mb-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
              {fileError}
            </div>
          )}

          {/* Submit Action */}
          <div className="flex items-center justify-between pt-2 border-t border-[rgba(211,228,248,0.08)]">
            <div className="text-[11px] text-[#d3e4f8]/60">
              {isMaxReached ? (
                <span className="text-amber-400 font-semibold">Submissions locked (Max 3 reached)</span>
              ) : currentSubmissionCount > 0 ? (
                <span>Submitting will replace Version {latestSubmission?.version || currentSubmissionCount}</span>
              ) : (
                <span>First submission (Version 1)</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => initiateSubmit("file")}
              disabled={isMaxReached || submitting || !selectedFile}
              className="px-4 py-2 rounded-xl bg-[#7eb2ff] hover:bg-[#9cc4ff] disabled:opacity-40 disabled:hover:bg-[#7eb2ff] text-[#020e18] text-xs font-bold transition shadow-md flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Submit File Answer (v{currentSubmissionCount + 1})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Submission History & Audit Trail */}
      {activeTab === "history" && (
        <div className="flex flex-col flex-1 space-y-3">
          {loadingSubmissions ? (
            <div className="text-center py-10 text-xs text-[#d3e4f8]/60">Loading submissions...</div>
          ) : submittedVersions.length === 0 ? (
            <div className="text-center py-10 px-4 bg-white/[0.02] rounded-xl border border-dashed border-[rgba(211,228,248,0.1)] text-xs text-[#d3e4f8]/50">
              <p className="font-medium text-white/80 mb-1">No Final Submissions Yet</p>
              <p>When you submit a typed answer or upload a file, your version history and cryptographic hashes will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {submittedVersions.map((sub) => {
                const isCurrent = sub.status === "SUBMITTED" || sub.status === "LATE";
                return (
                  <div
                    key={sub.answer_id}
                    className={`p-3.5 rounded-xl border transition ${
                      isCurrent
                        ? "bg-gradient-to-r from-[#7eb2ff]/10 to-transparent border-[#7eb2ff]/40 shadow-sm"
                        : "bg-white/[0.02] border-[rgba(211,228,248,0.08)] opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCurrent ? "bg-[#7eb2ff] text-[#020e18]" : "bg-white/10 text-white/70"
                        }`}>
                          Version {sub.version}
                        </span>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                          sub.status === "SUBMITTED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : sub.status === "LATE"
                            ? "bg-red-500/20 text-red-300 border border-red-500/30"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                        }`}>
                          {sub.status}
                        </span>

                        <span className="text-[11px] text-[#d3e4f8]/60">
                          {sub.artifact_type === "typed_text" ? "Typed Text" : sub.storage_path?.split("/").pop() || "Uploaded File"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDownloadSubmission(sub)}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition"
                        title="Download / View submitted copy"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </button>
                    </div>

                    {/* Metadata & Content Hash */}
                    <div className="space-y-1 text-[10px] font-mono text-[#d3e4f8]/70">
                      <div className="flex items-center gap-2">
                        <span className="text-[#d3e4f8]/40">Timestamp:</span>
                        <span>{formatDateUtc(sub.submitted_at)}</span>
                      </div>

                      {sub.content_hash && (
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[#d3e4f8]/40 shrink-0">SHA-256:</span>
                          <span className="text-[#7eb2ff] truncate" title={sub.content_hash}>
                            {sub.content_hash}
                          </span>
                        </div>
                      )}

                      {sub.byte_size > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[#d3e4f8]/40">Size:</span>
                          <span>{formatBytes(sub.byte_size)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal Before Replacing a Submitted Version */}
      {showReplaceModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#04111d] border border-amber-400/30 rounded-2xl max-w-md w-full p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <h3 className="text-base font-bold text-white text-center mb-2">Replace Submitted Answer?</h3>
            <p className="text-xs text-[#d3e4f8]/80 text-center mb-4 leading-relaxed">
              You currently have <strong className="text-white">Version {latestSubmission?.version || currentSubmissionCount}</strong> marked as your active submission. Submitting now will archive the previous version and record <strong className="text-[#7eb2ff]">Version {currentSubmissionCount + 1} of {MAX_SUBMISSIONS}</strong>.
            </p>

            <div className="p-3 rounded-xl bg-white/[0.04] border border-[rgba(211,228,248,0.1)] text-[11px] text-[#d3e4f8]/70 mb-5 space-y-1">
              <div className="flex justify-between">
                <span>Total Versions Allowed:</span>
                <span className="font-bold text-white">{MAX_SUBMISSIONS}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Attempts:</span>
                <span className="font-bold text-amber-300">{MAX_SUBMISSIONS - currentSubmissionCount - 1}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowReplaceModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[#d3e4f8] text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSubmission(pendingSubmissionType)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#020e18] text-xs font-bold transition shadow-md"
              >
                Confirm & Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
