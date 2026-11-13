// src/components/student/student-context-modal.jsx
// Workstream W7: Student Context & Structured Appeals Modal

import { useState, useEffect } from "react";

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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
      className="surface-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="context-modal-title"
    >
      <div className="surface-modal">
        {/* Header */}
        <div className="surface-head">
          <div className="surface-head-main">
            <div className="surface-mark surface-mark--gold" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 id="context-modal-title" className="surface-title">
                Add Session Context / Request Help
              </h2>
              <p className="surface-sub">
                Annotate session timeline with structured explanations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn icon-btn-sm"
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        {submittedSuccess ? (
          <div className="surface-body">
            <div className="notice notice-ok">
              <span className="surface-mark surface-mark--forest" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div>
                <h3 className="surface-row-title">Context Added</h3>
                <p className="surface-meta">
                  Your note has been attached to the session timeline.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="surface-form">
            <div className="surface-body stack">
              {errorMsg && (
                <div className="notice notice-flag" role="alert">
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Category Select */}
              <div className="surface-section">
                <div className="surface-section-head">
                  <span className="surface-label">Context Category</span>
                </div>
                <div className="surface-choice-list">
                  {CANONICAL_CATEGORIES.map((cat) => (
                    <label
                      key={cat.id}
                      className={`surface-choice${selectedCategory === cat.id ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="appeal_category"
                        value={cat.id}
                        checked={selectedCategory === cat.id}
                        onChange={() => setSelectedCategory(cat.id)}
                      />
                      <span>
                        <span className="surface-choice-title">{cat.label}</span>
                        <span className="surface-choice-desc">{cat.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Explanation Note */}
              <div className="field">
                <label htmlFor="explanation_text">
                  Optional Brief Explanation
                </label>
                <textarea
                  id="explanation_text"
                  rows={2}
                  maxLength={300}
                  value={explanationText}
                  onChange={(e) => setExplanationText(e.target.value)}
                  placeholder="Briefly describe what happened (e.g. webcam cord loosened, looked down at paper formula sheet)..."
                />
                <p className="field-hint">
                  <strong>Privacy Note:</strong> Chronos does not collect medical or diagnosis details. For physical accommodations, choose &ldquo;Accessibility or accommodation path&rdquo;.
                </p>
              </div>

              {/* Immediate Help Checkbox */}
              <div className="surface-row">
                <div>
                  <div className="surface-row-title">Request Immediate Teacher Help</div>
                  <div className="surface-row-meta">
                    Elevates task into teacher&apos;s active triage queue during class
                  </div>
                </div>
                <input
                  type="checkbox"
                  id="requested_help"
                  checked={requestedHelp}
                  onChange={(e) => setRequestedHelp(e.target.checked)}
                  className="surface-checkbox"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="surface-actions">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="btn btn-line btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-ink btn-sm"
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
