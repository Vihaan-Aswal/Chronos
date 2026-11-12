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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <span className="material-symbols-outlined text-2xl">shield</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white tracking-tight">Privacy & Consent Transparency</h2>
              <p className="text-sm text-slate-400 mt-1">
                Chronos protects your privacy by processing video strictly on your device. Review and customize what data you share before joining.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>

        {/* Zero-Raw-Media Guarantee Alert */}
        <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-medium text-emerald-400">
            <span className="material-symbols-outlined text-base">lock</span>
            <span>Zero Raw Video Guarantee</span>
          </div>
          <p className="leading-relaxed">
            No video frames, camera feeds, continuous facial meshes, or microphone audio are ever stored on servers or accessible to administrators. Temporary identity vectors are permanently purged within 24 hours.
          </p>
        </div>

        {/* Granular Consent Checkboxes */}
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {CONSENT_CATEGORIES.map((cat) => {
            const isChecked = consents[cat.id] ?? false;
            return (
              <div
                key={cat.id}
                onClick={() => handleToggle(cat.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isChecked
                    ? "bg-slate-800/80 border-slate-700"
                    : "bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{cat.label}</span>
                    {cat.required && (
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">{cat.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={cat.required}
                  onChange={() => handleToggle(cat.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
            );
          })}
        </div>

        {/* Non-Penalization Note */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="material-symbols-outlined text-base text-slate-400 shrink-0">info</span>
          <span>Declining optional analytics is never misconduct and will not negatively impact your grades or standing.</span>
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleJoinCameraOptional}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Join in Camera-Optional Mode
          </button>
          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmitSelected}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 transition-colors"
            >
              Confirm Preferences & Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
