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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-medium">
            <span className="material-symbols-outlined text-emerald-400 text-xl">shield</span>
            <span>Privacy & Data Controls</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 mt-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab("consents")}
            className={`pb-2 px-3 border-b-2 transition-colors ${
              activeTab === "consents" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Consents
          </button>
          <button
            onClick={() => setActiveTab("context")}
            className={`pb-2 px-3 border-b-2 transition-colors ${
              activeTab === "context" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Add Context
          </button>
          <button
            onClick={() => setActiveTab("dsr")}
            className={`pb-2 px-3 border-b-2 transition-colors ${
              activeTab === "dsr" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            My Data & DSR
          </button>
        </div>

        {/* Status Message */}
        {msg && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              msg.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
            }`}
          >
            <span className="material-symbols-outlined text-base shrink-0">info</span>
            <span>{msg.text}</span>
          </div>
        )}

        {/* Tab 1: Consents */}
        {activeTab === "consents" && (
          <div className="mt-4 space-y-4 flex-1 overflow-y-auto">
            <p className="text-xs text-slate-400 leading-relaxed">
              You can withdraw optional consent at any time without penalty. Chronos will gracefully fall back to camera-optional / manual tracking.
            </p>
            {loading && <p className="text-xs text-slate-500">Updating consent status...</p>}
            <div className="space-y-3">
              {CONSENT_CATEGORIES.map((cat) => {
                const isChecked = consents[cat.id] ?? true;
                return (
                  <div
                    key={cat.id}
                    className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200">{cat.label}</span>
                      {cat.required ? (
                        <span className="text-[10px] uppercase font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          Required
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleToggleScope(cat.id)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            isChecked
                              ? "bg-emerald-500/20 text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300"
                              : "bg-slate-700 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-300"
                          }`}
                        >
                          {isChecked ? "Granted (Withdraw)" : "Declined (Grant)"}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">{cat.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Context / Appeal */}
        {activeTab === "context" && (
          <form onSubmit={handleSubmitContext} className="mt-4 space-y-4 flex-1">
            <p className="text-xs text-slate-400">
              Provide context for any technical interruptions, camera drops, or room disturbances. Your note will attach directly to the teacher's session timeline.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Issue Category</label>
              <select
                value={appealCategory}
                onChange={(e) => setAppealCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Explanation</label>
              <textarea
                rows={4}
                value={explanationText}
                onChange={(e) => setExplanationText(e.target.value)}
                placeholder="Describe what happened (e.g., 'Router restarted at 10:15 AM')..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reqHelp"
                checked={requestedHelp}
                onChange={(e) => setRequestedHelp(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 cursor-pointer"
              />
              <label htmlFor="reqHelp" className="text-xs text-slate-300 cursor-pointer">
                Request teacher assistance or review
              </label>
            </div>

            <button
              type="submit"
              disabled={submittingContext || !explanationText.trim()}
              className="w-full py-2.5 rounded-xl text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {submittingContext ? "Submitting..." : "Submit Context Note"}
            </button>
          </form>
        )}

        {/* Tab 3: Data Subject Rights (DSR) */}
        {activeTab === "dsr" && (
          <div className="mt-4 space-y-4 flex-1">
            <p className="text-xs text-slate-400">
              Exercise your Data Subject Rights: download a complete personal data export (SAR) or request record erasure.
            </p>

            <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <span className="material-symbols-outlined text-emerald-400 text-base">download</span>
                <span>Subject Access Request (Export)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Download your full personal record archive including consent history, numeric telemetry samples, submissions, and timeline events.
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="w-full py-2 rounded-lg text-xs font-medium text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                {exporting ? "Generating Export..." : "Download Personal JSON Archive"}
              </button>
            </div>

            <div className="p-4 bg-slate-800/50 border border-rose-500/20 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-rose-400">
                <span className="material-symbols-outlined text-base">delete</span>
                <span>Right to Erasure (Deletion Request)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Request permanent deletion of all derived observation records, submissions, and temporary identity artifacts.
              </p>
              <button
                type="button"
                onClick={handleDeleteRequest}
                className="w-full py-2 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors"
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
