import React from "react";
import ChronosMark from "../chronos-mark.jsx";

export default function StudentTopbar({ wsConnected, sessionId, userName, onOpenPrivacy }) {
  return (
    <header className="sd-topbar" aria-label="Student meeting header">
      <div className="sd-brand-group">
        <div className="sd-brand-mark" aria-hidden="true">
          <ChronosMark size={20} variant="gold" />
        </div>
        <div className="sd-brand-copy">
          <span className="sd-brand-name">Chronos</span>
          <span className="sd-brand-meta" title={`${sessionId} ${userName}`}>
            Student Meeting
            <span className="sd-brand-sep">.</span>
            {userName}
            <span className="sd-brand-sep">.</span>
            {sessionId}
          </span>
        </div>
      </div>

      <div className="sd-topbar-right flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold tracking-wide" title="Session running in accelerated demo timing">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Accelerated Demo Mode
        </div>
        {onOpenPrivacy && (
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition-colors"
            title="Privacy, Consent, and Technical Context"
          >
            <span className="material-symbols-outlined text-sm text-emerald-400">shield</span>
            <span>Privacy & Context</span>
          </button>
        )}
        <span className={`sd-ws-badge ${wsConnected ? "" : "disconnected"}`}>
          <span className="sd-ws-dot" aria-hidden="true" />
          {wsConnected ? "Connected" : "Offline"}
        </span>
      </div>
    </header>
  );
}

