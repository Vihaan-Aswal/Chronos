// src/components/student/student-context-modal.jsx
// Workstream W7: Student Context & Structured Appeals Modal

import { useState } from "react";

const CANONICAL_CATEGORIES = [
  {
    id: "CAMERA_LIGHTING_DEVICE",
    label: "Camera, lighting, or device problem",
    description: "Camera feed stuttered, permission prompt issue, low room lighting, or device lag.",
  },
  {
    id: "NETWORK_CONNECTIVITY",
    label: "Network or connectivity problem",
    description: "WiFi dropped, high latency/ping, or connection re-establishing.",
  },
  {
    id: "SIGNAL_MISMATCH",
    label: "Signal did not reflect my participation",
    description: "Looking at physical desk notes, multi-monitor setup, or working on paper.",
  },
  {
    id: "DECLARED_RESOURCE_USE",
    label: "Expected activity or declared-resource use",
    description: "Navigating permitted exam papers, formulas, or supplementary PDFs.",
  },
  {
    id: "ACCESSIBILITY_ACCOMMODATION",
    label: "Accessibility or accommodation path",
    description: "Ergonomic posture adjustments, approved assistive tools, or non-visual interaction.",
  },
  {
    id: "IDENTITY_VERIFICATION_ISSUE",
    label: "Identity verification problem",
    description: "Lighting change or camera angle caused verification uncertainty.",
  },
  {
    id: "OTHER",
    label: "Other",
    description: "General context or non-disruptive room environment factor.",
  },
];

export default function StudentContextModal({
  isOpen,
  onClose,
  sessionId,
  attachedEventIds = [],
  onContextSubmitted,
}) {
  const [selectedCategory, setSelectedCategory] = useState("CAMERA_LIGHTING_DEVICE");
  const [explanationText, setExplanationText] = useState("");
  const [requestedHelp, setRequestedHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    let token = "";
    try {
      const raw = sessionStorage.getItem("chronos_user");
      if (raw) {
        const u = JSON.parse(raw);
        token = u?.token || u?.access_token || "";
      }
    } catch {
      token = "";
    }

    const payload = {
      appeal_category: selectedCategory,
      explanation_text: explanationText.trim() || null,
      requested_help: requestedHelp,
      attached_to_event_ids: attachedEventIds,
    };

    const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
    const targetSessionId = sessionId && sessionId !== "default-session" ? sessionId : "ses-default";

    try {
      const res = await fetch(`${BASE}/api/v1/sessions/${targetSessionId}/context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to submit context");
      }

      setSubmittedSuccess(true);
      if (onContextSubmitted) {
        onContextSubmitted(payload);
      }
      setTimeout(() => {
        setSubmittedSuccess(false);
        setExplanationText("");
        setRequestedHelp(false);
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="context-modal-title"
    >
      <div className="relative w-full max-w-lg bg-[#1a1c1e] text-slate-100 rounded-2xl border border-[#dcc492]/20 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#212429]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#dcc492]/10 border border-[#dcc492]/30 flex items-center justify-center text-[#dcc492]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 id="context-modal-title" className="text-base font-semibold text-white">
                Add Session Context / Request Help
              </h2>
              <p className="text-xs text-slate-400">
                Annotate session timeline with structured explanations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        {submittedSuccess ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Context Added</h3>
            <p className="text-xs text-slate-400">
              Your note has been attached to the session timeline.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-950/60 border border-red-500/30 rounded-xl text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            {/* Category Select */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Context Category
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {CANONICAL_CATEGORIES.map((cat) => (
                  <label
                    key={cat.id}
                    className={`flex items-start gap-3 p-2.5 rounded-xl border transition cursor-pointer text-left ${
                      selectedCategory === cat.id
                        ? "bg-[#dcc492]/10 border-[#dcc492]/50 text-white"
                        : "bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="appeal_category"
                      value={cat.id}
                      checked={selectedCategory === cat.id}
                      onChange={() => setSelectedCategory(cat.id)}
                      className="mt-0.5 text-[#dcc492] focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-medium">{cat.label}</div>
                      <div className="text-[11px] text-slate-400">{cat.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Explanation Note */}
            <div>
              <label htmlFor="explanation_text" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Optional Brief Explanation
              </label>
              <textarea
                id="explanation_text"
                rows={2}
                maxLength={300}
                value={explanationText}
                onChange={(e) => setExplanationText(e.target.value)}
                placeholder="Briefly describe what happened (e.g. webcam cord loosened, looked down at paper formula sheet)..."
                className="w-full bg-[#111315] border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#dcc492]/60 resize-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                <strong className="text-amber-300/90 font-medium">Privacy Note:</strong> Chronos does not collect medical or diagnosis details. For physical accommodations, choose &ldquo;Accessibility or accommodation path&rdquo;.
              </p>
            </div>

            {/* Immediate Help Checkbox */}
            <div className="p-3 bg-[#dcc492]/5 border border-[#dcc492]/20 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-white">Request Immediate Teacher Help</div>
                <div className="text-[11px] text-slate-400">
                  Elevates task into teacher&apos;s active triage queue during class
                </div>
              </div>
              <input
                type="checkbox"
                id="requested_help"
                checked={requestedHelp}
                onChange={(e) => setRequestedHelp(e.target.checked)}
                className="w-4 h-4 rounded text-[#dcc492] focus:ring-0 bg-[#111315] border-white/20"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#dcc492] text-[#1a1c1e] hover:bg-[#ebd7ad] transition shadow-md disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Attach Context"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
