// src/pages/TeacherPage.jsx

import { useLocation, useSearchParams } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";

import useTeacherWebSocket from "../hooks/use-teacher-websocket";
import useClassroomSimulator, {
  isSimulatedStudentId,
} from "../hooks/use-classroom-simulator.js";
import HMSMeeting from "../meeting/hms-meeting.jsx";
import JoinScreen from "../components/join-screen.jsx";
import DashboardTopbar from "../components/teacher/dashboard-topbar.jsx";
import StatusStrip from "../components/teacher/status-strip.jsx";
import SummaryCards from "../components/teacher/summary-cards.jsx";
import StudentCard from "../components/teacher/student-card.jsx";

import SessionReport from "../components/session-report.jsx";
import AssessmentManagementModal from "../components/teacher/assessment-management-modal.jsx";
import CaseTriageRail from "../components/teacher/case-triage-rail.jsx";
import { sendTeacherAction, sendBatchTeacherAction, fetchSessionCases } from "../api/teacher-actions.js";
import { triggerLiveness } from "../api/liveness.js";
import { fetchSessionReport } from "../api/reports.js";

import "../styles/dashboard-shared.css";
import "../styles/teacher-dashboard.css";

export default function TeacherPage() {
  const location = useLocation();
  const [params] = useSearchParams();

  let user = location.state?.user;
  if (!user) {
    try {
      const raw = sessionStorage.getItem("chronos_user");
      if (raw) user = JSON.parse(raw);
    } catch {
      user = null;
    }
  }

  const sessionId = params.get("sessionId") || "default-session";
  const userName = user?.email || "Teacher";
  const teacherId = user?.id || "";
  const readinessCompleted = location.state?.readinessCompleted === true;

  const [inMeeting, setInMeeting] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [strictMode, setStrictMode] = useState(false);

  /** Lenient class vs strict exam engagement (student-side scoring). */
  const [classContextMode, setClassContextMode] = useState("class");
  const [simulateClassroom, setSimulateClassroom] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(true);
  const [ignoredUserIds, setIgnoredUserIds] = useState(new Set());
  const [removedUserIds, setRemovedUserIds] = useState(new Set());
  const [railOpen, setRailOpen] = useState(false);
  const [sideRailTab, setSideRailTab] = useState("cases"); // "cases" | "grid"

  const sessionStartRef = useRef(null);
  const metricsHistoryRef = useRef([]);
  const readinessAutoJoinRef = useRef(false);
  const railToggleButtonRef = useRef(null);
  const isMountedRef = useRef(true);
  const livenessRequestIdRef = useRef(0);
  const pastReportAbortRef = useRef(null);
  const pastReportRequestIdRef = useRef(0);

  const { connected, students, cases = [], setCases } = useTeacherWebSocket(sessionId);

  const [showDisconnect, setShowDisconnect] = useState(false);
  useEffect(() => {
    const targetVisible = inMeeting && !connected;
    const delay = targetVisible ? 2000 : 0;
    const t = setTimeout(() => setShowDisconnect(targetVisible), delay);
    return () => clearTimeout(t);
  }, [inMeeting, connected]);
  useClassroomSimulator(sessionId, inMeeting && simulateClassroom);

  // Fetch initial session cases from server
  useEffect(() => {
    if (!sessionId || !inMeeting) return;
    fetchSessionCases(sessionId)
      .then((res) => {
        if (res && Array.isArray(res.cases) && typeof setCases === "function") {
          setCases(res.cases);
        }
      })
      .catch((err) => console.warn("Failed to fetch initial cases:", err));
  }, [sessionId, inMeeting, setCases]);

  const handleBatchAction = async ({ caseIds, actionType, note, snoozeDurationMinutes }) => {
    try {
      await sendBatchTeacherAction(sessionId, {
        caseIds,
        actionType,
        note,
        snoozeDurationMinutes,
      });
      const res = await fetchSessionCases(sessionId);
      if (res && Array.isArray(res.cases) && typeof setCases === "function") {
        setCases(res.cases);
      }
    } catch (err) {
      console.error("Batch teacher action failed:", err);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pastReportAbortRef.current?.abort();
    };
  }, []);

  const allStudents = Object.entries(students)
    .filter(([uid]) => !removedUserIds.has(uid))
    .map(([uid, data]) => ({ userId: uid, ...data }));

  const isFlagged = (s) => {
    if (ignoredUserIds.has(s.userId)) return false;
    const hasIdentityIssue =
      s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2;
    const isActionRequired = s.caseState === "ACTION_REQUIRED" || (s.warningStreak || s.strikes || 0) >= 3;
    const isMonitor = s.caseState === "MONITOR" || (s.warningStreak || 0) >= 2;
    const hasMultiFace = s.multiFaceDetected === true;
    const hasPresenceFail = s.livenessFailed === true || s.activePresenceState === "QUALITY_FAIL" || s.activePresenceState === "TIMED_OUT";
    return (
      isActionRequired ||
      isMonitor ||
      hasIdentityIssue ||
      hasMultiFace ||
      hasPresenceFail
    );
  };

  const studentArray = showFlaggedOnly
    ? allStudents.filter(isFlagged)
    : allStudents;

  const severityScore = (s) => {
    const hasIdentity =
      s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2;
    const isActionRequired = s.caseState === "ACTION_REQUIRED" || (s.warningStreak || s.strikes || 0) >= 3;
    const hasMultiFace = s.multiFaceDetected === true;
    if (isActionRequired || hasIdentity) return 3;
    if (s.caseState === "MONITOR" || hasMultiFace) return 2;
    if ((s.warningStreak || 0) >= 1 || (s.score || 0) < 0.4) return 1;
    return 0;
  };

  const sortedStudents = [...studentArray].sort(
    (a, b) => severityScore(b) - severityScore(a),
  );

  const handleMarkEngaged = async (userId) => {
    try {
      await sendTeacherAction(sessionId, userId, "mark_engaged");
    } catch (err) {
      console.error(err);
    }
  };

  const handleIgnore = (userId) => {
    setIgnoredUserIds((prev) => new Set([...prev, userId]));
  };

  const handleRemove = (userId) => {
    setRemovedUserIds((prev) => new Set([...prev, userId]));
    sendTeacherAction(sessionId, userId, "remove").catch(() => {});
  };

  const handleMessage = async (userId) => {
    const text = window.prompt("Enter message to send:");
    if (text) {
      try {
        await sendTeacherAction(sessionId, userId, "message", text);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const [livenessLoading, setLivenessLoading] = useState(false);
  const handleCheckEngagement = async (userId = null) => {
    const requestId = livenessRequestIdRef.current + 1;
    livenessRequestIdRef.current = requestId;
    if (isMountedRef.current) {
      setLivenessLoading(true);
    }
    try {
      await triggerLiveness(sessionId, userId);
    } catch (err) {
      console.error(err);
    } finally {
      if (isMountedRef.current && livenessRequestIdRef.current === requestId) {
        setLivenessLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!inMeeting) return;

    const collectMetrics = () => {
      // Build a fresh snapshot from the live `students` state
      const currentStudentArray = Object.entries(students).map(
        ([uid, data]) => ({ userId: uid, ...data }),
      );
      if (currentStudentArray.length === 0) return;

      const scores = currentStudentArray.map((s) => s.score || 0);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      const studentSnapshot = {};
      currentStudentArray.forEach((s) => {
        studentSnapshot[s.userId] = {
          score: s.score || 0,
          strikes: s.strikes || 0,
          warningStreak: s.warningStreak || 0,
          cleanStreak: s.cleanStreak || 0,
          caseState: s.caseState || "NONE",
          timestamp: s.timestamp || new Date().toISOString(),
          gazeDirection: s.gazeDirection || "center",
          ear: s.ear || 0.35,
          headPose: s.headPose || { yaw: 0, pitch: 0 },
          presence: s.presence || "unknown",
          identityStatus: s.identityStatus || "checking",
          identityMismatchCount: s.identityMismatchCount || 0,
          isSimulated: Boolean(s.isSimulated),
        };
      });

      metricsHistoryRef.current.push({
        timestamp: new Date().toISOString(),
        avgScore,
        studentCount: currentStudentArray.length,
        students: studentSnapshot,
      });
    };

    collectMetrics();
    const interval = setInterval(collectMetrics, 30000);

    return () => clearInterval(interval);
  }, [inMeeting, students]);

  const statusLabel = (
    score,
    strikes,
    identityStatus,
    identityMismatchCount,
    warningStreak,
  ) => {
    if (identityStatus === "mismatch" && identityMismatchCount >= 2)
      return "Identity Review Required";
    if ((warningStreak || strikes) >= 3) return "Action Required";
    if ((warningStreak || 0) >= 1) return "Monitor";
    if (score > 0.7) return "Attentive";
    if (score >= 0.4) return "Variable";
    return "Observation Gap";
  };

  const getStatusKey = (student) => {
    const hasIdentityIssue =
      student.identityStatus === "mismatch" &&
      (student.identityMismatchCount || 0) >= 2;
    const isActionReq = student.caseState === "ACTION_REQUIRED" || (student.warningStreak || student.strikes || 0) >= 3;

    if (hasIdentityIssue) return "identity";
    if (isActionReq || student.multiFaceDetected) return "risk";
    if (student.livenessFailed || student.caseState === "MONITOR")
      return "distracted";
    if ((student.score || 0) >= 0.7) return "attentive";
    return "distracted";
  };

  const getPriority = (student) => {
    const score = severityScore(student);
    if (score >= 3) return "critical";
    if (score >= 2) return "high";
    return "moderate";
  };

  const getStageStatus = (student) => {
    if (isFlagged(student)) return "flagged";

    const label = statusLabel(
      student.score,
      student.strikes,
      student.identityStatus,
      student.identityMismatchCount,
      student.warningStreak,
    );

    if (label === "Attentive") return "attentive";
    if (label === "Variable") return "distracted";
    return "away";
  };

  const getSignals = (student) => {
    const signalPills = [];

    if (
      student.identityStatus === "mismatch" &&
      (student.identityMismatchCount || 0) >= 2
    ) {
      signalPills.push({ label: "Identity needs review", tone: "alert" });
    }

    if (student.multiFaceDetected) {
      signalPills.push({ label: "Multiple faces", tone: "alert" });
    }

    if (student.activePresenceState === "PASSED" || student.livenessVerified) {
      signalPills.push({ label: "Presence verified", tone: "ok" });
    }

    if (student.livenessFailed || student.activePresenceState === "QUALITY_FAIL" || student.activePresenceState === "TIMED_OUT") {
      signalPills.push({ label: "Presence unconfirmed", tone: "violet" });
    }

    const streak = student.warningStreak || student.strikes || 0;
    if (streak > 0) {
      signalPills.push({
        label: `${streak} warning window${streak > 1 ? "s" : ""}`,
        tone: streak >= 3 ? "alert" : "warn",
      });
    }

    if (signalPills.length === 0) {
      signalPills.push({
        label: (student.score || 0) >= 0.7 ? "Stable" : "Variable focus",
        tone: (student.score || 0) >= 0.7 ? "ok" : "warn",
      });
    }

    return signalPills;
  };

  const handleJoinMeeting = useCallback(() => {
    sessionStartRef.current = new Date();
    setInMeeting(true);
  }, []);

  const closeRail = useCallback(() => {
    setRailOpen(false);
    window.setTimeout(() => {
      railToggleButtonRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!railOpen) return;

    const onWindowKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRail();
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [railOpen, closeRail]);

  useEffect(() => {
    if (
      !readinessCompleted ||
      inMeeting ||
      sessionEnded ||
      readinessAutoJoinRef.current
    ) {
      return;
    }
    readinessAutoJoinRef.current = true;
    const timeoutId = window.setTimeout(() => {
      handleJoinMeeting();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [readinessCompleted, inMeeting, sessionEnded, handleJoinMeeting]);

  const handleToggleClassContext = async () => {
    const next = classContextMode === "class" ? "exam" : "class";
    setClassContextMode(next);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/set-class-context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            context: next,
          }),
        },
      );
      if (!res.ok) {
        setClassContextMode(next === "exam" ? "class" : "exam");
        console.error("Failed to set class context");
      }
    } catch (err) {
      setClassContextMode(next === "exam" ? "class" : "exam");
      console.error("Failed to set class context:", err);
    }
  };

  const handleToggleStrictMode = async () => {
    const newMode = !strictMode;
    setStrictMode(newMode);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/set-mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            mode: newMode ? "strict" : "normal",
          }),
        },
      );
      if (!res.ok) {
        setStrictMode(!newMode);
        console.error("Failed to set session mode");
      }
    } catch (err) {
      setStrictMode(!newMode);
      console.error("Failed to set session mode:", err);
    }
  };

  const handleLeaveMeeting = () => {
    setSessionEnded(true);
    setInMeeting(false);
    setSimulateClassroom(false);
    setSelectedPastSession(null);
    setShowReport(true);
  };

  const handleCloseReport = () => {
    setShowReport(false);
    setSelectedPastSession(null);
    window.location.href = "/";
  };

  const [pastSessions, setPastSessions] = useState([]);
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [selectedPastSession, setSelectedPastSession] = useState(null);

  const loadPastSessions = async () => {
    setLoadingPast(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/analytics/list?teacher_id=${teacherId}`,
      );
      const data = await res.json();
      setPastSessions(data.sessions || []);
      setShowPastSessions(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPast(false);
    }
  };

  const loadPastSessionReport = async (session) => {
    pastReportAbortRef.current?.abort();
    const abortController = new AbortController();
    pastReportAbortRef.current = abortController;
    const requestId = pastReportRequestIdRef.current + 1;
    pastReportRequestIdRef.current = requestId;

    try {
      setLoadingPast(true);
      const rep = await fetchSessionReport(session.session_id);
      if (requestId !== pastReportRequestIdRef.current) return;
      setSelectedPastSession(rep);
      setShowPastSessions(false);
      setShowReport(true);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error("Error loading session report:", err);
      setSelectedPastSession({ session_id: session.session_id });
      setShowPastSessions(false);
      setShowReport(true);
    } finally {
      if (pastReportAbortRef.current === abortController) {
        pastReportAbortRef.current = null;
      }
      setLoadingPast(false);
    }
  };

  const presentCount = allStudents.length;
  const attentiveCount = allStudents.filter(
    (s) =>
      statusLabel(
        s.score,
        s.strikes,
        s.identityStatus,
        s.identityMismatchCount,
      ) === "Attentive",
  ).length;
  const distractedCount = allStudents.filter((s) => {
    const label = statusLabel(
      s.score,
      s.strikes,
      s.identityStatus,
      s.identityMismatchCount,
    );
    return label === "Distracted";
  }).length;
  const criticalCount = allStudents.filter((s) => severityScore(s) >= 2).length;
  const flaggedCount = allStudents.filter((s) => isFlagged(s)).length;
  const identityIssueCount = allStudents.filter(
    (s) =>
      s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2,
  ).length;
  const avgScore =
    allStudents.length > 0
      ? Math.round(
          (allStudents.reduce((sum, s) => sum + (s.score || 0), 0) /
            allStudents.length) *
            100,
        )
      : 0;

  const cameraStudents = allStudents.map((s) => {
    const isSim = s.isSimulated === true || isSimulatedStudentId(s.userId);
    return {
      userId: s.userId,
      score: s.score || 0,
      timestamp: s.timestamp,
      isSimulated: isSim,
      stageStatus: getStageStatus(s),
      statusLabel: statusLabel(
        s.score,
        s.strikes,
        s.identityStatus,
        s.identityMismatchCount,
      ),
    };
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Session Expired
          </h2>
          <p className="text-slate-600 mb-4">
            No user found. Please login again.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  if (!inMeeting && !sessionEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 p-6">
        <div className="max-w-md mx-auto">
          <div className="mb-4 flex justify-between items-center">
            <button
              onClick={() => setShowAssessmentModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-900 text-sm font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Assessment & Resources
            </button>
            <button
              onClick={loadPastSessions}
              disabled={loadingPast}
              className="px-4 py-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200 text-slate-700 text-sm font-medium shadow-sm disabled:opacity-50 transition"
            >
              {loadingPast ? "Loading..." : "Past Sessions"}
            </button>
          </div>
          <JoinScreen user={user} onJoin={handleJoinMeeting} />
        </div>

        <AssessmentManagementModal
          isOpen={showAssessmentModal}
          onClose={() => setShowAssessmentModal(false)}
          sessionId={sessionId}
          sessionStatus="DRAFT"
          studentsList={allStudents}
        />

        {showPastSessions && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-slate-200">
              <div className="p-5 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">
                  Past Sessions
                </h2>
                <button
                  onClick={() => setShowPastSessions(false)}
                  className="text-slate-500 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
                >
                  Close
                </button>
              </div>
              <div className="p-4 space-y-2">
                {pastSessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <span className="material-symbols-outlined text-3xl text-slate-400">
                        history
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">
                      No Past Sessions
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm">
                      You haven't hosted any recorded sessions yet. Start a
                      session and it will appear here.
                    </p>
                  </div>
                ) : (
                  pastSessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => loadPastSessionReport(s)}
                      className="p-4 border border-slate-200 rounded-xl hover:bg-indigo-50/50 hover:border-indigo-200 cursor-pointer transition"
                    >
                      <div className="font-medium text-slate-900">
                        {s.session_id}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {new Date(s.start_time).toLocaleString()} -{" "}
                        {(s.avg_engagement_score * 100 || 0).toFixed(0)}% avg
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {selectedPastSession && (
          <SessionReport
            sessionData={selectedPastSession}
            onClose={() => setSelectedPastSession(null)}
            onSave={() => {}}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {showDisconnect && (
        <div
          style={{
            backgroundColor: "#ba1a1a",
            color: "#ffffff",
            padding: "10px 0",
            zIndex: 9999,
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            fontSize: "12px",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          }}
        >
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.25"
            />
            <path
              fill="currentColor"
              opacity="0.8"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Connection lost. Reconnecting...
        </div>
      )}

      {inMeeting && !showReport && (
        <div className="td-app dark">
          <div className="td-frame">
            <DashboardTopbar
              sessionId={sessionId}
              user={user}
              connected={connected}
              classContextMode={classContextMode}
              onToggleClassContext={handleToggleClassContext}
              strictMode={strictMode}
              onToggleStrictMode={handleToggleStrictMode}
              simulateClassroom={simulateClassroom}
              onToggleSimulate={() => setSimulateClassroom((v) => !v)}
              livenessLoading={livenessLoading}
              onCheckEngagement={handleCheckEngagement}
              onOpenAssessmentModal={() => setShowAssessmentModal(true)}
            />

            {/* The previous td-disconnect-banner has been replaced by the global overlay via showDisconnect */}

            <div className="td-workspace">
              <main className="td-stage-area">
                <StatusStrip
                  sessionId={sessionId}
                  sessionStartRef={sessionStartRef}
                  presentCount={presentCount}
                  attentiveCount={attentiveCount}
                  distractedCount={distractedCount}
                  criticalCount={criticalCount}
                  railOpen={railOpen}
                  onToggleRail={() => setRailOpen((value) => !value)}
                  railId="teacher-live-dashboard-rail"
                  toggleButtonRef={railToggleButtonRef}
                />

                <div className="td-stage-shell">
                  <div className="td-hms-wrap">
                    <HMSMeeting
                      userName={userName}
                      role="host"
                      onLeave={handleLeaveMeeting}
                      cameraStudents={cameraStudents}
                    />
                  </div>
                </div>
              </main>

              <aside
                id="teacher-live-dashboard-rail"
                className={`td-rail ${railOpen ? "is-open" : ""}`}
                aria-label="Live student monitoring dashboard"
              >
                <div className="td-rail-inner">
                  <div className="td-rail-head">
                    <div className="td-rail-title-row">
                      {/* Mode Switcher Tabs */}
                      <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/10 flex-1">
                        <button
                          type="button"
                          onClick={() => setSideRailTab("cases")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            sideRailTab === "cases"
                              ? "bg-[#dcc492] text-[#111315] shadow-sm"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          <span>Triage Queue</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            sideRailTab === "cases" ? "bg-[#111315]/20 text-[#111315]" : "bg-white/10 text-slate-300"
                          }`}>
                            {cases.filter((c) => c.status !== "RESOLVED" && c.status !== "DISMISSED").length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSideRailTab("grid")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            sideRailTab === "grid"
                              ? "bg-white/20 text-white shadow-sm"
                              : "text-slate-300 hover:text-white"
                          }`}
                        >
                          <span>All Participants</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-slate-300">
                            {allStudents.length}
                          </span>
                        </button>
                      </div>

                      <button
                        type="button"
                        className="td-rail-close ml-2"
                        onClick={closeRail}
                        title="Close dashboard"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M7 7L17 17M17 7L7 17"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Body Content */}
                  {sideRailTab === "cases" ? (
                    <CaseTriageRail
                      cases={cases}
                      sessionId={sessionId}
                      onExecuteBatchAction={handleBatchAction}
                      onViewStudent={() => setSideRailTab("grid")}

                      className="border-0 rounded-none h-full bg-transparent shadow-none"
                    />
                  ) : (
                    <>
                      <div className="p-3 border-b border-white/10">
                        <SummaryCards
                          flaggedCount={flaggedCount}
                          identityIssueCount={identityIssueCount}
                          avgScore={avgScore}
                        />

                        <div className="td-filter-tabs mt-2">
                          <button
                            type="button"
                            className={`td-filter-tab ${showFlaggedOnly ? "active" : ""}`}
                            onClick={() => setShowFlaggedOnly(true)}
                          >
                            Priority only
                          </button>
                          <button
                            type="button"
                            className={`td-filter-tab ${showFlaggedOnly ? "" : "active"}`}
                            onClick={() => setShowFlaggedOnly(false)}
                          >
                            All students
                          </button>
                        </div>
                      </div>

                      <div className="td-student-list flex-1 overflow-y-auto">
                        {sortedStudents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-8 text-center opacity-60 mt-10">
                            <span
                              className="material-symbols-outlined text-4xl mb-3"
                              style={{ color: "var(--color-on-surface-variant)" }}
                            >
                              {showFlaggedOnly ? "check_circle" : "group"}
                            </span>
                            <p
                              className="text-sm italic"
                              style={{ color: "var(--color-on-surface-variant)" }}
                            >
                              {showFlaggedOnly
                                ? "All clear. No priority flags right now."
                                : "Waiting for students to join..."}
                            </p>
                          </div>
                        ) : (
                          sortedStudents.map((s) => {
                            const isSim =
                              s.isSimulated === true ||
                              isSimulatedStudentId(s.userId);
                            const label = statusLabel(
                              s.score,
                              s.strikes,
                              s.identityStatus,
                              s.identityMismatchCount,
                            );

                            return (
                              <StudentCard
                                key={s.userId}
                                student={s}
                                statusLabel={label}
                                statusKey={getStatusKey(s)}
                                priority={getPriority(s)}
                                isFlagged={isFlagged(s)}
                                isSimulated={isSim}
                                livenessLoading={livenessLoading}
                                signals={getSignals(s)}
                                sessionId={sessionId}
                                onMarkEngaged={handleMarkEngaged}
                                onMessage={handleMessage}
                                onIgnore={handleIgnore}
                                onRemove={handleRemove}
                                onVerify={handleCheckEngagement}
                              />
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <SessionReport
          report={selectedPastSession || null}
          sessionId={sessionId}
          onClose={handleCloseReport}
        />
      )}


      <AssessmentManagementModal
        isOpen={showAssessmentModal}
        onClose={() => setShowAssessmentModal(false)}
        sessionId={sessionId}
        sessionStatus={inMeeting ? "ACTIVE" : sessionEnded ? "ENDED" : "DRAFT"}
        studentsList={allStudents}
      />
    </>
  );
}
