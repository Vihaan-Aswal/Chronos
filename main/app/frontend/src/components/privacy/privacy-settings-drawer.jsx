import React, { useState, useEffect, useCallback } from "react";
import { CONSENT_CATEGORIES } from "./consent-categories";
import { getMyConsents, withdrawConsent, recordConsent, exportMyData, requestErasure, submitStudentContext } from "../../api/privacy";

export default function PrivacySettingsDrawer({ isOpen, onClose, token, sessionId }) {
  const [activeTab, setActiveTab] = useState("consents"); // consents | context | dsr
  const [consents, setConsents] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Context form state
  const [appealCategory, setAppealCategory] = useState("technical_glitch");
  const [explanationText, setExplanationText] = useState("");
  const [requestedHelp, setRequestedHelp] = useState(false);
  const [submittingContext, setSubmittingContext] = useState(false);

  // DSR export state
  const [exporting, setExporting] = useState(false);

  const loadConsents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMyConsents(token, sessionId);
      const map = {};
      (res.consents || []).forEach((c) => {
        map[c.scope] = c.grant_or_decline === "GRANT" && !c.withdrawn_at;
      });
      setConsents(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    if (isOpen && token) {
      loadConsents();
    }
  }, [isOpen, token, loadConsents]);

  const handleToggleScope = async (scope) => {
    const isGranted = consents[scope] ?? true;
    try {
      setLoading(true);
      if (isGranted) {
        await withdrawConsent(token, { scope, sessionId });
        setMsg({ type: "success", text: `Withdrew consent for ${scope}. Switched to manual fallback.` });
      } else {
        await recordConsent(token, { scope, grant: true, sessionId });
        setMsg({ type: "success", text: `Granted consent for ${scope}.` });
      }
      await loadConsents();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Action failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitContext = async (e) => {
    e.preventDefault();
    if (!explanationText.trim()) return;
    try {
      setSubmittingContext(true);
      await submitStudentContext(token, sessionId, {
        appealCategory,
        explanationText,
        requestedHelp,
      });
      setMsg({ type: "success", text: "Technical context submitted and attached to your session timeline." });
      setExplanationText("");
      setRequestedHelp(false);
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to submit context" });
    } finally {
      setSubmittingContext(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const data = await exportMyData(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chronos_privacy_export_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: "success", text: "Export complete. Downloaded JSON archive." });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (!window.confirm("Are you sure you want to request deletion of all your session records?")) return;
    try {
      setLoading(true);
      const res = await requestErasure(token, { sessionId, reason: "STUDENT_SELF_SERVE_REQUEST" });
      setMsg({ type: "success", text: `Deletion request status: ${res.status}` });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Deletion request failed" });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="surface-overlay surface-overlay--drawer">
      <div className="surface-drawer">
        {/* Header */}
        <div className="surface-head">
          <div className="surface-head-main">
            <div className="surface-mark surface-mark--forest" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h2 className="surface-title">Privacy & Data Controls</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-btn icon-btn-sm"
            aria-label="Close privacy settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="surface-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("consents")}
            className="surface-tab"
            aria-pressed={activeTab === "consents"}
          >
            Consents
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className="surface-tab"
            aria-pressed={activeTab === "context"}
          >
            Add Context
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dsr")}
            className="surface-tab"
            aria-pressed={activeTab === "dsr"}
          >
            My Data & DSR
          </button>
        </div>

        {/* Status Message */}
        {msg && (
          <div
            className={`notice surface-alert ${
              msg.type === "success" ? "notice-ok" : "notice-flag"
            }`}
            role={msg.type === "success" ? "status" : "alert"}
          >
            <span>{msg.text}</span>
          </div>
        )}

        {/* Tab 1: Consents */}
        {activeTab === "consents" && (
          <div className="surface-body surface-panel">
            <p className="surface-note">
              You can withdraw optional consent at any time without penalty. Chronos will gracefully fall back to camera-optional / manual tracking.
            </p>
            {loading && (
              <div className="surface-loading">
                <span className="surface-spin" aria-hidden="true" />
                Updating consent status...
              </div>
            )}
            <div className="surface-section">
              {CONSENT_CATEGORIES.map((cat) => {
                const isChecked = consents[cat.id] ?? true;
                return (
                  <div key={cat.id} className="surface-row">
                    <div className="surface-row-copy">
                      <div className="surface-row-title">{cat.label}</div>
                      <p className="surface-meta">{cat.description}</p>
                    </div>
                    {cat.required ? (
                      <span className="badge badge-distracted">Required</span>
                    ) : (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleToggleScope(cat.id)}
                        className={`btn btn-sm ${isChecked ? "btn-line" : "btn-ink"}`}
                      >
                        {isChecked ? "Granted (Withdraw)" : "Declined (Grant)"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Context / Appeal */}
        {activeTab === "context" && (
          <form onSubmit={handleSubmitContext} className="surface-form">
            <div className="surface-body surface-panel stack">
              <p className="surface-note">
                Provide context for any technical interruptions, camera drops, or room disturbances. Your note will attach directly to the teacher's session timeline.
              </p>

              <div className="field">
                <label htmlFor="privacy-issue-category">Issue Category</label>
                <select
                  id="privacy-issue-category"
                  value={appealCategory}
                  onChange={(e) => setAppealCategory(e.target.value)}
                >
                  <option value="CAMERA_LIGHTING_DEVICE">Camera, lighting, or device problem</option>
                  <option value="NETWORK_CONNECTIVITY">Network or connectivity problem</option>
                  <option value="SIGNAL_MISMATCH">Signal did not reflect my participation</option>
                  <option value="DECLARED_RESOURCE_USE">Expected activity or declared-resource use</option>
                  <option value="ACCESSIBILITY_ACCOMMODATION">Accessibility or accommodation path</option>
                  <option value="IDENTITY_VERIFICATION_ISSUE">Identity verification problem</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="privacy-explanation">Explanation</label>
                <textarea
                  id="privacy-explanation"
                  rows={4}
                  value={explanationText}
                  onChange={(e) => setExplanationText(e.target.value)}
                  placeholder="Describe what happened (e.g., 'Router restarted at 10:15 AM')..."
                />
              </div>

              <label className="surface-check" htmlFor="reqHelp">
                <input
                  type="checkbox"
                  id="reqHelp"
                  checked={requestedHelp}
                  onChange={(e) => setRequestedHelp(e.target.checked)}
                />
                Request teacher assistance or review
              </label>
            </div>

            <div className="surface-actions">
              <button
                type="submit"
                disabled={submittingContext || !explanationText.trim()}
                className="btn btn-ink btn-sm btn-block"
              >
                {submittingContext ? "Submitting..." : "Submit Context Note"}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Data Subject Rights (DSR) */}
        {activeTab === "dsr" && (
          <div className="surface-body surface-panel stack">
            <p className="surface-note">
              Exercise your Data Subject Rights: download a complete personal data export (SAR) or request record erasure.
            </p>

            <div className="surface-section">
              <div className="surface-section-head">
                <span className="surface-label">Subject Access Request (Export)</span>
              </div>
              <p className="surface-meta">
                Download your full personal record archive including consent history, numeric telemetry samples, submissions, and timeline events.
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="btn btn-line btn-sm btn-block"
              >
                {exporting ? "Generating Export..." : "Download Personal JSON Archive"}
              </button>
            </div>

            <div className="surface-section">
              <div className="surface-section-head">
                <span className="surface-label">Right to Erasure (Deletion Request)</span>
              </div>
              <p className="surface-meta">
                Request permanent deletion of all derived observation records, submissions, and temporary identity artifacts.
              </p>
              <button
                type="button"
                onClick={handleDeleteRequest}
                className="btn btn-flag btn-sm btn-block"
              >
                Request Data Deletion
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
