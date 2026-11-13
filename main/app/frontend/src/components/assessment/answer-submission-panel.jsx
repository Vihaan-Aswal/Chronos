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
    <div className={`ans-panel ${className}`.trim()}>
      {/* Header with Version Counter */}
      <div className="ans-head">
        <div className="surface-head-main">
          <div className="surface-mark surface-mark--gold" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            <h3 className="ans-title">Answer Submission</h3>
            <div className="ans-version">
              <b className={isMaxReached ? "is-full" : undefined}>
                Version {currentSubmissionCount} of {MAX_SUBMISSIONS}
              </b>
              <span> • Max {MAX_SUBMISSIONS} allowed</span>
            </div>
          </div>
        </div>

        {/* Latest Submission Status Badge */}
        {latestSubmission && (
          <div className="ans-latest">
            <span
              className={`dot ${
                latestSubmission.status === "LATE" ? "dot-disengaged" : "dot-attentive"
              }`}
              aria-hidden="true"
            />
            <b>v{latestSubmission.version}</b>
            <span
              className={`badge ${
                latestSubmission.status === "LATE" ? "badge-flag" : "badge-attentive"
              }`}
            >
              {latestSubmission.status}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="ans-tabs">
        <button
          type="button"
          onClick={() => setActiveTab("typed")}
          className="ans-tab"
          aria-pressed={activeTab === "typed"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
          Typed Answer
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("file")}
          className="ans-tab"
          aria-pressed={activeTab === "file"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          File Upload
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className="ans-tab"
          aria-pressed={activeTab === "history"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History ({submittedVersions.length})
        </button>
      </div>

      {/* Success / Error Banners */}
      {submitSuccess && (
        <div className="notice notice-ok ans-banner" role="status">
          <span className="strong" aria-hidden="true">✓</span>
          <span>{submitSuccess}</span>
          <button
            type="button"
            onClick={() => setSubmitSuccess(null)}
            className="btn btn-quiet btn-sm push"
          >
            ✕
          </button>
        </div>
      )}

      {submitError && (
        <div className="notice notice-flag ans-banner" role="alert">
          <span className="strong" aria-hidden="true">!</span>
          <span>{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="btn btn-quiet btn-sm push"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: Typed Answer */}
      {activeTab === "typed" && (
        <div className="surface-panel ans-body">
          {/* Editor Status Bar */}
          <div className="ans-statusbar">
            <div className="row">
              <span>{wordCount} words</span>
              <span aria-hidden="true">•</span>
              <span>{charCount} characters</span>
            </div>

            <div className="row">
              {draftStatus === "saving" && (
                <span className="is-saving">
                  <span className="surface-spin inline-spin" aria-hidden="true" />
                  Saving draft...
                </span>
              )}
              {draftStatus === "saved" && draftSavedAt && (
                <span className="is-saved">✓ Draft saved at {draftSavedAt}</span>
              )}
              {draftStatus === "unsaved" && <span>Unsaved edits</span>}
              {draftStatus === "error" && (
                <span className="is-error">Draft auto-save failed</span>
              )}
            </div>
          </div>

          {/* Clean Text Area */}
          <div className="ans-editor-wrap">
            <textarea
              value={typedContent}
              onChange={handleTypedContentChange}
              disabled={isMaxReached || submitting}
              placeholder="Type your essay, code solution, or markdown answer here..."
              className="ans-editor"
            />
          </div>

          {/* Submit Action */}
          <div className="ans-foot">
            <div>
              {isMaxReached ? (
                <span className="is-locked">Submissions locked (Max 3 reached)</span>
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
              className="btn btn-ink btn-sm"
            >
              {submitting ? (
                <>
                  <span className="surface-spin surface-spin--cream inline-spin" aria-hidden="true" />
                  Submitting...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
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
        <div className="surface-panel ans-body">
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
            className={`ans-drop${selectedFile ? " is-filled" : ""}${isMaxReached ? " is-locked" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              hidden
            />

            <div className="ans-drop-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            {selectedFile ? (
              <>
                <p className="ans-drop-title">{selectedFile.name}</p>
                <p className="ans-drop-meta surface-mono">{formatBytes(selectedFile.size)}</p>
                <p className="ans-drop-meta">Click or drop another file to replace</p>
              </>
            ) : (
              <>
                <p className="ans-drop-title">Click or drag & drop answer file</p>
                <p className="ans-drop-meta">Supports PDF, PNG, JPG (up to 20MB)</p>
              </>
            )}
          </div>

          {fileError && (
            <div className="notice notice-flag ans-banner" role="alert">
              <span>{fileError}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="ans-foot">
            <div>
              {isMaxReached ? (
                <span className="is-locked">Submissions locked (Max 3 reached)</span>
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
              className="btn btn-ink btn-sm"
            >
              {submitting ? (
                <>
                  <span className="surface-spin surface-spin--cream inline-spin" aria-hidden="true" />
                  Uploading...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
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
        <div className="surface-panel ans-body">
          {loadingSubmissions ? (
            <div className="surface-loading">
              <span className="surface-spin" aria-hidden="true" />
              Loading submissions...
            </div>
          ) : submittedVersions.length === 0 ? (
            <div className="empty">
              <h3>No Final Submissions Yet</h3>
              <p>When you submit a typed answer or upload a file, your version history and cryptographic hashes will appear here.</p>
            </div>
          ) : (
            <ul className="ans-history">
              {submittedVersions.map((sub) => {
                const isCurrent = sub.status === "SUBMITTED" || sub.status === "LATE";
                return (
                  <li key={sub.answer_id} className="ans-history-row">
                    <div>
                      <div className="ans-history-head">
                        <span className={`badge ${isCurrent ? "badge-ink" : ""}`}>
                          Version {sub.version}
                        </span>

                        <span
                          className={`badge ${
                            sub.status === "SUBMITTED"
                              ? "badge-attentive"
                              : sub.status === "LATE"
                              ? "badge-flag"
                              : "badge-away"
                          }`}
                        >
                          {sub.status}
                        </span>

                        <span className="surface-meta">
                          {sub.artifact_type === "typed_text" ? "Typed Text" : sub.storage_path?.split("/").pop() || "Uploaded File"}
                        </span>
                      </div>

                      {/* Metadata & Content Hash */}
                      <div className="ans-history-facts">
                        <span>Timestamp: {formatDateUtc(sub.submitted_at)}</span>

                        {sub.content_hash && (
                          <span className="truncate" title={sub.content_hash}>
                            SHA-256: {sub.content_hash}
                          </span>
                        )}

                        {sub.byte_size > 0 && (
                          <span>Size: {formatBytes(sub.byte_size)}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadSubmission(sub)}
                      className="btn btn-line btn-sm"
                      title="Download / View submitted copy"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Confirmation Modal Before Replacing a Submitted Version */}
      {showReplaceModal && (
        <div
          className="surface-overlay surface-overlay--stacked"
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-answer-title"
        >
          <div className="surface-modal surface-modal--narrow">
            <div className="surface-head">
              <div className="surface-head-main">
                <div className="surface-mark surface-mark--gold" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <h3 id="replace-answer-title" className="surface-title">
                    Replace Submitted Answer?
                  </h3>
                </div>
              </div>
            </div>

            <div className="surface-body">
              <p className="surface-meta">
                You currently have <strong>Version {latestSubmission?.version || currentSubmissionCount}</strong> marked as your active submission. Submitting now will archive the previous version and record <strong>Version {currentSubmissionCount + 1} of {MAX_SUBMISSIONS}</strong>.
              </p>

              <dl className="ans-replace-facts">
                <div>
                  <dt>Total Versions Allowed:</dt>
                  <dd>{MAX_SUBMISSIONS}</dd>
                </div>
                <div>
                  <dt>Remaining Attempts:</dt>
                  <dd className="is-warn">{MAX_SUBMISSIONS - currentSubmissionCount - 1}</dd>
                </div>
              </dl>
            </div>

            <div className="surface-actions">
              <button
                type="button"
                onClick={() => setShowReplaceModal(false)}
                className="btn btn-line btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSubmission(pendingSubmissionType)}
                className="btn btn-ink btn-sm"
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
