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
    <div className={`triage ${className}`.trim()}>
      {/* 1. Header & View Tabs */}
      <div className="triage-head">
        <div className="triage-head-row">
          <h2 className="triage-title">Exception &amp; Triage Queue</h2>
          <span className="triage-count">{cases.length} Total Exceptions</span>
        </div>

        {/* Tab Strip */}
        <div className="triage-tabs">
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
                className="triage-tab"
                aria-pressed={isActive}
                title={tab.description}
              >
                <span>{tab.label}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Correlated Incident Banner (if any) */}
      {openIncidents.map((incident) => (
        <div key={incident.case_id} className="triage-incident">
          <div className="surface-row-main">
            <div className="surface-mark surface-mark--flag" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <div className="triage-incident-title">
                <span>Correlated Technical Outage</span>
                <span className="badge badge-flag">
                  {incident.affected_participant_count || 3}+ Students Affected
                </span>
              </div>
              <p>
                Multiple participants experienced simultaneous connectivity drops within 60s.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleResolveIncident(incident)}
            className="btn btn-ink btn-sm"
          >
            Resolve Incident
          </button>
        </div>
      ))}

      {/* 3. Batch Action Bar (Sticky above list) */}
      {filteredCases.length > 0 && (
        <div className="triage-batch">
          <label className="triage-select" htmlFor="select-all-cases">
            <input
              type="checkbox"
              id="select-all-cases"
              checked={selectedCaseIds.size === filteredCases.length && filteredCases.length > 0}
              onChange={handleToggleSelectAll}
            />
            {selectedCaseIds.size > 0
              ? `${selectedCaseIds.size} Selected`
              : `Select All (${filteredCases.length})`}
          </label>

          {selectedCaseIds.size > 0 && (
            <div className="triage-batch-actions">
              <button
                type="button"
                onClick={() => handleRunAction("acknowledge_context")}
                disabled={actionLoading}
                className="btn btn-line btn-sm"
                title="Acknowledge student context and notes"
              >
                Acknowledge
              </button>

              <button
                type="button"
                onClick={() => handleRunAction("mark_technical")}
                disabled={actionLoading}
                className="btn btn-line btn-sm"
                title="Mark selected as technical hardware or network glitch"
              >
                Mark Technical
              </button>

              <button
                type="button"
                onClick={() => handleRunAction("dismiss_recovered")}
                disabled={actionLoading}
                className="btn btn-line btn-sm"
                title="Dismiss recovered or stable cases"
              >
                Dismiss Recovered
              </button>

              <div className="triage-menu-wrap">
                <button
                  type="button"
                  onClick={() => setSnoozeOpen(!snoozeOpen)}
                  disabled={actionLoading}
                  className="btn btn-line btn-sm"
                >
                  Snooze
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {snoozeOpen && (
                  <div className="triage-menu">
                    <button
                      type="button"
                      onClick={() => handleRunAction("snooze", { snoozeDurationMinutes: 5 })}
                    >
                      5 Minutes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunAction("snooze", { snoozeDurationMinutes: 10 })}
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
                className="btn btn-ink btn-sm"
              >
                Resolve Selected ({selectedCaseIds.size})
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Scrollable Case List */}
      <div className="triage-list">
        {filteredCases.length === 0 ? (
          <div className="triage-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h3>No cases in {VIEW_TABS.find((t) => t.id === activeView)?.label} view</h3>
            <p>All student observation streams operating normally</p>
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
                className={`triage-case${isSelected ? " is-selected" : ""}${!isSelected && isUrgent ? " is-urgent" : ""}${!isSelected && !isUrgent && isRecovered ? " is-recovered" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleCase(c.case_id)}
                  className="triage-case-check"
                  aria-label={`Select case ${c.participant_id || c.case_id}`}
                />
                <div className="triage-case-main">
                  <div className="triage-case-title">
                    <span className="triage-case-name">
                      {c.participant_id || "Session Incident"}
                    </span>
                    <span
                      className={`badge ${
                        c.category === "ATTENTION_CONCERN"
                          ? "badge-distracted"
                          : c.category === "TECHNICAL_CAMERA" || c.category === "TECHNICAL_NETWORK"
                          ? "badge-away"
                          : c.category === "STUDENT_HELP_REQUEST"
                          ? "badge-attentive"
                          : ""
                      }`.trim()}
                    >
                      {c.category?.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`badge ${isUrgent ? "badge-flag" : "badge-away"}`}
                    >
                      {c.priority}
                    </span>
                  </div>

                  <p className="triage-case-reason">
                    {c.reason_summary || "Continuous observation anomaly detected."}
                  </p>

                  <div className="triage-case-meta">
                    <span>Duration: {durationSec}s</span>
                    <span>Events: {c.event_ids?.length || 1}</span>
                    {c.student_context_count > 0 && (
                      <span>
                        <span className="dot dot-wait" aria-hidden="true" />{" "}
                        Student Context Added
                      </span>
                    )}
                    {isRecovered && (
                      <span>
                        <span className="dot dot-attentive" aria-hidden="true" />{" "}
                        Self-Recovered
                      </span>
                    )}
                  </div>
                </div>

                {/* Individual Quick Action */}
                <div className="triage-case-actions">
                  {onViewStudent && c.participant_id && (
                    <button
                      type="button"
                      onClick={() => onViewStudent(c.participant_id)}
                      className="btn btn-quiet btn-sm"
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
                    className="btn btn-line btn-sm"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
