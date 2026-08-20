// src/components/teacher/case-triage-rail.jsx
// Workstream W7: Scalable Teacher Triage Rail, Case Views & Batch Actions

import { useState, useMemo } from "react";

const VIEW_TABS = [
  { id: "active", label: "Active", description: "Persistent issues requiring teacher review" },
  { id: "monitor", label: "Monitor", description: "Early warnings and student-only nudges" },
  { id: "technical", label: "Technical", description: "Camera, mic, or network connectivity issues" },
  { id: "context_added", label: "Context Added", description: "Appeals and explanations submitted by students" },
  { id: "recovered", label: "Recovered", description: "Self-recovered through clean observation streaks" },
  { id: "resolved", label: "Resolved", description: "Cases marked resolved or dismissed by teacher" },
];

export default function CaseTriageRail({
  cases = [],
  sessionId,
  onExecuteBatchAction,
  onViewStudent,
  className = "",
}) {
  const [activeView, setActiveView] = useState("active");
  const [selectedCaseIds, setSelectedCaseIds] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  // Group and filter cases by view
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const status = c.status || "OPEN";
      const priority = c.priority || "MONITOR";
      const category = c.category || "";
      const hasContext = (c.student_context_count || 0) > 0;
      const isRecovered = c.self_recovery_attempted === true || status === "SELF_RECOVERED";
      const isResolved = status === "RESOLVED" || status === "DISMISSED";

      if (activeView === "active") {
        return !isResolved && (priority === "ACTION_REQUIRED" || priority === "URGENT" || status === "ACTION_REQUIRED");
      }
      if (activeView === "monitor") {
        return !isResolved && priority === "MONITOR" && category !== "TECHNICAL_CAMERA" && category !== "TECHNICAL_NETWORK" && category !== "SESSION_INCIDENT";
      }
      if (activeView === "technical") {
        return !isResolved && (category === "TECHNICAL_CAMERA" || category === "TECHNICAL_NETWORK" || category === "SESSION_INCIDENT");
      }
      if (activeView === "context_added") {
        return !isResolved && hasContext;
      }
      if (activeView === "recovered") {
        return isRecovered;
      }
      if (activeView === "resolved") {
        return isResolved;
      }
      return true;
    });
  }, [cases, activeView]);

  // Find open correlated session incidents
  const openIncidents = useMemo(() => {
    return cases.filter((c) => c.category === "SESSION_INCIDENT" && c.status !== "RESOLVED" && c.status !== "DISMISSED");
  }, [cases]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    const counts = {
      active: 0,
      monitor: 0,
      technical: 0,
      context_added: 0,
      recovered: 0,
      resolved: 0,
    };
    for (const c of cases) {
      const status = c.status || "OPEN";
      const priority = c.priority || "MONITOR";
      const category = c.category || "";
      const hasContext = (c.student_context_count || 0) > 0;
      const isRecovered = c.self_recovery_attempted === true || status === "SELF_RECOVERED";
      const isResolved = status === "RESOLVED" || status === "DISMISSED";

      if (isResolved) {
        counts.resolved++;
      } else {
        if (priority === "ACTION_REQUIRED" || priority === "URGENT" || status === "ACTION_REQUIRED") counts.active++;
        if (priority === "MONITOR" && category !== "TECHNICAL_CAMERA" && category !== "TECHNICAL_NETWORK" && category !== "SESSION_INCIDENT") counts.monitor++;
        if (category === "TECHNICAL_CAMERA" || category === "TECHNICAL_NETWORK" || category === "SESSION_INCIDENT") counts.technical++;
        if (hasContext) counts.context_added++;
      }
      if (isRecovered) counts.recovered++;
    }
    return counts;
  }, [cases]);

  const handleToggleSelectAll = () => {
    if (selectedCaseIds.size === filteredCases.length && filteredCases.length > 0) {
      setSelectedCaseIds(new Set());
    } else {
      setSelectedCaseIds(new Set(filteredCases.map((c) => c.case_id)));
    }
  };

  const handleToggleCase = (caseId) => {
    const next = new Set(selectedCaseIds);
    if (next.has(caseId)) {
      next.delete(caseId);
    } else {
      next.add(caseId);
    }
    setSelectedCaseIds(next);
  };

  const handleRunAction = async (actionType, extra = {}) => {
    if (selectedCaseIds.size === 0) return;
    setActionLoading(true);
    try {
      const caseIdsArray = Array.from(selectedCaseIds);
      if (onExecuteBatchAction) {
        await onExecuteBatchAction({
          caseIds: caseIdsArray,
          actionType,
          ...extra,
        });
      }
      setSelectedCaseIds(new Set());
      setSnoozeOpen(false);
    } catch (err) {
      console.error("Batch action failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveIncident = async (incident) => {
    if (onExecuteBatchAction) {
      await onExecuteBatchAction({
        caseIds: [incident.case_id],
        actionType: "resolve_incident",
        note: "Correlated outage cleared by teacher",
      });
    }
  };

  return (
    <div className={`bg-[#111315] text-slate-100 rounded-2xl border border-white/10 flex flex-col h-full overflow-hidden shadow-xl ${className}`}>
      {/* 1. Header & View Tabs */}
      <div className="p-4 border-b border-white/10 bg-[#16181b] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#dcc492]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Exception &amp; Triage Queue
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {cases.length} Total Exceptions
          </span>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {VIEW_TABS.map((tab) => {
            const count = tabCounts[tab.id] || 0;
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveView(tab.id);
                  setSelectedCaseIds(new Set());
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#dcc492] text-[#111315] shadow-md"
                    : "bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/5"
                }`}
                title={tab.description}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? "bg-[#111315]/20 text-[#111315]" : "bg-white/10 text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Correlated Incident Banner (if any) */}
      {openIncidents.map((incident) => (
        <div
          key={incident.case_id}
          className="m-3 p-3.5 rounded-xl bg-gradient-to-r from-red-950/80 to-amber-950/80 border border-red-500/40 flex items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Correlated Technical Outage</span>
                <span className="px-2 py-0.5 rounded bg-red-500/30 text-red-200 text-[10px]">
                  {incident.affected_participant_count || 3}+ Students Affected
                </span>
              </div>
              <p className="text-[11px] text-red-200/80">
                Multiple participants experienced simultaneous connectivity drops within 60s.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleResolveIncident(incident)}
            className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-semibold transition whitespace-nowrap shadow-sm"
          >
            Resolve Incident
          </button>
        </div>
      ))}

      {/* 3. Batch Action Bar (Sticky above list) */}
      {filteredCases.length > 0 && (
        <div className="px-4 py-2.5 bg-[#16181b] border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all-cases"
              checked={selectedCaseIds.size === filteredCases.length && filteredCases.length > 0}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded text-[#dcc492] focus:ring-0 bg-[#111315] border-white/20 cursor-pointer"
            />
            <label htmlFor="select-all-cases" className="text-xs font-medium text-slate-300 cursor-pointer">
              {selectedCaseIds.size > 0
                ? `${selectedCaseIds.size} Selected`
                : `Select All (${filteredCases.length})`}
            </label>
          </div>

          {selectedCaseIds.size > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleRunAction("acknowledge_context")}
                disabled={actionLoading}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition disabled:opacity-50"
                title="Acknowledge student context and notes"
              >
                Acknowledge
              </button>

              <button
                type="button"
                onClick={() => handleRunAction("mark_technical")}
                disabled={actionLoading}
                className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/30 text-xs font-medium transition disabled:opacity-50"
                title="Mark selected as technical hardware or network glitch"
              >
                Mark Technical
              </button>

              <button
                type="button"
                onClick={() => handleRunAction("dismiss_recovered")}
                disabled={actionLoading}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-xs font-medium transition disabled:opacity-50"
                title="Dismiss recovered or stable cases"
              >
                Dismiss Recovered
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSnoozeOpen(!snoozeOpen)}
                  disabled={actionLoading}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-medium transition flex items-center gap-1"
                >
                  Snooze
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {snoozeOpen && (
                  <div className="absolute right-0 mt-1 w-28 bg-[#212429] border border-white/10 rounded-xl shadow-xl z-20 py-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleRunAction("snooze", { snoozeDurationMinutes: 5 })}
                      className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-slate-200"
                    >
                      5 Minutes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunAction("snooze", { snoozeDurationMinutes: 10 })}
                      className="w-full text-left px-3 py-1.5 hover:bg-white/10 text-slate-200"
                    >
                      10 Minutes
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleRunAction("batch_resolve")}
                disabled={actionLoading}
                className="px-3 py-1 rounded-lg bg-[#dcc492] hover:bg-[#ebd7ad] text-[#111315] text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                Resolve Selected ({selectedCaseIds.size})
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Scrollable Case List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredCases.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-xs font-medium text-slate-400">No cases in {VIEW_TABS.find((t) => t.id === activeView)?.label} view</p>
            <p className="text-[11px]">All student observation streams operating normally</p>
          </div>
        ) : (
          filteredCases.map((c) => {
            const isSelected = selectedCaseIds.has(c.case_id);
            const durationSec = Math.round((c.duration_ms || 0) / 1000);
            const isUrgent = c.priority === "URGENT" || c.priority === "ACTION_REQUIRED";
            const isRecovered = c.self_recovery_attempted === true;

            return (
              <div
                key={c.case_id}
                className={`p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-[#dcc492]/10 border-[#dcc492]/50"
                    : isUrgent
                    ? "bg-red-950/20 border-red-500/30 hover:bg-red-950/30"
                    : isRecovered
                    ? "bg-emerald-950/20 border-emerald-500/30 hover:bg-emerald-950/30"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleCase(c.case_id)}
                      className="mt-1 w-3.5 h-3.5 rounded text-[#dcc492] focus:ring-0 bg-[#111315] border-white/20 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          {c.participant_id || "Session Incident"}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded text-[10px] font-semibold uppercase ${
                            c.category === "ATTENTION_CONCERN"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : c.category === "TECHNICAL_CAMERA" || c.category === "TECHNICAL_NETWORK"
                              ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                              : c.category === "STUDENT_HELP_REQUEST"
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                              : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          }`}
                        >
                          {c.category?.replace(/_/g, " ")}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                            c.priority === "URGENT" || c.priority === "ACTION_REQUIRED"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-slate-500/20 text-slate-300"
                          }`}
                        >
                          {c.priority}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 mt-1">
                        {c.reason_summary || "Continuous observation anomaly detected."}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1.5">
                        <span>Duration: {durationSec}s</span>
                        <span>Events: {c.event_ids?.length || 1}</span>
                        {c.student_context_count > 0 && (
                          <span className="text-[#dcc492] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#dcc492]" />
                            Student Context Added
                          </span>
                        )}
                        {isRecovered && (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Self-Recovered
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Individual Quick Action */}
                  <div className="flex items-center gap-1">
                    {onViewStudent && c.participant_id && (
                      <button
                        type="button"
                        onClick={() => onViewStudent(c.participant_id)}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-[11px] text-slate-300 transition"
                        title="Locate participant in grid"
                      >
                        View
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (onExecuteBatchAction) {
                          await onExecuteBatchAction({
                            caseIds: [c.case_id],
                            actionType: "resolve_case",
                          });
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-white/10 hover:bg-[#dcc492] hover:text-[#111315] text-[11px] font-semibold text-white transition"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
