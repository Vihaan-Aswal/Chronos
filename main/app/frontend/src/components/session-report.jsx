import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
import { recordReportExportAudit, fetchSessionReport, rebuildSessionReport } from "../api/reports.js";

const EASE = [0.16, 1, 0.3, 1];

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE },
  },
};

const MotionDiv = motion.div;
const MotionSection = motion.section;
const MotionArticle = motion.article;

export default function SessionReport({
  report: initialReport,
  sessionId: propSessionId,
  onClose,
}) {

  const [report, setReport] = useState(initialReport || null);
  const [loading, setLoading] = useState(!initialReport);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "review" | "telemetry" | "assessment" | "audit"

  const effectiveSessionId = propSessionId || initialReport?.session_id;


  // Load report from server if not directly passed
  useEffect(() => {
    if (initialReport) {
      setReport(initialReport);
      setLoading(false);
      return;
    }

    if (!effectiveSessionId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchSessionReport(effectiveSessionId)
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Error fetching session report:", err);
          setError(err.message || "Failed to load report");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveSessionId, initialReport]);

  const handleRebuild = async () => {
    if (!effectiveSessionId) return;
    setRebuilding(true);
    try {
      const freshReport = await rebuildSessionReport(effectiveSessionId);
      setReport(freshReport);
    } catch (err) {
      console.error("Failed to rebuild report:", err);
      alert("Failed to rebuild report: " + err.message);
    } finally {
      setRebuilding(false);
    }
  };

  const overview = report?.session_overview || {};
  const coverage = report?.observation_coverage || {};
  const tech = report?.technical_uncertainty || {};
  const attention = report?.attention_patterns || {};
  const identity = report?.identity_outcomes || {};
  const presence = report?.active_presence || {};
  const browser = report?.browser_visibility || {};
  const resources = report?.resource_usage || {};
  const submissions = report?.answer_submissions || {};
  const context = report?.student_context || {};
  const teacherActions = report?.teacher_actions || {};
  const recovery = report?.recovery_outcomes || {};
  const reviewItems = report?.review_prioritization || [];
  const drilldowns = report?.participant_drilldowns || {};
  const isDemo = Boolean(overview.is_demo);
  const isNoAnalytics = Boolean(report?.is_suppressed_by_policy || overview.policy_id === "NO_ANALYTICS");

  // Format Helpers
  const formatDuration = (mins, secs) => {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = Math.floor(mins % 60);
      return `${h}h ${m}m`;
    }
    if (mins > 0) return `${Math.floor(mins)}m`;
    return `${Math.round(secs || 0)}s`;
  };

  const handleExportPDF = async () => {
    if (!report) return;

    try {
      if (effectiveSessionId) {
        recordReportExportAudit(effectiveSessionId, { exportFormat: "pdf" }).catch(() => {});
      }

      const doc = new jsPDF();
      let y = 18;
      const margin = 18;
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Chronos Session Report", margin, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90, 105, 120);

      const subHeader = [
        `Session: ${overview.title || overview.session_id}`,
        `Policy: ${overview.policy_id} (${overview.policy_version})`,
        isDemo ? "[DEMO / SIMULATED SESSION]" : "Live Session",
        `Generated: ${new Date(report.generated_at).toLocaleString()}`,
      ].join(" | ");
      doc.text(subHeader, margin, y);
      y += 10;

      // Divider
      doc.setDrawColor(210, 225, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Section 1: Overview KPIs
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 35, 50);
      doc.text("1. Session Overview & Observation Coverage", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Duration: ${formatDuration(overview.duration_minutes, overview.duration_seconds)} | Total Learners: ${
          overview.total_participants
        } (${overview.live_participants_count} live, ${overview.simulated_participants_count} simulated)`,
        margin,
        y
      );
      y += 6;

      if (isNoAnalytics) {
        doc.text(
          "Policy Note: Behavioral analytics suppressed per NO_ANALYTICS policy snapshot.",
          margin,
          y
        );
        y += 8;
      } else {
        doc.text(
          `Observation Coverage: ${(coverage.overall_coverage_ratio * 100).toFixed(0)}% (Usable segments: ${
            coverage.total_usable_segments
          }/${coverage.total_expected_segments})`,
          margin,
          y
        );
        y += 6;
        doc.text(
          `Windows Evaluated: ${coverage.total_evaluated_windows} | Clean: ${coverage.valid_clean_windows} | Warning: ${coverage.valid_warning_windows} | Technical NO_DATA: ${coverage.no_data_windows}`,
          margin,
          y
        );
        y += 6;
        doc.setFontSize(8.5);
        doc.setTextColor(120, 135, 150);
        doc.text(
          "* Note: NO_DATA indicates unobservable intervals (camera/network gaps) and is strictly separated from attention scores.",
          margin,
          y
        );
        y += 8;
      }

      // Section 2: Review Prioritization
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 35, 50);
      doc.text("2. Review Prioritization (Evidence-Led Recommendations)", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");

      if (reviewItems.length === 0) {
        doc.text("No review recommendations. All learners maintained stable participation.", margin, y);
        y += 8;
      } else {
        reviewItems.slice(0, 10).forEach((item) => {
          if (y > 265) {
            doc.addPage();
            y = 20;
          }
          const badge = `[${item.priority_level}]`;
          const name = item.display_name;
          const reasons = item.evidence_reasons.join("; ") || "Stable observation";
          doc.setFont("helvetica", "bold");
          doc.text(`${badge} ${name}:`, margin, y);
          doc.setFont("helvetica", "normal");
          const splitReason = doc.splitTextToSize(reasons, pageWidth - margin * 2 - 45);
          doc.text(splitReason, margin + 45, y);
          y += Math.max(6, splitReason.length * 5 + 2);
        });
      }
      y += 4;

      // Section 3: Identity & Active Presence Protocol
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("3. Identity Continuity & Active Presence Protocol", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      const idDetails = Object.entries(identity.outcomes_breakdown || {})
        .filter(([, cnt]) => cnt > 0)
        .map(([st, cnt]) => `${st}: ${cnt}`)
        .join(" | ") || "None";
      doc.text(`Identity Outcomes: ${idDetails}`, margin, y);
      y += 6;

      doc.text(
        `Active Presence Challenges: ${presence.total_challenges_issued} issued | Passed: ${presence.passed_count} | Quality Fail: ${presence.quality_fail_count} | Timed Out: ${presence.timed_out_count} | Declined: ${presence.declined_count}`,
        margin,
        y
      );
      y += 8;

      // Section 4: Browser Visibility & Resources
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("4. Browser Focus Transitions & Assessment Resources", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Page Focus Transitions: ${browser.total_intervals} recorded (Total duration: ${browser.total_duration_sec}s)`,
        margin,
        y
      );
      y += 5;
      doc.setFontSize(8.5);
      doc.setTextColor(120, 135, 150);
      doc.text(browser.destination_unverified_notice || "Destination unverified.", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setTextColor(20, 35, 50);
      if (resources.primary_question_paper) {
        doc.text(
          `Question Paper: ${resources.primary_question_paper.title} (SHA-256: ${
            resources.primary_question_paper.content_hash?.slice(0, 16) || "verified"
          }...)`,
          margin,
          y
        );
        y += 6;
      }
      doc.text(
        `Answer Submissions: ${submissions.total_submissions} total (${submissions.final_submitted_count} submitted, ${submissions.draft_count} draft, ${submissions.late_count} late)`,
        margin,
        y
      );
      y += 8;

      // Section 5: Student Context & Teacher Actions
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("5. Student Context & Teacher Action Ledger", margin, y);
      y += 7;

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Student Appeals: ${context.total_appeals} submitted (${context.help_requests_count} help requests) | Teacher Triage Actions: ${teacherActions.total_actions_recorded} recorded (${teacherActions.batch_action_count} batch)`,
        margin,
        y
      );
      y += 8;

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(140, 150, 165);
      doc.text(
        "Chronos Evidence-Led Reporting Engine | Append-only verifiable projection | Privacy-compliant derived telemetry",
        margin,
        285
      );

      doc.save(`chronos-report-${overview.session_id || "session"}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Failed to export PDF: " + err.message);
    }
  };

  const surfaceCardClass =
    "rounded-2xl border border-[rgba(211,228,248,0.14)] bg-[rgba(7,25,40,0.85)] p-4 sm:p-5 backdrop-blur-md shadow-[0_12px_28px_rgba(0,0,0,0.36)]";
  const sectionTitleClass = "text-base sm:text-lg font-semibold text-[#e6eef8] tracking-tight";
  const sectionBodyClass = "text-xs sm:text-sm text-[#9fb3c9]";

  // Pie chart data for observation coverage
  const coveragePieData = useMemo(() => {
    if (isNoAnalytics) return [];
    return [
      { name: "Clean Windows", value: coverage.valid_clean_windows || 0, color: "#37d39a" },
      { name: "Warning Windows", value: coverage.valid_warning_windows || 0, color: "#dcc492" },
      { name: "NO_DATA (Technical)", value: coverage.no_data_windows || 0, color: "#7eb2ff" },
    ].filter((d) => d.value > 0);
  }, [coverage.valid_clean_windows, coverage.valid_warning_windows, coverage.no_data_windows, isNoAnalytics]);


  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#020e18]">
      <MotionDiv
        role="dialog"
        aria-modal="true"
        aria-label="Post-session evidence report"
        initial={{ opacity: 0, y: 20, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } }}
        className="relative h-full w-full overflow-hidden bg-[linear-gradient(155deg,rgba(8,26,40,0.985),rgba(3,14,24,0.99))]"
      >
        {/* Subtle Background Glows */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(220,196,146,0.1),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(126,178,255,0.12),transparent_30%)]" />

        <div className="relative z-10 flex h-full min-h-0 flex-col">
          {/* Header Bar */}
          <div className="border-b border-[rgba(211,228,248,0.12)] bg-[linear-gradient(180deg,rgba(6,22,35,0.95),rgba(5,19,30,0.9))] px-5 pb-4 pt-4 sm:px-7 sm:pt-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold tracking-tight text-[#fff6e1] sm:text-2xl">
                    {overview.title || "Session Evidence Report"}
                  </h2>
                  <span className="rounded-full border border-[rgba(211,228,248,0.25)] bg-[rgba(255,255,255,0.06)] px-2.5 py-0.5 text-[11px] font-semibold text-[#d5e6fa]">
                    {overview.policy_id || "CLASSROOM"}
                  </span>
                  {isDemo && (
                    <span className="rounded-full border border-[rgba(168,146,255,0.45)] bg-[rgba(168,146,255,0.18)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#efe8ff]">
                      Demo Mode
                    </span>
                  )}
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {overview.session_status || "ENDED"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#9fb3c9]">
                  Session ID: <span className="font-mono text-[#c6d7ea]">{overview.session_id}</span> | Policy Version: {overview.policy_version || "v1"} | Generated strictly from append-only events
                </p>
              </div>

              {/* Navigation Tabs & Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl border border-[rgba(211,228,248,0.14)] bg-[rgba(255,255,255,0.04)] p-1">
                  {[
                    { id: "overview", label: "Overview" },
                    { id: "review", label: `Review (${reviewItems.length})` },
                    { id: "telemetry", label: "Observation & Focus" },
                    { id: "assessment", label: "Assessment" },
                    { id: "audit", label: "Audit Ledger" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        activeTab === tab.id
                          ? "bg-[rgba(220,196,146,0.22)] text-[#fff0cf] shadow-sm"
                          : "text-[#9fb3c9] hover:text-[#dce8f6]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleRebuild}
                  disabled={rebuilding}
                  className="rounded-xl border border-[rgba(211,228,248,0.2)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs font-semibold text-[#d7e7f8] transition hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50"
                  title="Rebuild report from durable events"
                >
                  {rebuilding ? "Rebuilding..." : "Rebuild"}
                </button>

                <button
                  onClick={handleExportPDF}
                  className="rounded-xl border border-[rgba(220,196,146,0.36)] bg-[linear-gradient(160deg,rgba(220,196,146,0.26),rgba(220,196,146,0.1))] px-4 py-1.5 text-xs font-semibold text-[#fff4db] shadow-sm transition hover:bg-[rgba(220,196,146,0.32)]"
                >
                  Export PDF
                </button>

                <button
                  onClick={onClose}
                  className="rounded-xl border border-[rgba(211,228,248,0.2)] bg-[rgba(255,255,255,0.05)] px-3.5 py-1.5 text-xs font-semibold text-[#c0d4e9] transition hover:bg-[rgba(255,255,255,0.1)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-8 pt-5 sm:px-7">
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-[#9fb3c9]">
                <div className="text-center">
                  <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-[#dcc492] border-t-transparent mx-auto" />
                  Generating authoritative report from durable events...
                </div>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-200">
                <div className="font-semibold">Unable to load report</div>
                <div className="mt-1 text-xs text-red-300">{error}</div>
                <button
                  onClick={handleRebuild}
                  className="mt-3 rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30"
                >
                  Retry Event Rebuild
                </button>
              </div>
            ) : (
              <>
                {/* Top KPI Cards (Always Visible) */}
                <MotionSection variants={sectionVariants} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  <MotionArticle className={surfaceCardClass}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">Duration</div>
                    <div className="mt-1 text-2xl font-bold text-[#e8f0fa]">
                      {formatDuration(overview.duration_minutes, overview.duration_seconds)}
                    </div>
                    <div className="mt-1 text-xs text-[#8ea3ba]">
                      {overview.start_time ? new Date(overview.start_time).toLocaleTimeString() : "--"} – {overview.end_time ? new Date(overview.end_time).toLocaleTimeString() : "--"}
                    </div>
                  </MotionArticle>

                  <MotionArticle className={surfaceCardClass}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">Observation Coverage</div>
                    {isNoAnalytics ? (
                      <>
                        <div className="mt-1 text-2xl font-bold text-[#8fa7c2]">Suppressed</div>
                        <div className="mt-1 text-xs text-[#8fa7c2]">NO_ANALYTICS mode</div>
                      </>
                    ) : (
                      <>
                        <div className="mt-1 text-2xl font-bold text-[#37d39a]">
                          {(coverage.overall_coverage_ratio * 100).toFixed(0)}%
                        </div>
                        <div className="mt-1 text-xs text-[#8ea3ba]">
                          {coverage.valid_clean_windows + coverage.valid_warning_windows} valid / {coverage.total_evaluated_windows} evaluated windows
                        </div>
                      </>
                    )}
                  </MotionArticle>

                  <MotionArticle className={surfaceCardClass}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">Participants</div>
                    <div className="mt-1 text-2xl font-bold text-[#dce8f6]">{overview.total_participants}</div>
                    <div className="mt-1 space-y-0.5 text-xs text-[#8ea3ba]">
                      <span>{overview.live_participants_count} live enrolled</span>
                      {overview.simulated_participants_count > 0 && (
                        <span className="ml-2 text-[#dcc492]">({overview.simulated_participants_count} simulated)</span>
                      )}
                    </div>
                  </MotionArticle>

                  <MotionArticle className={surfaceCardClass}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99adc2]">Triage & Recovery</div>
                    <div className="mt-1 text-2xl font-bold text-[#fff0cf]">
                      {recovery.self_recovery_rate_pct}%
                    </div>
                    <div className="mt-1 text-xs text-[#8ea3ba]">
                      {recovery.self_resolved_cases_count} self-resolved / {recovery.total_cases_created} total cases
                    </div>
                  </MotionArticle>
                </MotionSection>

                {/* Tab: Overview */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* Review Prioritization Summary */}
                    <MotionSection variants={sectionVariants} className={surfaceCardClass}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className={sectionTitleClass}>Review Prioritization (Evidence-Led)</h3>
                          <p className={`${sectionBodyClass} mt-0.5`}>
                            Ranked recommendations based on persistent warning windows, unresolved identity checks, technical gaps, or student context. Zero guilt or violation verdicts.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab("review")}
                          className="text-xs font-semibold text-[#dcc492] hover:underline"
                        >
                          View all ({reviewItems.length}) →
                        </button>
                      </div>

                      {reviewItems.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center text-sm text-emerald-200">
                          No review cues required. All participants maintained stable participation or self-recovered from temporary conditions.
                        </div>
                      ) : (
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {reviewItems.slice(0, 6).map((item) => (
                            <div
                              key={item.participant_id}
                              onClick={() => setSelectedParticipantId(item.participant_id)}
                              className="cursor-pointer rounded-xl border border-[rgba(211,228,248,0.16)] bg-[rgba(255,255,255,0.03)] p-3.5 transition hover:border-[rgba(220,196,146,0.4)] hover:bg-[rgba(255,255,255,0.06)]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-semibold text-sm text-[#e8f0fa] truncate">
                                  {item.display_name}
                                </div>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${
                                    item.priority_level === "ACTION_REQUIRED"
                                      ? "border border-red-500/40 bg-red-500/15 text-red-200"
                                      : item.priority_level === "MONITOR"
                                      ? "border border-amber-500/40 bg-amber-500/15 text-amber-200"
                                      : item.priority_level === "TECHNICAL_REVIEW"
                                      ? "border border-blue-500/40 bg-blue-500/15 text-blue-200"
                                      : item.priority_level === "CONTEXT_REVIEW"
                                      ? "border border-purple-500/40 bg-purple-500/15 text-purple-200"
                                      : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  }`}
                                >
                                  {item.priority_level.replace("_", " ")}
                                </span>
                              </div>
                              <ul className="mt-2 space-y-1 text-xs text-[#9fb3c9]">
                                {item.evidence_reasons.slice(0, 2).map((r, idx) => (
                                  <li key={idx} className="line-clamp-2">
                                    • {r}
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#8ea3ba] border-t border-[rgba(211,228,248,0.08)] pt-2">
                                <span>Coverage: {(item.coverage_ratio * 100).toFixed(0)}%</span>
                                <span className="text-[#dcc492]">Inspect Dossier →</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </MotionSection>

                    {/* Coverage & Technical Health vs Attention Overview */}
                    {!isNoAnalytics && (
                      <MotionSection variants={sectionVariants} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {/* Coverage Breakdown */}
                        <article className={surfaceCardClass}>
                          <h3 className={sectionTitleClass}>Observation Coverage & Technical Health</h3>
                          <p className={`${sectionBodyClass} mt-1`}>
                            NO_DATA periods represent unobservable technical conditions and are strictly separated from attention scores.
                          </p>

                          <div className="mt-4 flex flex-col items-center sm:flex-row sm:items-center sm:justify-around gap-4">
                            <div className="h-48 w-48 flex-none">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={coveragePieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={3}
                                    dataKey="value"
                                  >
                                    {coveragePieData.map((entry, idx) => (
                                      <Cell key={`cov-${idx}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="space-y-2 text-xs text-[#bdd0e4]">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-[#37d39a]" />
                                <span>Valid Clean: {coverage.valid_clean_windows} windows</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-[#dcc492]" />
                                <span>Valid Warning: {coverage.valid_warning_windows} windows</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-[#7eb2ff]" />
                                <span>NO_DATA (Technical): {coverage.no_data_windows} windows</span>
                              </div>
                            </div>
                          </div>

                          {Object.keys(tech.reason_counts || {}).length > 0 && (
                            <div className="mt-4 border-t border-[rgba(211,228,248,0.1)] pt-3 text-xs text-[#9fb3c9]">
                              <span className="font-semibold text-[#dce8f6]">Recorded Technical Reasons: </span>
                              {Object.entries(tech.reason_counts).map(([r, cnt]) => (
                                <span key={r} className="inline-block mr-2 mt-1 rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5">
                                  {r}: {cnt}
                                </span>
                              ))}
                            </div>
                          )}
                        </article>

                        {/* Attention Pattern Breakdown */}
                        <article className={surfaceCardClass}>
                          <h3 className={sectionTitleClass}>Attention Pattern Classification</h3>
                          <p className={`${sectionBodyClass} mt-1`}>
                            Windows evaluated strictly during usable video segments with single face and sufficient pose confidence.
                          </p>

                          <div className="mt-4 space-y-3">
                            {Object.entries(attention.distribution || {}).map(([pattern, count]) => (
                              <div key={pattern} className="space-y-1">
                                <div className="flex justify-between text-xs font-semibold text-[#dce8f6]">
                                  <span>{pattern}</span>
                                  <span>{count} learners</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                                  <div
                                    className={`h-full rounded-full ${
                                      pattern === "STABLE"
                                        ? "bg-[#37d39a]"
                                        : pattern === "VARIABLE"
                                        ? "bg-[#dcc492]"
                                        : pattern === "SUSTAINED_CONCERN"
                                        ? "bg-[#ff6f7d]"
                                        : "bg-[#7eb2ff]"
                                    }`}
                                    style={{
                                      width: `${overview.total_participants ? (count / overview.total_participants) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 rounded-xl border border-[rgba(211,228,248,0.12)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[#9fb3c9]">
                            Total cue exposure across all participants: <span className="font-semibold text-[#e8f0fa]">{attention.cue_exposure_seconds_total?.toFixed(0) || 0}s</span> across {coverage.valid_clean_windows + coverage.valid_warning_windows} valid windows.
                          </div>
                        </article>
                      </MotionSection>
                    )}
                  </div>
                )}

                {/* Tab: Review Prioritization Deep Dive */}
                {activeTab === "review" && (
                  <MotionSection variants={sectionVariants} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className={sectionTitleClass}>Review Prioritization Dossier</h3>
                        <p className={`${sectionBodyClass} mt-0.5`}>
                          Comprehensive evidence summaries for all participants requiring pedagogical follow-up or technical support.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {reviewItems.map((item) => (
                        <article
                          key={item.participant_id}
                          className="rounded-xl border border-[rgba(211,228,248,0.16)] bg-[rgba(7,25,40,0.9)] p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-bold text-[#f0f6fc] text-base">{item.display_name}</div>
                              <div className="text-xs text-[#8ea3ba] font-mono">{item.participant_id}</div>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                item.priority_level === "ACTION_REQUIRED"
                                  ? "border border-red-500/40 bg-red-500/15 text-red-200"
                                  : item.priority_level === "MONITOR"
                                  ? "border border-amber-500/40 bg-amber-500/15 text-amber-200"
                                  : item.priority_level === "TECHNICAL_REVIEW"
                                  ? "border border-blue-500/40 bg-blue-500/15 text-blue-200"
                                  : item.priority_level === "CONTEXT_REVIEW"
                                  ? "border border-purple-500/40 bg-purple-500/15 text-purple-200"
                                  : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              }`}
                            >
                              {item.priority_level.replace("_", " ")}
                            </span>
                          </div>

                          <div className="mt-3 rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-3">
                            <div className="text-xs font-semibold text-[#dce8f6] mb-1">Evidence Rationales:</div>
                            <ul className="space-y-1 text-xs text-[#9fb3c9]">
                              {item.evidence_reasons.map((r, idx) => (
                                <li key={idx}>• {r}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="rounded bg-[rgba(255,255,255,0.04)] p-2">
                              <div className="text-[10px] text-[#8ea3ba]">Coverage</div>
                              <div className="font-semibold text-[#e8f0fa]">{(item.coverage_ratio * 100).toFixed(0)}%</div>
                            </div>
                            <div className="rounded bg-[rgba(255,255,255,0.04)] p-2">
                              <div className="text-[10px] text-[#8ea3ba]">Warning Streak</div>
                              <div className="font-semibold text-[#e8f0fa]">{item.warning_streak}</div>
                            </div>
                            <div className="rounded bg-[rgba(255,255,255,0.04)] p-2">
                              <div className="text-[10px] text-[#8ea3ba]">Identity State</div>
                              <div className="font-semibold text-[#e8f0fa] truncate">{item.identity_state}</div>
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => setSelectedParticipantId(item.participant_id)}
                              className="rounded-lg border border-[rgba(220,196,146,0.3)] bg-[rgba(220,196,146,0.12)] px-3 py-1 text-xs font-semibold text-[#fff0cf] hover:bg-[rgba(220,196,146,0.22)]"
                            >
                              Inspect Full Timeline & Evidence →
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </MotionSection>
                )}

                {/* Tab: Telemetry & Focus */}
                {activeTab === "telemetry" && (
                  <div className="space-y-6">
                    {/* Identity & Active Presence */}
                    <MotionSection variants={sectionVariants} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <article className={surfaceCardClass}>
                        <h3 className={sectionTitleClass}>Identity Continuity</h3>
                        <p className={`${sectionBodyClass} mt-1`}>
                          Session-scoped verification outcomes. Quality failures are distinct from mismatches and never imply misconduct.
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(identity.outcomes_breakdown || {}).map(([st, cnt]) => (
                            <div key={st} className="rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5">
                              <div className="text-[10px] text-[#8ea3ba]">{st}</div>
                              <div className="text-base font-bold text-[#e8f0fa]">{cnt}</div>
                            </div>
                          ))}
                        </div>
                      </article>

                      <article className={surfaceCardClass}>
                        <h3 className={sectionTitleClass}>Active Presence Protocol</h3>
                        <p className={`${sectionBodyClass} mt-1`}>
                          Bounded challenge-response presence checks. Passes never alter engagement scores.
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5">
                            <div className="text-[10px] text-[#8ea3ba]">Passed</div>
                            <div className="text-base font-bold text-[#37d39a]">{presence.passed_count || 0}</div>
                          </div>
                          <div className="rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5">
                            <div className="text-[10px] text-[#8ea3ba]">Quality Fail</div>
                            <div className="text-base font-bold text-[#7eb2ff]">{presence.quality_fail_count || 0}</div>
                          </div>
                          <div className="rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5">
                            <div className="text-[10px] text-[#8ea3ba]">Timed Out</div>
                            <div className="text-base font-bold text-[#dcc492]">{presence.timed_out_count || 0}</div>
                          </div>
                          <div className="rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5">
                            <div className="text-[10px] text-[#8ea3ba]">Declined</div>
                            <div className="text-base font-bold text-[#ff6f7d]">{presence.declined_count || 0}</div>
                          </div>
                        </div>
                        {presence.average_completion_ms && (
                          <div className="mt-3 text-xs text-[#8ea3ba]">
                            Average completion time: {(presence.average_completion_ms / 1000).toFixed(1)}s
                          </div>
                        )}
                      </article>
                    </MotionSection>

                    {/* Browser Focus Transitions */}
                    <MotionSection variants={sectionVariants} className={surfaceCardClass}>
                      <h3 className={sectionTitleClass}>Browser Focus Transitions</h3>
                      <p className={`${sectionBodyClass} mt-1`}>
                        {browser.destination_unverified_notice || "Page hidden intervals are recorded without URL monitoring."}
                      </p>

                      {browser.intervals?.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.02)] p-4 text-center text-xs text-[#9fb3c9]">
                          No page-hidden or window blur intervals recorded during this session.
                        </div>
                      ) : (
                        <div className="mt-4 max-h-60 overflow-y-auto space-y-2 pr-1">
                          {browser.intervals?.slice(0, 15).map((b, idx) => (
                            <div
                              key={idx}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5 text-xs text-[#9fb3c9]"
                            >
                              <div>
                                <span className="font-semibold text-[#e8f0fa]">{b.participant_id}</span>: {b.event_type} for {b.duration_seconds}s
                              </div>
                              <div className="text-[11px] text-[#8ea3ba]">
                                {b.context_note}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </MotionSection>
                  </div>
                )}

                {/* Tab: Assessment & Resources */}
                {activeTab === "assessment" && (
                  <div className="space-y-6">
                    {/* Question Paper & Declared Resources */}
                    <MotionSection variants={sectionVariants} className={surfaceCardClass}>
                      <h3 className={sectionTitleClass}>Assessment Question Paper & Resources</h3>
                      <div className="mt-4 space-y-3 text-xs">
                        {resources.primary_question_paper ? (
                          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100">
                            <div>
                              <div className="font-bold text-sm">{resources.primary_question_paper.title}</div>
                              <div className="text-[11px] text-emerald-300">
                                Primary Question Paper • Content Hash: {resources.primary_question_paper.content_hash?.slice(0, 20)}...
                              </div>
                            </div>
                            <span className="rounded bg-emerald-600/30 px-2 py-0.5 text-[10px] font-semibold">
                              IMMUTABLE
                            </span>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[rgba(211,228,248,0.1)] p-3 text-[#9fb3c9]">
                            No primary question paper published for this session.
                          </div>
                        )}

                        {resources.supplementary_resources?.length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <div className="font-semibold text-[#dce8f6]">Supplementary Resources:</div>
                            {resources.supplementary_resources.map((r, idx) => (
                              <div key={idx} className="rounded-lg bg-[rgba(255,255,255,0.03)] p-2 text-[#9fb3c9]">
                                {r.title} ({r.type || "file"})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </MotionSection>

                    {/* Answer Submissions */}
                    <MotionSection variants={sectionVariants} className={surfaceCardClass}>
                      <h3 className={sectionTitleClass}>Subjective Answer Submissions</h3>
                      <p className={`${sectionBodyClass} mt-1`}>
                        Immutable record of student submission timestamps, artifact versions, content hashes, and late status.
                      </p>

                      {submissions.submissions?.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-[rgba(211,228,248,0.1)] p-4 text-center text-xs text-[#9fb3c9]">
                          No answer submissions recorded for this session.
                        </div>
                      ) : (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-left text-xs text-[#9fb3c9]">
                            <thead className="border-b border-[rgba(211,228,248,0.12)] text-[11px] uppercase tracking-wider text-[#8ea3ba]">
                              <tr>
                                <th className="pb-2">Participant</th>
                                <th className="pb-2">Status</th>
                                <th className="pb-2">Version</th>
                                <th className="pb-2">Submitted At</th>
                                <th className="pb-2">Content Hash</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[rgba(211,228,248,0.06)]">
                              {submissions.submissions?.map((s, idx) => (
                                <tr key={idx} className="hover:bg-[rgba(255,255,255,0.02)]">
                                  <td className="py-2.5 font-semibold text-[#e8f0fa]">{s.participant_id}</td>
                                  <td className="py-2.5">
                                    <span
                                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                        s.status === "SUBMITTED"
                                          ? "bg-emerald-500/20 text-emerald-300"
                                          : s.status === "LATE"
                                          ? "bg-amber-500/20 text-amber-300"
                                          : "bg-blue-500/20 text-blue-300"
                                      }`}
                                    >
                                      {s.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5">v{s.version}</td>
                                  <td className="py-2.5">{s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : "--"}</td>
                                  <td className="py-2.5 font-mono text-[11px] text-[#8ea3ba]">
                                    {s.content_hash ? `${s.content_hash.slice(0, 16)}...` : "--"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </MotionSection>
                  </div>
                )}

                {/* Tab: Audit & Context */}
                {activeTab === "audit" && (
                  <div className="space-y-6">
                    {/* Student Context & Appeals */}
                    <MotionSection variants={sectionVariants} className={surfaceCardClass}>
                      <h3 className={sectionTitleClass}>Student Context & Self-Reported Appeals</h3>
                      <p className={`${sectionBodyClass} mt-1`}>
                        Student context annotates evidence without erasing streaks. Asynchronous review baseline.
                      </p>

                      {context.context_entries?.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-[rgba(211,228,248,0.1)] p-4 text-center text-xs text-[#9fb3c9]">
                          No student context submissions or appeals for this session.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2.5">
                          {context.context_entries?.map((ctx, idx) => (
                            <div key={idx} className="rounded-xl border border-[rgba(211,228,248,0.12)] bg-[rgba(255,255,255,0.03)] p-3 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#e8f0fa]">{ctx.participant_id}</span>
                                <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                                  {ctx.appeal_category}
                                </span>
                              </div>
                              {ctx.explanation_text && (
                                <p className="mt-1.5 text-[#9fb3c9] italic">"{ctx.explanation_text}"</p>
                              )}
                              {ctx.requested_help && (
                                <div className="mt-1 text-[11px] font-semibold text-amber-300">
                                  ⚠️ Student explicitly requested teacher assistance.
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </MotionSection>

                    {/* Teacher Action Audit Log */}
                    <MotionSection variants={sectionVariants} className={surfaceCardClass}>
                      <h3 className={sectionTitleClass}>Teacher Triage Action Log</h3>
                      <p className={`${sectionBodyClass} mt-1`}>
                        Immutable audit ledger of all triage resolutions, acknowledgments, snoozes, and batch actions.
                      </p>

                      {teacherActions.actions_log?.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-[rgba(211,228,248,0.1)] p-4 text-center text-xs text-[#9fb3c9]">
                          No teacher triage actions recorded for this session.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {teacherActions.actions_log?.map((act, idx) => (
                            <div key={idx} className="flex items-center justify-between rounded-lg border border-[rgba(211,228,248,0.1)] bg-[rgba(255,255,255,0.03)] p-2.5 text-xs text-[#9fb3c9]">
                              <div>
                                <span className="font-semibold text-[#e8f0fa]">{act.action_type}</span>
                                {act.is_batch && <span className="ml-2 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300">BATCH</span>}
                                {act.note && <span className="ml-2 italic text-[#8ea3ba]">- {act.note}</span>}
                              </div>
                              <span className="text-[11px] text-[#8ea3ba]">
                                {act.occurred_at ? new Date(act.occurred_at).toLocaleTimeString() : "--"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </MotionSection>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Participant Evidence Dossier Modal */}
        <AnimatePresence>
          {selectedParticipantId && drilldowns[selectedParticipantId] && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
              <MotionDiv
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(211,228,248,0.2)] bg-[#071928] p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-[#fff6e1]">
                      {drilldowns[selectedParticipantId].display_name}
                    </h4>
                    <p className="text-xs text-[#8ea3ba] font-mono">{selectedParticipantId}</p>
                  </div>
                  <button
                    onClick={() => setSelectedParticipantId(null)}
                    className="rounded-lg border border-[rgba(211,228,248,0.2)] px-2.5 py-1 text-xs text-[#9fb3c9] hover:bg-[rgba(255,255,255,0.08)]"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-[rgba(255,255,255,0.04)] p-2.5">
                    <div className="text-[10px] text-[#8ea3ba]">Coverage</div>
                    <div className="font-bold text-[#e8f0fa]">
                      {(drilldowns[selectedParticipantId].coverage_ratio * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-[rgba(255,255,255,0.04)] p-2.5">
                    <div className="text-[10px] text-[#8ea3ba]">Attention Pattern</div>
                    <div className="font-bold text-[#e8f0fa]">{drilldowns[selectedParticipantId].attention_pattern}</div>
                  </div>
                  <div className="rounded-lg bg-[rgba(255,255,255,0.04)] p-2.5">
                    <div className="text-[10px] text-[#8ea3ba]">Identity State</div>
                    <div className="font-bold text-[#e8f0fa]">{drilldowns[selectedParticipantId].identity_state}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-xs text-[#9fb3c9]">
                  <div>
                    <div className="font-semibold text-[#dce8f6] mb-1">Finalized Windows ({drilldowns[selectedParticipantId].windows?.length || 0}):</div>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {drilldowns[selectedParticipantId].windows?.map((w, idx) => (
                        <div key={idx} className="flex justify-between rounded bg-[rgba(255,255,255,0.03)] p-1.5">
                          <span>Window {idx + 1}: {w.classification}</span>
                          <span className="text-[#8ea3ba]">{w.cue_exposure_seconds?.toFixed(1)}s cue exp</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {drilldowns[selectedParticipantId].browser_intervals?.length > 0 && (
                    <div>
                      <div className="font-semibold text-[#dce8f6] mb-1">Browser Focus Transitions:</div>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {drilldowns[selectedParticipantId].browser_intervals?.map((b, idx) => (
                          <div key={idx} className="rounded bg-[rgba(255,255,255,0.03)] p-1.5 text-[11px]">
                            {b.event_type} for {b.duration_seconds}s • {b.context_note}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {drilldowns[selectedParticipantId].context_entries?.length > 0 && (
                    <div>
                      <div className="font-semibold text-[#dce8f6] mb-1">Student Context Appeals:</div>
                      {drilldowns[selectedParticipantId].context_entries?.map((c, idx) => (
                        <div key={idx} className="rounded bg-purple-500/10 p-2 text-purple-200">
                          [{c.appeal_category}] {c.explanation_text || "No explanation provided"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </MotionDiv>
            </div>
          )}
        </AnimatePresence>
      </MotionDiv>
    </div>
  );
}
