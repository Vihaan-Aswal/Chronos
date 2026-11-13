import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { AlertIcon, CheckIcon, DownloadIcon } from "./app/icons.jsx";
import { useMotionPreference } from "./motion/use-motion-preference.js";
import { MOTION } from "./motion/tokens.js";
import {
  recordReportExportAudit,
  fetchSessionReport,
  rebuildSessionReport,
} from "../api/reports.js";

const CHART = {
  grid: "rgba(11, 26, 20, 0.09)",
  axis: "#56685c",
  ink: "#0b1a14",
  sage: "#4c6146",
  gold: "#8a6a2f",
  red: "#b3261e",
  blue: "#3c5a78",
};

const tooltipStyle = {
  backgroundColor: "#fcf9f1",
  border: "1px solid rgba(11, 26, 20, 0.16)",
  borderRadius: 4,
  color: CHART.ink,
  fontSize: 12,
};
const tooltipLabelStyle = { color: CHART.ink, fontWeight: 700 };
const tooltipItemStyle = { color: "#56685c" };

function formatTime(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hrs = Math.floor(safe / 60);
  const mins = Math.floor(safe % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDuration(minutes, seconds) {
  const mins = Number(minutes) || 0;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${Math.floor(mins % 60)}m`;
  }
  if (mins > 0) return `${Math.floor(mins)}m`;
  return `${Math.round(Number(seconds) || 0)}s`;
}

function formatDate(value) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityTone(level) {
  if (level === "ACTION_REQUIRED") return "badge-flag";
  if (level === "MONITOR") return "badge-distracted";
  return "";
}

export default function SessionReport({
  sessionData,
  report: initialReport,
  sessionId: propSessionId,
  onClose,
  onSave,
}) {
  const [showPerStudent, setShowPerStudent] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const dialogRef = useRef(null);
  const { reduced } = useMotionPreference();

  // Evidence report read model (server-built from durable events).
  const [evidence, setEvidence] = useState(initialReport || null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);

  const evidenceSessionId = propSessionId || initialReport?.session_id || null;
  const isEvidence = !sessionData && Boolean(evidenceSessionId);

  useEffect(() => {
    if (initialReport) {
      setEvidence(initialReport);
      setEvidenceLoading(false);
    }
  }, [initialReport]);

  useEffect(() => {
    if (sessionData || initialReport || !evidenceSessionId) return;
    let isMounted = true;
    setEvidenceLoading(true);
    setEvidenceError(null);
    fetchSessionReport(evidenceSessionId)
      .then((data) => {
        if (isMounted) {
          setEvidence(data);
          setEvidenceLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Error fetching session report:", err);
          setEvidenceError(err.message || "The report could not be loaded.");
          setEvidenceLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [sessionData, initialReport, evidenceSessionId]);

  const handleRebuild = async () => {
    if (!evidenceSessionId) return;
    setRebuilding(true);
    setEvidenceError(null);
    try {
      const fresh = await rebuildSessionReport(evidenceSessionId);
      setEvidence(fresh);
    } catch (err) {
      console.error("Failed to rebuild report:", err);
      setEvidenceError(err.message || "The report could not be rebuilt.");
    } finally {
      setRebuilding(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event) => {
      event.preventDefault();
      onClose?.();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const overview = evidence?.session_overview || {};
  const coverage = evidence?.observation_coverage || {};
  const tech = evidence?.technical_uncertainty || {};
  const attention = evidence?.attention_patterns || {};
  const identityOutcomes = evidence?.identity_outcomes || {};
  const presence = evidence?.active_presence || {};
  const browser = evidence?.browser_visibility || {};
  const resources = evidence?.resource_usage || {};
  const submissions = evidence?.answer_submissions || {};
  const studentContext = evidence?.student_context || {};
  const teacherActions = evidence?.teacher_actions || {};
  const recovery = evidence?.recovery_outcomes || {};
  const reviewItems = evidence?.review_prioritization || [];
  const drilldowns = evidence?.participant_drilldowns || {};
  const isDemo = Boolean(overview.is_demo);
  const isNoAnalytics = Boolean(
    evidence?.is_suppressed_by_policy || overview.policy_id === "NO_ANALYTICS",
  );

  const coveragePieData = useMemo(() => {
    if (isNoAnalytics) return [];
    return [
      {
        name: "Clean windows",
        value: coverage.valid_clean_windows || 0,
        color: CHART.sage,
      },
      {
        name: "Warning windows",
        value: coverage.valid_warning_windows || 0,
        color: CHART.gold,
      },
      {
        name: "No data (technical)",
        value: coverage.no_data_windows || 0,
        color: CHART.blue,
      },
    ].filter((d) => d.value > 0);
  }, [
    coverage.valid_clean_windows,
    coverage.valid_warning_windows,
    coverage.no_data_windows,
    isNoAnalytics,
  ]);

  /* ------------------------------------------------------------------ */
  /* Local record (saved analytics)                                       */
  /* ------------------------------------------------------------------ */

  const local = sessionData || null;
  const {
    sessionId: localSessionId,
    startTime,
    duration,
    avgScore,
    totalStudents,
    totalStudentsReal,
    totalStudentsSimulated,
    studentMeta = {},
    classContextMode,
    strictModeAtEnd,
    metricsTimeline = [],
    distribution,
    confusionHotspots = [],
    atRiskStudents = [],
    perStudentTimelines = {},
    tpi,
  } = local || {};

  const distributionEffective = useMemo(() => {
    const hasData =
      (distribution?.attentive || 0) +
        (distribution?.distracted || 0) +
        (distribution?.disengaged || 0) >
      0;
    if (hasData) return distribution;

    const avgs = Object.entries(perStudentTimelines).map(([uid, pts]) => {
      if (!pts?.length) return { uid, avg: 0 };
      const avg = pts.reduce((s, p) => s + (p.score ?? 0), 0) / pts.length;
      return { uid, avg };
    });

    let attentive = 0;
    let distracted = 0;
    let away = 0;
    avgs.forEach(({ avg }) => {
      if (avg > 0.7) attentive += 1;
      else if (avg >= 0.4) distracted += 1;
      else away += 1;
    });

    return { attentive, distracted, disengaged: away };
  }, [distribution, perStudentTimelines]);

  const classMeanFromStudents = useMemo(() => {
    const pts = Object.values(perStudentTimelines);
    if (!pts.length) return avgScore || 0;

    const avgs = pts
      .filter((p) => p?.length)
      .map(
        (series) =>
          series.reduce((s, x) => s + (x.score ?? 0), 0) / series.length,
      );
    if (!avgs.length) return avgScore || 0;

    return avgs.reduce((a, b) => a + b, 0) / avgs.length;
  }, [perStudentTimelines, avgScore]);

  const relativeData = useMemo(() => {
    const mu = classMeanFromStudents || 0.01;
    const hi = Math.min(0.95, mu * 1.15);
    const lo = Math.max(0.05, mu * 0.7);

    const avgs = Object.entries(perStudentTimelines).map(([uid, series]) => {
      if (!series?.length) return { uid, avg: 0 };
      const avg =
        series.reduce((s, p) => s + (p.score ?? 0), 0) / series.length;
      return { uid, avg };
    });

    let above = 0;
    let mid = 0;
    let below = 0;
    avgs.forEach(({ avg }) => {
      if (avg >= hi) above += 1;
      else if (avg <= lo) below += 1;
      else mid += 1;
    });

    return {
      rows: [
        {
          name: `Strong (>=${(hi * 100).toFixed(0)}%)`,
          value: above,
          dot: "attentive",
        },
        { name: "Typical band", value: mid, dot: "distracted" },
        {
          name: `Below (<=${(lo * 100).toFixed(0)}%)`,
          value: below,
          dot: "away",
        },
      ],
      hi,
      lo,
    };
  }, [perStudentTimelines, classMeanFromStudents]);

  const hasSimLine = metricsTimeline?.some(
    (m) => m.avgScoreSimulated != null && !Number.isNaN(m.avgScoreSimulated),
  );
  const hasRealLine = metricsTimeline?.some(
    (m) => m.avgScoreReal != null && !Number.isNaN(m.avgScoreReal),
  );

  const distributionTotal =
    (distributionEffective.attentive || 0) +
    (distributionEffective.distracted || 0) +
    (distributionEffective.disengaged || 0);

  const peakConfusion = confusionHotspots.length
    ? Math.max(...confusionHotspots.map((h) => Number(h.percentage) || 0))
    : 0;

  const meanPercent = Math.round((classMeanFromStudents || 0) * 100);
  const simulated = totalStudentsSimulated || 0;
  const live = totalStudentsReal ?? Math.max(0, (totalStudents || 0) - simulated);
  const relativeRows = relativeData.rows.filter((r) => r.value > 0);

  async function handleSave() {
    if (!onSave || saveState === "saving") return;
    setSaveState("saving");
    setSaveError("");
    try {
      await onSave();
      setSaveState("saved");
    } catch (err) {
      console.error("Save record failed:", err);
      setSaveError(
        "The record did not save. Check the connection and try again.",
      );
      setSaveState("error");
    }
  }

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text("Session record", 20, y);
    y += 12;
    doc.setFontSize(10);
    doc.text(`Session: ${localSessionId || "-"}`, 20, y);
    y += 6;
    doc.text(`Started: ${formatDate(startTime)}`, 20, y);
    y += 10;
    doc.setFontSize(11);

    doc.text(
      `Duration: ${formatTime(duration)} | Mean engagement: ${meanPercent}% | Learners: ${totalStudents}`,
      20,
      y,
    );
    y += 8;

    if (tpi != null) {
      doc.text(`TPI: ${Math.round(tpi)}/100`, 20, y);
      y += 6;
      doc.setFontSize(9);
      doc.text("TPI = 60% mean engagement + 40% attention retention.", 20, y);
      doc.text("It is a post-class index, not a student grade.", 20, y + 4);
      y += 12;
      doc.setFontSize(11);
    }

    doc.text(
      `Attentive: ${distributionEffective.attentive} | Distracted: ${distributionEffective.distracted} | Away: ${distributionEffective.disengaged}`,
      20,
      y,
    );
    y += 12;

    if (atRiskStudents.length > 0) {
      doc.setFontSize(14);
      doc.text("Follow-up", 20, y);
      y += 8;
      doc.setFontSize(10);
      atRiskStudents.forEach((s) => {
        doc.text(
          `- ${s.userId?.slice(0, 16) || "Learner"} | Avg: ${(s.avgScore * 100).toFixed(0)}% | ${s.reason}`,
          25,
          y,
        );
        y += 6;
      });
    }

    doc.save(`session-record-${localSessionId || "record"}.pdf`);
  };

  const handleExportEvidencePDF = async () => {
    if (!evidence) return;
    try {
      if (evidenceSessionId) {
        recordReportExportAudit(evidenceSessionId, { exportFormat: "pdf" }).catch(
          () => {},
        );
      }

      const doc = new jsPDF();
      let y = 18;
      const margin = 18;
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Chronos session report", margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90, 105, 120);
      doc.text(
        [
          `Session: ${overview.title || overview.session_id || evidenceSessionId}`,
          `Policy: ${overview.policy_id} (${overview.policy_version})`,
          isDemo ? "[DEMO / SIMULATED SESSION]" : "Live session",
          `Generated: ${new Date(evidence.generated_at || Date.now()).toLocaleString()}`,
        ].join(" | "),
        margin,
        y,
      );
      y += 10;

      doc.setDrawColor(210, 225, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 35, 50);
      doc.text("1. Session overview & observation coverage", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Duration: ${formatDuration(overview.duration_minutes, overview.duration_seconds)} | Total learners: ${
          overview.total_participants
        } (${overview.live_participants_count} live, ${overview.simulated_participants_count} simulated)`,
        margin,
        y,
      );
      y += 6;

      if (isNoAnalytics) {
        doc.text(
          "Policy note: behavioural analytics suppressed per NO_ANALYTICS policy snapshot.",
          margin,
          y,
        );
        y += 8;
      } else {
        doc.text(
          `Observation coverage: ${((coverage.overall_coverage_ratio || 0) * 100).toFixed(0)}% (usable segments: ${
            coverage.total_usable_segments
          }/${coverage.total_expected_segments})`,
          margin,
          y,
        );
        y += 6;
        doc.text(
          `Windows evaluated: ${coverage.total_evaluated_windows} | Clean: ${coverage.valid_clean_windows} | Warning: ${coverage.valid_warning_windows} | Technical NO_DATA: ${coverage.no_data_windows}`,
          margin,
          y,
        );
        y += 6;
        doc.setFontSize(8.5);
        doc.setTextColor(120, 135, 150);
        doc.text(
          "* NO_DATA marks unobservable intervals (camera or network gaps) and is separated from attention scores.",
          margin,
          y,
        );
        y += 8;
      }

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 35, 50);
      doc.text("2. Review prioritisation", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      if (reviewItems.length === 0) {
        doc.text(
          "No review recommendations. All learners maintained stable participation.",
          margin,
          y,
        );
        y += 8;
      } else {
        reviewItems.slice(0, 10).forEach((item) => {
          if (y > 265) {
            doc.addPage();
            y = 20;
          }
          const reasons = (item.evidence_reasons || []).join("; ") || "Stable observation";
          doc.setFont("helvetica", "bold");
          doc.text(`[${item.priority_level}] ${item.display_name}:`, margin, y);
          doc.setFont("helvetica", "normal");
          const splitReason = doc.splitTextToSize(
            reasons,
            pageWidth - margin * 2 - 45,
          );
          doc.text(splitReason, margin + 45, y);
          y += Math.max(6, splitReason.length * 5 + 2);
        });
      }
      y += 4;

      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("3. Identity continuity & active presence", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Identity outcomes: ${
          Object.entries(identityOutcomes.outcomes_breakdown || {})
            .filter(([, cnt]) => cnt > 0)
            .map(([st, cnt]) => `${st}: ${cnt}`)
            .join(" | ") || "None"
        }`,
        margin,
        y,
      );
      y += 6;
      doc.text(
        `Active presence: ${presence.total_challenges_issued} issued | Passed: ${presence.passed_count} | Quality fail: ${presence.quality_fail_count} | Timed out: ${presence.timed_out_count} | Declined: ${presence.declined_count}`,
        margin,
        y,
      );
      y += 8;

      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("4. Browser focus transitions & assessment resources", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Page focus transitions: ${browser.total_intervals || 0} recorded (total ${browser.total_duration_sec || 0}s)`,
        margin,
        y,
      );
      y += 5;
      doc.setFontSize(8.5);
      doc.setTextColor(120, 135, 150);
      doc.text(
        browser.destination_unverified_notice || "Destination unverified.",
        margin,
        y,
      );
      y += 7;

      doc.setFontSize(9.5);
      doc.setTextColor(20, 35, 50);
      if (resources.primary_question_paper) {
        doc.text(
          `Question paper: ${resources.primary_question_paper.title} (SHA-256: ${
            resources.primary_question_paper.content_hash?.slice(0, 16) || "verified"
          }...)`,
          margin,
          y,
        );
        y += 6;
      }
      doc.text(
        `Answer submissions: ${submissions.total_submissions || 0} total (${submissions.final_submitted_count || 0} submitted, ${submissions.draft_count || 0} draft, ${submissions.late_count || 0} late)`,
        margin,
        y,
      );
      y += 8;

      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("5. Student context & teacher action ledger", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Student appeals: ${studentContext.total_appeals || 0} submitted (${studentContext.help_requests_count || 0} help requests) | Teacher triage actions: ${teacherActions.total_actions_recorded || 0} recorded (${teacherActions.batch_action_count || 0} batch)`,
        margin,
        y,
      );
      y += 8;

      doc.setFontSize(8);
      doc.setTextColor(140, 150, 165);
      doc.text(
        "Chronos evidence-led reporting | Append-only verifiable projection | Privacy-compliant derived telemetry",
        margin,
        285,
      );

      doc.save(`chronos-report-${overview.session_id || evidenceSessionId || "session"}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
    }
  };

  const drilldown = selectedParticipantId
    ? drilldowns[selectedParticipantId]
    : null;

  const metaLine = local ? (
    <>
      <span>{localSessionId || "Session not named"}</span>
      <span>{formatDate(startTime)}</span>
      <span>{formatTime(duration)}</span>
      {classContextMode && <span>{classContextMode} context</span>}
      {strictModeAtEnd != null && (
        <span>{strictModeAtEnd ? "Strict" : "Normal"} tab</span>
      )}
    </>
  ) : (
    <>
      <span>{overview.session_id || evidenceSessionId || "Session not named"}</span>
      <span>{formatDate(overview.start_time || evidence?.generated_at)}</span>
      <span>
        {formatDuration(overview.duration_minutes, overview.duration_seconds)}
      </span>
      {overview.policy_id && <span>{overview.policy_id}</span>}
      {isDemo && <span>Demo data</span>}
    </>
  );

  return createPortal(
    <dialog ref={dialogRef} className="app rec" aria-labelledby="rec-title">
      <header className="rec-bar">
        <div className="wrap wrap-wide rec-bar-inner">
          <div>
            <h1 className="rec-title" id="rec-title">
              Session record
            </h1>
            <div className="rec-meta">{metaLine}</div>
          </div>
          <div className="rec-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={isEvidence ? handleExportEvidencePDF : handleExportPDF}
              disabled={isEvidence && (evidenceLoading || !evidence)}
            >
              <DownloadIcon />
              Export PDF
            </button>
            {isEvidence && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleRebuild}
                disabled={rebuilding || evidenceLoading}
                title="Rebuild the report from durable events"
              >
                {rebuilding ? "Rebuilding" : "Rebuild"}
              </button>
            )}
            {onSave && (
              <button
                type="button"
                className="btn btn-cream btn-sm"
                onClick={handleSave}
                disabled={saveState === "saving" || saveState === "saved"}
              >
                <CheckIcon />
                {saveState === "saving"
                  ? "Saving"
                  : saveState === "saved"
                    ? "Saved"
                    : "Save record"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-quiet-cream btn-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </header>

      <div className="wrap wrap-wide rec-body">
        {isEvidence ? (
          evidenceLoading ? (
            <p className="notice notice-quiet" role="status">
              <AlertIcon />
              <span>Building the report from durable events…</span>
            </p>
          ) : evidenceError ? (
            <div className="notice notice-flag" role="alert">
              <AlertIcon />
              <div>
                <p>{evidenceError}</p>
                <button type="button" className="text-btn" onClick={handleRebuild}>
                  Try the event rebuild
                </button>
              </div>
            </div>
          ) : evidence ? (
            <>
              <p className="rec-lede">
                A class with <strong>{overview.total_participants ?? 0}</strong>{" "}
                {(overview.total_participants ?? 0) === 1 ? "learner" : "learners"}
                , built strictly from append-only events. Policy{" "}
                <strong>{overview.policy_id || "CLASSROOM"}</strong>
                {overview.policy_version ? ` (${overview.policy_version})` : ""}.
              </p>

              <dl className="rec-facts">
                <div className="rec-fact">
                  <dt>Duration</dt>
                  <dd>
                    {formatDuration(
                      overview.duration_minutes,
                      overview.duration_seconds,
                    )}
                  </dd>
                </div>
                <div className="rec-fact">
                  <dt>Observation coverage</dt>
                  <dd>
                    {isNoAnalytics ? (
                      "Suppressed"
                    ) : (
                      `${((coverage.overall_coverage_ratio || 0) * 100).toFixed(0)}%`
                    )}
                    <small>
                      {isNoAnalytics
                        ? "NO_ANALYTICS mode"
                        : `${(coverage.valid_clean_windows || 0) + (coverage.valid_warning_windows || 0)} valid of ${coverage.total_evaluated_windows || 0} windows`}
                    </small>
                  </dd>
                </div>
                <div className="rec-fact">
                  <dt>Participants</dt>
                  <dd>
                    {overview.total_participants ?? 0}
                    <small>
                      {overview.live_participants_count || 0} live
                      {overview.simulated_participants_count
                        ? ` · ${overview.simulated_participants_count} simulated`
                        : ""}
                    </small>
                  </dd>
                </div>
                <div className="rec-fact">
                  <dt>Self-recovery</dt>
                  <dd>
                    {recovery.self_recovery_rate_pct ?? 0}%
                    <small>
                      {recovery.self_resolved_cases_count || 0} self-resolved of{" "}
                      {recovery.total_cases_created || 0} cases
                    </small>
                  </dd>
                </div>
              </dl>

              <p className="meta rec-note">
                No_DATA periods mark unobservable technical intervals and are
                kept separate from attention. Nothing here is a student grade.
              </p>

              <section className="rec-section" aria-labelledby="rec-review">
                <div className="rec-section-head">
                  <h2 id="rec-review">Review prioritisation</h2>
                  <p>
                    Ranked from persistent warning windows, unresolved identity
                    checks, technical gaps, and student context. No verdicts.
                  </p>
                </div>

                {reviewItems.length === 0 ? (
                  <p className="notice notice-ok">
                    <CheckIcon />
                    <span>
                      No review cues required. Everyone stayed stable or
                      recovered on their own.
                    </span>
                  </p>
                ) : (
                  <div className="rec-followup">
                    {reviewItems.map((item) => (
                      <article className="rec-followup-row" key={item.participant_id}>
                        <div>
                          <p className="rec-followup-name">{item.display_name}</p>
                          <p className="rec-followup-reason">
                            {(item.evidence_reasons || []).join(" · ") ||
                              "Stable observation"}
                          </p>
                        </div>
                        <div className="rec-followup-facts">
                          <span>
                            Coverage{" "}
                            <b>{((item.coverage_ratio || 0) * 100).toFixed(0)}%</b>
                          </span>
                          <span>
                            Streak <b>{item.warning_streak || 0}</b>
                          </span>
                          <span>
                            Identity <b>{item.identity_state || "-"}</b>
                          </span>
                          <span
                            className={`badge ${priorityTone(item.priority_level)}`.trim()}
                          >
                            {String(item.priority_level || "").replace("_", " ")}
                          </span>
                          {drilldowns[item.participant_id] && (
                            <button
                              type="button"
                              className="text-btn"
                              onClick={() =>
                                setSelectedParticipantId(item.participant_id)
                              }
                            >
                              Open evidence
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {!isNoAnalytics && (
                <div className="rec-grid2">
                  <section className="rec-section" aria-labelledby="rec-coverage">
                    <div className="rec-section-head">
                      <h2 id="rec-coverage">Observation coverage</h2>
                      <p>
                        Clean, warning, and technical no-data windows are counted
                        separately.
                      </p>
                    </div>

                    {coveragePieData.length > 0 ? (
                      <div className="rec-figure">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={coveragePieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={48}
                              outerRadius={78}
                              paddingAngle={3}
                              dataKey="value"
                              isAnimationActive={!reduced}
                              animationDuration={MOTION.slow * 1000}
                            >
                              {coveragePieData.map((entry, index) => (
                                <Cell key={`cov-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={tooltipStyle}
                              labelStyle={tooltipLabelStyle}
                              itemStyle={tooltipItemStyle}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 11, color: CHART.axis }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="notice notice-quiet">
                        <AlertIcon />
                        <span>No observation windows were evaluated.</span>
                      </p>
                    )}

                    {Object.keys(tech.reason_counts || {}).length > 0 && (
                      <p className="meta rec-note">
                        Technical reasons:{" "}
                        {Object.entries(tech.reason_counts).map(([reason, count]) => (
                          <span key={reason} className="badge">
                            {reason}: {count}
                          </span>
                        ))}
                      </p>
                    )}
                  </section>

                  <section className="rec-section" aria-labelledby="rec-patterns">
                    <div className="rec-section-head">
                      <h2 id="rec-patterns">Attention patterns</h2>
                      <p>
                        Classified only during usable video segments with a
                        single face and sufficient pose confidence.
                      </p>
                    </div>

                    {Object.keys(attention.distribution || {}).length > 0 ? (
                      <div className="rec-bars">
                        {Object.entries(attention.distribution).map(
                          ([pattern, count]) => (
                            <div className="rec-bar-row" key={pattern}>
                              <span>{pattern}</span>
                              <div className="rec-bar-track" aria-hidden="true">
                                <span
                                  className={`rec-bar-fill ${pattern === "STABLE" ? "is-attentive" : pattern === "VARIABLE" ? "is-distracted" : pattern === "SUSTAINED_CONCERN" ? "is-away" : "is-neutral"}`}
                                  style={{
                                    width: `${overview.total_participants ? (count / overview.total_participants) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                              <b>{count}</b>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="notice notice-quiet">
                        <AlertIcon />
                        <span>No attention patterns recorded.</span>
                      </p>
                    )}

                    <p className="meta rec-note">
                      Total cue exposure:{" "}
                      <b>{(attention.cue_exposure_seconds_total || 0).toFixed(0)}s</b>{" "}
                      across{" "}
                      {(coverage.valid_clean_windows || 0) +
                        (coverage.valid_warning_windows || 0)}{" "}
                      valid windows.
                    </p>
                  </section>
                </div>
              )}

              <div className="rec-grid2">
                <section className="rec-section" aria-labelledby="rec-identity">
                  <div className="rec-section-head">
                    <h2 id="rec-identity">Identity continuity</h2>
                    <p>
                      Session-scoped verification outcomes. A quality failure is
                      not a mismatch and never implies misconduct.
                    </p>
                  </div>
                  {Object.keys(identityOutcomes.outcomes_breakdown || {}).length >
                  0 ? (
                    <div className="rec-compare">
                      {Object.entries(identityOutcomes.outcomes_breakdown).map(
                        ([state, count]) => (
                          <div className="rec-compare-row" key={state}>
                            <i className="dot dot-neutral" aria-hidden="true" />
                            <span>{state}</span>
                            <b>{count}</b>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="notice notice-quiet">
                      <AlertIcon />
                      <span>No identity checks were recorded.</span>
                    </p>
                  )}
                </section>

                <section className="rec-section" aria-labelledby="rec-presence">
                  <div className="rec-section-head">
                    <h2 id="rec-presence">Active presence</h2>
                    <p>
                      Bounded challenge-response checks. A pass never changes an
                      engagement score.
                    </p>
                  </div>
                  <div className="rec-compare">
                    <div className="rec-compare-row">
                      <i className="dot dot-attentive" aria-hidden="true" />
                      <span>Passed</span>
                      <b>{presence.passed_count || 0}</b>
                    </div>
                    <div className="rec-compare-row">
                      <i className="dot dot-distracted" aria-hidden="true" />
                      <span>Quality fail</span>
                      <b>{presence.quality_fail_count || 0}</b>
                    </div>
                    <div className="rec-compare-row">
                      <i className="dot dot-away" aria-hidden="true" />
                      <span>Timed out</span>
                      <b>{presence.timed_out_count || 0}</b>
                    </div>
                    <div className="rec-compare-row">
                      <i className="dot dot-neutral" aria-hidden="true" />
                      <span>Declined</span>
                      <b>{presence.declined_count || 0}</b>
                    </div>
                  </div>
                  <p className="meta rec-note">
                    {presence.total_challenges_issued || 0} challenges issued
                    {presence.average_completion_ms
                      ? ` · average completion ${(presence.average_completion_ms / 1000).toFixed(1)}s`
                      : ""}
                    .
                  </p>
                </section>
              </div>

              <section className="rec-section" aria-labelledby="rec-browser">
                <div className="rec-section-head">
                  <h2 id="rec-browser">Browser focus transitions</h2>
                  <p>
                    {browser.destination_unverified_notice ||
                      "Page-hidden intervals are recorded without URL monitoring."}
                  </p>
                </div>

                {browser.intervals?.length ? (
                  <div className="rec-log">
                    {browser.intervals.slice(0, 15).map((interval, index) => (
                      <div className="rec-log-row" key={index}>
                        <span>
                          <b>{interval.participant_id}</b> · {interval.event_type}{" "}
                          for {interval.duration_seconds}s
                        </span>
                        <span className="meta">{interval.context_note}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notice notice-ok">
                    <CheckIcon />
                    <span>
                      No page-hidden or window-blur intervals in this session.
                    </span>
                  </p>
                )}
              </section>

              <section className="rec-section" aria-labelledby="rec-assessment">
                <div className="rec-section-head">
                  <h2 id="rec-assessment">Assessment &amp; resources</h2>
                  <p>
                    Question paper, declared resources, and the immutable answer
                    submission ledger.
                  </p>
                </div>

                {resources.primary_question_paper ? (
                  <div className="notice notice-ok">
                    <CheckIcon />
                    <div>
                      <p className="strong">
                        {resources.primary_question_paper.title}
                      </p>
                      <p>
                        Primary question paper · content hash{" "}
                        {resources.primary_question_paper.content_hash?.slice(
                          0,
                          20,
                        )}
                        …
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="notice notice-quiet">
                    <AlertIcon />
                    <span>No primary question paper for this session.</span>
                  </p>
                )}

                {resources.supplementary_resources?.length > 0 && (
                  <div className="rec-log">
                    {resources.supplementary_resources.map((resource, index) => (
                      <div className="rec-log-row" key={index}>
                        <span>{resource.title}</span>
                        <span className="meta">{resource.type || "file"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {submissions.submissions?.length ? (
                  <div className="rec-table-wrap">
                    <table className="rec-table">
                      <thead>
                        <tr>
                          <th>Participant</th>
                          <th>Status</th>
                          <th>Version</th>
                          <th>Submitted</th>
                          <th>Content hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.submissions.map((submission, index) => (
                          <tr key={index}>
                            <td>{submission.participant_id}</td>
                            <td>
                              <span className="badge">{submission.status}</span>
                            </td>
                            <td>v{submission.version}</td>
                            <td>
                              {submission.submitted_at
                                ? new Date(submission.submitted_at).toLocaleTimeString()
                                : "-"}
                            </td>
                            <td>
                              {submission.content_hash
                                ? `${submission.content_hash.slice(0, 16)}…`
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="notice notice-quiet">
                    <AlertIcon />
                    <span>No answer submissions recorded.</span>
                  </p>
                )}
              </section>

              <section className="rec-section" aria-labelledby="rec-context">
                <div className="rec-section-head">
                  <h2 id="rec-context">Student context &amp; teacher actions</h2>
                  <p>
                    Student context annotates evidence without erasing streaks.
                    The action log is append-only.
                  </p>
                </div>

                {studentContext.context_entries?.length ? (
                  <div className="rec-log">
                    {studentContext.context_entries.map((entry, index) => (
                      <div className="rec-log-row" key={index}>
                        <span>
                          <b>{entry.participant_id}</b> · {entry.appeal_category}
                          {entry.explanation_text ? ` — ${entry.explanation_text}` : ""}
                        </span>
                        <span className="meta">
                          {entry.requested_help ? "Asked for help" : "Context note"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notice notice-quiet">
                    <AlertIcon />
                    <span>No student context or appeals for this session.</span>
                  </p>
                )}

                {teacherActions.actions_log?.length ? (
                  <div className="rec-log">
                    {teacherActions.actions_log.map((action, index) => (
                      <div className="rec-log-row" key={index}>
                        <span>
                          <b>{action.action_type}</b>
                          {action.is_batch ? " · batch" : ""}
                          {action.note ? ` — ${action.note}` : ""}
                        </span>
                        <span className="meta">
                          {action.occurred_at
                            ? new Date(action.occurred_at).toLocaleTimeString()
                            : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notice notice-quiet">
                    <AlertIcon />
                    <span>No teacher triage actions recorded.</span>
                  </p>
                )}
              </section>
            </>
          ) : null
        ) : local ? (
          <>
            <p className="rec-lede">
              A <strong>{formatTime(duration)}</strong> class with{" "}
              <strong>{totalStudents}</strong>{" "}
              {totalStudents === 1 ? "learner" : "learners"}. The mean engagement
              was <strong>{meanPercent}%</strong>.
              {simulated > 0 && (
                <>
                  {" "}
                  {simulated} simulated{" "}
                  {simulated === 1 ? "learner is" : "learners are"} labelled as
                  demo data.
                </>
              )}
            </p>

            <dl className="rec-facts">
              <div className="rec-fact">
                <dt>TPI</dt>
                <dd>
                  {tpi != null ? (
                    <>
                      {Math.round(tpi)}
                      <small>/100</small>
                    </>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div className="rec-fact">
                <dt>Mean engagement</dt>
                <dd>{meanPercent}%</dd>
              </div>
              <div className="rec-fact">
                <dt>Learners</dt>
                <dd>
                  {totalStudents}
                  <small>
                    {live} live
                    {simulated > 0 ? ` · ${simulated} simulated` : ""}
                  </small>
                </dd>
              </div>
              <div className="rec-fact">
                <dt>Duration</dt>
                <dd>{formatTime(duration)}</dd>
              </div>
            </dl>

            <p className="meta rec-note">
              TPI is a post-class index: 60% mean engagement + 40% attention
              retention. It is not a student grade.
              {tpi == null &&
                " This session did not have enough timeline snapshots to compute it."}
            </p>

            {saveState === "saved" && (
              <p className="notice notice-ok rec-save-note" role="status">
                <CheckIcon />
                <span>Record saved. It is available under Session records.</span>
              </p>
            )}
            {saveState === "error" && (
              <p className="notice notice-flag rec-save-note" role="alert">
                <AlertIcon />
                <span>{saveError}</span>
              </p>
            )}

            <section className="rec-section" aria-labelledby="rec-timeline">
              <div className="rec-section-head">
                <h2 id="rec-timeline">Attention over time</h2>
                <p>
                  The combined line includes simulated learners when the
                  simulator was on. Live and simulated cohorts are split when
                  both exist.
                </p>
              </div>

              {metricsTimeline.length > 0 ? (
                <div className="rec-figure">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={metricsTimeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                      <XAxis
                        dataKey="time"
                        stroke={CHART.axis}
                        tick={{ fontSize: 11, fill: CHART.axis }}
                      />
                      <YAxis
                        stroke={CHART.axis}
                        tick={{ fontSize: 11, fill: CHART.axis }}
                        domain={[0, 1]}
                        ticks={[0, 0.25, 0.5, 0.75, 1]}
                        tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (value == null || Number.isNaN(value))
                            return ["-", name];
                          return [`${(Number(value) * 100).toFixed(0)}%`, name];
                        }}
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: 11,
                          color: CHART.axis,
                          paddingTop: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        isAnimationActive={!reduced}
                        animationDuration={MOTION.slow * 1000}
                        animationEasing="ease-out"
                        name="All learners"
                        stroke={CHART.ink}
                        strokeWidth={2.4}
                        dot={{ r: 2.4, fill: CHART.ink }}
                        activeDot={{ r: 4 }}
                      />
                      {hasRealLine && (
                        <Line
                          type="monotone"
                          dataKey="avgScoreReal"
                          isAnimationActive={!reduced}
                          animationDuration={MOTION.slow * 1000}
                          animationEasing="ease-out"
                          name="Live learners"
                          stroke={CHART.sage}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {hasSimLine && (
                        <Line
                          type="monotone"
                          dataKey="avgScoreSimulated"
                          isAnimationActive={!reduced}
                          animationDuration={MOTION.slow * 1000}
                          animationEasing="ease-out"
                          name="Simulated"
                          stroke={CHART.gold}
                          strokeWidth={2}
                          strokeDasharray="7 4"
                          dot={false}
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="notice notice-quiet">
                  <AlertIcon />
                  <span>Timeline data is not available for this session.</span>
                </p>
              )}
            </section>

            <div className="rec-grid2">
              <section className="rec-section" aria-labelledby="rec-distribution">
                <div className="rec-section-head">
                  <h2 id="rec-distribution">Attention distribution</h2>
                  <p>
                    Attentive above 70%, distracted between 40% and 70%, away
                    below 40%.
                  </p>
                </div>

                {distributionTotal > 0 ? (
                  <>
                    <div
                      className="rec-band"
                      role="img"
                      aria-label={`Attentive ${distributionEffective.attentive}, distracted ${distributionEffective.distracted}, away ${distributionEffective.disengaged}`}
                    >
                      {distributionEffective.attentive > 0 && (
                        <span
                          className="rec-band-seg is-attentive"
                          style={{
                            width: `${(distributionEffective.attentive / distributionTotal) * 100}%`,
                          }}
                        />
                      )}
                      {distributionEffective.distracted > 0 && (
                        <span
                          className="rec-band-seg is-distracted"
                          style={{
                            width: `${(distributionEffective.distracted / distributionTotal) * 100}%`,
                          }}
                        />
                      )}
                      {distributionEffective.disengaged > 0 && (
                        <span
                          className="rec-band-seg is-away"
                          style={{
                            width: `${(distributionEffective.disengaged / distributionTotal) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="rec-band-legend">
                      <span className="rec-band-item">
                        <i className="dot dot-attentive" /> Attentive{" "}
                        <b>{distributionEffective.attentive}</b>
                      </span>
                      <span className="rec-band-item">
                        <i className="dot dot-distracted" /> Distracted{" "}
                        <b>{distributionEffective.distracted}</b>
                      </span>
                      <span className="rec-band-item">
                        <i className="dot dot-away" /> Away{" "}
                        <b>{distributionEffective.disengaged}</b>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="notice notice-quiet">
                    <AlertIcon />
                    <span>No distribution data for this session.</span>
                  </p>
                )}
              </section>

              <section className="rec-section" aria-labelledby="rec-compare">
                <div className="rec-section-head">
                  <h2 id="rec-compare">Compared with the class mean</h2>
                  <p>
                    Strong is at least {(relativeData.hi * 100).toFixed(0)}%;
                    below is at most {(relativeData.lo * 100).toFixed(0)}%.
                  </p>
                </div>

                {relativeRows.length > 0 ? (
                  <div className="rec-compare">
                    {relativeRows.map((row) => (
                      <div className="rec-compare-row" key={row.name}>
                        <i className={`dot dot-${row.dot}`} aria-hidden="true" />
                        <span>{row.name}</span>
                        <b>{row.value}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notice notice-quiet">
                    <AlertIcon />
                    <span>Relative comparison needs more learner data.</span>
                  </p>
                )}
              </section>
            </div>

            <section className="rec-section" aria-labelledby="rec-confusion">
              <div className="rec-section-head">
                <h2 id="rec-confusion">Confusion moments</h2>
                <p>
                  Snapshots where at least 20% of learners showed confusion
                  signals.
                </p>
              </div>

              {confusionHotspots.length === 0 ? (
                <p className="notice notice-ok">
                  <CheckIcon />
                  <span>No significant confusion clusters in this class.</span>
                </p>
              ) : (
                <>
                  <div className="rec-figure">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={confusionHotspots}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis
                          dataKey="time"
                          stroke={CHART.axis}
                          tick={{ fontSize: 11, fill: CHART.axis }}
                        />
                        <YAxis
                          stroke={CHART.axis}
                          tick={{ fontSize: 11, fill: CHART.axis }}
                          domain={[0, 100]}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                          formatter={(value) => [`${value}%`, "Confusion"]}
                          contentStyle={tooltipStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                        />
                        <Bar
                          dataKey="percentage"
                          fill={CHART.gold}
                          name="Confusion"
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={!reduced}
                          animationDuration={MOTION.slow * 1000}
                          animationEasing="ease-out"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="notice notice-quiet rec-note">
                    <AlertIcon />
                    <span>
                      Peak confusion reached {peakConfusion.toFixed(0)}% of
                      learners.
                    </span>
                  </p>
                </>
              )}
            </section>

            {Object.keys(perStudentTimelines).length > 0 && (
              <section className="rec-section" aria-labelledby="rec-students">
                <div className="rec-section-head">
                  <h2 id="rec-students">Per-student attention</h2>
                  <p>
                    The expanded view is scroll-contained and lists live learners
                    first. Simulated learners are labelled.
                  </p>
                </div>

                <button
                  type="button"
                  className="rec-detail-toggle"
                  onClick={() => setShowPerStudent((prev) => !prev)}
                  aria-expanded={showPerStudent}
                  aria-controls="rec-student-grid"
                >
                  {showPerStudent ? "Hide details" : "Show details"}
                  <span aria-hidden="true">{showPerStudent ? "-" : "+"}</span>
                </button>

                {showPerStudent && (
                  <div id="rec-student-grid" className="rec-students">
                    {Object.entries(perStudentTimelines)
                      .sort(([a], [b]) => {
                        const simA = studentMeta[a]?.isSimulated ? 1 : 0;
                        const simB = studentMeta[b]?.isSimulated ? 1 : 0;
                        return simA - simB;
                      })
                      .map(([userId, data]) => {
                        const sim = studentMeta[userId]?.isSimulated;
                        const label =
                          studentMeta[userId]?.displayName || userId.slice(0, 12);
                        return (
                          <article key={userId} className="rec-student">
                            <div className="rec-student-head">
                              <span className="rec-student-name" title={label}>
                                {label}
                              </span>
                              {sim && <span className="badge">Simulated</span>}
                            </div>
                            <ResponsiveContainer width="100%" height={140}>
                              <LineChart data={data}>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke={CHART.grid}
                                />
                                <XAxis
                                  dataKey="time"
                                  stroke={CHART.axis}
                                  tick={{ fontSize: 10, fill: CHART.axis }}
                                />
                                <YAxis
                                  domain={[0, 1]}
                                  ticks={[0, 0.5, 1]}
                                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                  tick={{ fontSize: 10, fill: CHART.axis }}
                                  stroke={CHART.axis}
                                  width={34}
                                />
                                <Tooltip
                                  formatter={(v) => [
                                    `${(Number(v) * 100).toFixed(0)}%`,
                                    "Engagement",
                                  ]}
                                  contentStyle={tooltipStyle}
                                  labelStyle={tooltipLabelStyle}
                                  itemStyle={tooltipItemStyle}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="score"
                                  isAnimationActive={!reduced}
                                  animationDuration={MOTION.slow * 1000}
                                  animationEasing="ease-out"
                                  stroke={CHART.sage}
                                  strokeWidth={2}
                                  dot={{ r: 1.8 }}
                                  activeDot={{ r: 3.5 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </article>
                        );
                      })}
                  </div>
                )}
              </section>
            )}

            <section className="rec-section" aria-labelledby="rec-followup">
              <div className="rec-section-head">
                <h2 id="rec-followup">Follow-up</h2>
                <p>
                  Learners with a mean below 35%, at least 2 strikes, or at least
                  3 identity issues.
                </p>
              </div>

              {atRiskStudents.length === 0 ? (
                <p className="notice notice-ok">
                  <CheckIcon />
                  <span>No learner crossed the follow-up thresholds.</span>
                </p>
              ) : (
                <>
                  <div className="rec-followup">
                    {atRiskStudents.map((student, index) => {
                      const severity =
                        student.strikes >= 3 || student.identityIssues >= 2
                          ? "High"
                          : student.avgScore < 0.3
                            ? "Medium"
                            : "Low";
                      return (
                        <article
                          className="rec-followup-row"
                          key={`${student.userId || "learner"}-${index}`}
                        >
                          <div>
                            <p className="rec-followup-name">
                              {student.userId?.slice(0, 16) || "Unknown learner"}
                            </p>
                            <p className="rec-followup-reason">
                              {student.reason || "Crossed a follow-up threshold."}
                            </p>
                          </div>
                          <div className="rec-followup-facts">
                            <span>
                              Avg <b>{(student.avgScore * 100).toFixed(0)}%</b>
                            </span>
                            <span>
                              Strikes <b>{student.strikes || 0}</b>
                            </span>
                            <span>
                              Identity <b>{student.identityIssues || 0}</b>
                            </span>
                            <span
                              className={`badge ${severity === "High" ? "badge-flag" : severity === "Medium" ? "badge-distracted" : ""}`.trim()}
                            >
                              {severity}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <p className="notice notice-quiet rec-note">
                    <AlertIcon />
                    <span>
                      Follow up individually with these learners and check
                      support actions in the next class.
                    </span>
                  </p>
                </>
              )}
            </section>
          </>
        ) : (
          <p className="notice notice-quiet">
            <AlertIcon />
            <span>There is no record to show for this session.</span>
          </p>
        )}

        <footer className="rec-footer">
          <p className="rec-footer-note">
            A record, not a recording. No video frames, audio, page content, or
            grades are kept. TPI is a post-class index, not a student grade.
          </p>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>
            Close record
          </button>
        </footer>
      </div>

      {drilldown && (
        <div className="rec-dossier" role="dialog" aria-modal="true">
          <div className="rec-dossier-card">
            <div className="rec-dossier-head">
              <div>
                <h3>{drilldown.display_name}</h3>
                <p className="meta">{selectedParticipantId}</p>
              </div>
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => setSelectedParticipantId(null)}
              >
                Close
              </button>
            </div>

            <div>
              <div className="surface-row">
                <span className="surface-row-title">Coverage</span>
                <b>{((drilldown.coverage_ratio || 0) * 100).toFixed(0)}%</b>
              </div>
              <div className="surface-row">
                <span className="surface-row-title">Attention pattern</span>
                <b>{drilldown.attention_pattern || "-"}</b>
              </div>
              <div className="surface-row">
                <span className="surface-row-title">Identity state</span>
                <b>{drilldown.identity_state || "-"}</b>
              </div>
            </div>

            {drilldown.windows?.length > 0 && (
              <div className="rec-log">
                {drilldown.windows.map((window, index) => (
                  <div className="rec-log-row" key={index}>
                    <span>
                      Window {index + 1}: {window.classification}
                    </span>
                    <span className="meta">
                      {(window.cue_exposure_seconds || 0).toFixed(1)}s cue exposure
                    </span>
                  </div>
                ))}
              </div>
            )}

            {drilldown.browser_intervals?.length > 0 && (
              <div className="rec-log">
                {drilldown.browser_intervals.map((interval, index) => (
                  <div className="rec-log-row" key={index}>
                    <span>
                      {interval.event_type} for {interval.duration_seconds}s
                    </span>
                    <span className="meta">{interval.context_note}</span>
                  </div>
                ))}
              </div>
            )}

            {drilldown.context_entries?.length > 0 && (
              <div className="rec-log">
                {drilldown.context_entries.map((entry, index) => (
                  <div className="rec-log-row" key={index}>
                    <span>
                      [{entry.appeal_category}]{" "}
                      {entry.explanation_text || "No explanation provided"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
