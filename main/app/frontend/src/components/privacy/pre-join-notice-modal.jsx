import React, { useState } from "react";
import { CONSENT_CATEGORIES } from "./consent-categories";

export default function PreJoinNoticeModal({ isOpen, onClose, onConfirm, initialConsents = {} }) {
  const [consents, setConsents] = useState(() => {
    const initial = {};
    CONSENT_CATEGORIES.forEach((cat) => {
      initial[cat.id] = initialConsents[cat.id] !== undefined ? initialConsents[cat.id] : cat.defaultGranted;
    });
    return initial;
  });

  if (!isOpen) return null;

  const handleToggle = (id) => {
    const cat = CONSENT_CATEGORIES.find((c) => c.id === id);
    if (cat && cat.required) return;
    setConsents((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleJoinCameraOptional = () => {
    const cameraOptional = {
      LIVE_SESSION_PARTICIPATION: true,
      CAMERA_LOCAL_PROCESSING: false,
      IDENTITY_ENROLLMENT: false,
      IDENTITY_VERIFICATION: false,
      ACTIVE_PRESENCE_CHECKS: false,
      ATTENTION_TELEMETRY: false,
      BROWSER_CONTEXT_TELEMETRY: consents.BROWSER_CONTEXT_TELEMETRY ?? true,
      ANSWER_STORAGE: consents.ANSWER_STORAGE ?? true,
    };
    onConfirm(cameraOptional);
  };

  const handleSubmitSelected = () => {
    onConfirm(consents);
  };

  return (
    <div className="app surface-overlay">
      <div className="surface-modal">
        {/* Header */}
        <div className="surface-head">
          <div className="surface-head-main">
            <div className="surface-mark surface-mark--forest" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h2 className="surface-title">Privacy & Consent Transparency</h2>
              <p className="surface-sub">
                Chronos protects your privacy by processing video strictly on your device. Review and customize what data you share before joining.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="icon-btn icon-btn-sm"
              aria-label="Close privacy notice"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="surface-body stack">
          {/* Zero-Raw-Media Guarantee Alert */}
          <div className="notice">
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <div className="surface-row-title">Zero Raw Video Guarantee</div>
              <p className="surface-meta">
                No video frames, camera feeds, continuous facial meshes, or microphone audio are ever stored on servers or accessible to administrators. Temporary identity vectors are permanently purged within 24 hours.
              </p>
            </div>
          </div>

          {/* Granular Consent Checkboxes */}
          <div className="surface-section">
            <div className="surface-choice-list surface-choice-list--tall">
              {CONSENT_CATEGORIES.map((cat) => {
                const isChecked = consents[cat.id] ?? false;
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleToggle(cat.id)}
                    className={`surface-row is-choice${isChecked ? " is-selected" : ""}`}
                  >
                    <div className="surface-row-copy">
                      <div className="surface-row-title">
                        {cat.label}
                        {cat.required && (
                          <span className="badge badge-distracted">Required</span>
                        )}
                      </div>
                      <p className="surface-meta">{cat.description}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={cat.required}
                      onChange={() => handleToggle(cat.id)}
                      className="surface-checkbox"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Non-Penalization Note */}
          <p className="surface-note">
            Declining optional analytics is never misconduct and will not negatively impact your grades or standing.
          </p>
        </div>

        {/* Actions */}
        <div className="surface-actions">
          <button
            type="button"
            onClick={handleJoinCameraOptional}
            className="btn btn-line btn-sm"
          >
            Join in Camera-Optional Mode
          </button>
          <button
            type="button"
            onClick={handleSubmitSelected}
            className="btn btn-ink btn-sm"
          >
            Confirm Preferences & Join
          </button>
        </div>
      </div>
    </div>
  );
}
