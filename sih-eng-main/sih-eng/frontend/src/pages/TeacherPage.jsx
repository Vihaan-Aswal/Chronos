// src/pages/TeacherPage.jsx

import { useLocation, useSearchParams } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";

import useTeacherWebSocket from "../hooks/useTeacherWebSocket";
import useClassroomSimulator, {
  isSimulatedStudentId,
} from "../hooks/useClassroomSimulator.js";
import HMSMeeting from "../hms/HMSMeeting.jsx";
import JoinScreen from "../components/JoinScreen.jsx";
import DashboardTopbar from "../components/teacher/DashboardTopbar.jsx";
import StatusStrip from "../components/teacher/StatusStrip.jsx";
import SummaryCards from "../components/teacher/SummaryCards.jsx";
import StudentCard from "../components/teacher/StudentCard.jsx";

import SessionReport from "../components/SessionReport.jsx";
import { sendTeacherAction } from "../api/teacherActions.js";
import { triggerLiveness } from "../api/liveness.js";
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
  const [sessionData, setSessionData] = useState(null);
  const [strictMode, setStrictMode] = useState(false);
  /** Lenient class vs strict exam engagement (student-side scoring). */
  const [classContextMode, setClassContextMode] = useState("class");
  const [simulateClassroom, setSimulateClassroom] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(true);
  const [ignoredUserIds, setIgnoredUserIds] = useState(new Set());
  const [removedUserIds, setRemovedUserIds] = useState(new Set());
  const [railOpen, setRailOpen] = useState(false);

  const sessionStartRef = useRef(null);
  const metricsHistoryRef = useRef([]);
  const readinessAutoJoinRef = useRef(false);
  const railToggleButtonRef = useRef(null);
  const isMountedRef = useRef(true);
  const livenessRequestIdRef = useRef(0);
  const pastReportAbortRef = useRef(null);
  const pastReportRequestIdRef = useRef(0);

  const { connected, students } = useTeacherWebSocket(sessionId);
  useClassroomSimulator(sessionId, inMeeting && simulateClassroom);

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
    const hasTabSwitch =
      (s.antiCheatViolations || 0) > 0 && s.lastViolationType === "tab_switch";
    const hasMultiFace = s.multiFaceDetected === true;
    const hasLivenessFail = s.livenessFailed === true;
    return (
      s.strikes >= 3 ||
      s.disengaged ||
      hasIdentityIssue ||
      hasTabSwitch ||
      hasMultiFace ||
      hasLivenessFail
    );
  };

  const studentArray = showFlaggedOnly
    ? allStudents.filter(isFlagged)
    : allStudents;

  const severityScore = (s) => {
    const hasIdentity =
      s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2;
    const hasMultiFace = s.multiFaceDetected === true;
    const hasTabSwitch = (s.antiCheatViolations || 0) > 0;
    if (hasIdentity || hasMultiFace) return 3;
    if (hasTabSwitch || s.strikes >= 3) return 2;
    if ((s.score || 0) < 0.4) return 1;
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
  ) => {
    if (identityStatus === "mismatch" && identityMismatchCount >= 2)
      return "Identity Mismatch";
    if (strikes >= 3) return "Disengaged";
    if (score > 0.7) return "Attentive";
    if (score >= 0.4) return "Distracted";
    return "Away";
  };

  const getStatusKey = (student) => {
    const hasIdentityIssue =
      student.identityStatus === "mismatch" &&
      (student.identityMismatchCount || 0) >= 2;
    const hasTabSwitch =
      (student.antiCheatViolations || 0) > 0 &&
      student.lastViolationType === "tab_switch";

    if (hasIdentityIssue) return "identity";
    if (student.multiFaceDetected || hasTabSwitch) return "risk";
    if (student.livenessFailed || student.strikes >= 3 || student.disengaged)
      return "away";
    if ((student.score || 0) >= 0.4 && (student.score || 0) <= 0.7)
      return "distracted";
    if ((student.score || 0) < 0.4) return "away";
    return "attentive";
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
    );

    if (label === "Attentive") return "attentive";
    if (label === "Distracted") return "distracted";
    return "away";
  };

  const getSignals = (student) => {
    const signalPills = [];

    if (
      student.identityStatus === "mismatch" &&
      (student.identityMismatchCount || 0) >= 2
    ) {
      signalPills.push({ label: "Identity mismatch", tone: "alert" });
    }

    if (student.multiFaceDetected) {
      signalPills.push({ label: "Multiple faces", tone: "alert" });
    }

    if (
      (student.antiCheatViolations || 0) > 0 &&
      student.lastViolationType === "tab_switch"
    ) {
      signalPills.push({ label: "Tab switched", tone: "warn" });
    }

    if (student.livenessFailed) {
      signalPills.push({ label: "Liveness fail", tone: "violet" });
    }

    if ((student.strikes || 0) > 0) {
      signalPills.push({
        label: `${student.strikes} strike${student.strikes > 1 ? "s" : ""}`,
        tone: student.strikes >= 3 ? "alert" : "warn",
      });
    }

    if (signalPills.length === 0) {
      signalPills.push({
        label: (student.score || 0) >= 0.7 ? "Stable" : "Focus dip",
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

  // CONFUSION DETECTION - treats disengagement/low engagement as confusion for demo
  function detectConfusion(studentMetrics) {
    if (!studentMetrics) return false;

    const score = studentMetrics.score ?? 0;
    const ear = studentMetrics.ear ?? 0.35;
    const headPose = studentMetrics.headPose || { yaw: 0, pitch: 0 };
    const strikes = studentMetrics.strikes ?? 0;

    // Low/mid engagement range (anything below 70%) counts as some level of confusion
    const lowEngagement = score < 0.7;

    // Physical indicators of struggle
    const squinting = ear < 0.28;
    const headTilted = Math.abs(headPose.yaw || 0) > 0.1;

    // Strikes indicate disengagement
    const hasStrikes = strikes > 0;

    // Count as confusion if: low engagement + any sign, or if they have strikes
    return (lowEngagement && (squinting || headTilted)) || hasStrikes;
  }

  // CONFUSION HOTSPOTS - Fixed
  function findConfusionHotspots(metricsHistory) {
    const hotspots = [];

    metricsHistory.forEach((snapshot) => {
      const studentData = snapshot.students || {};
      const studentIds = Object.keys(studentData);

      if (studentIds.length === 0) return;

      let confusedCount = 0;
      studentIds.forEach((uid) => {
        const metrics = studentData[uid];
        if (detectConfusion(metrics)) {
          confusedCount++;
        }
      });

      const confusionPercentage = (confusedCount / studentIds.length) * 100;

      // Lower threshold (20%) so chart always has data even with minimal confusion
      if (confusionPercentage >= 20) {
        hotspots.push({
          // Use the snapshot timestamp for a readable label
          time: new Date(snapshot.timestamp).toLocaleTimeString(),
          percentage: Math.round(confusionPercentage),
          studentCount: confusedCount,
          timestamp: snapshot.timestamp,
          totalStudents: studentIds.length,
        });
      }
    });

    return hotspots;
  }

  // AT-RISK STUDENTS - Fixed
  function identifyAtRiskStudents(metricsHistory, currentStudents) {
    const studentScores = {};
    const studentIdentityIssues = {};
    const studentStrikeCounts = {};

    // Aggregate data
    metricsHistory.forEach((snapshot) => {
      const studentData = snapshot.students || {};
      Object.entries(studentData).forEach(([uid, metrics]) => {
        if (!studentScores[uid]) studentScores[uid] = [];
        studentScores[uid].push(metrics.score ?? 0);

        if (metrics.identityStatus === "mismatch") {
          studentIdentityIssues[uid] = (studentIdentityIssues[uid] || 0) + 1;
        }

        if (metrics.strikes !== undefined) {
          studentStrikeCounts[uid] = Math.max(
            studentStrikeCounts[uid] || 0,
            metrics.strikes,
          );
        }
      });
    });

    const atRisk = [];
    const SCORE_THRESHOLD = 0.4;
    const STRIKE_THRESHOLD = 2;
    const IDENTITY_THRESHOLD = 3;

    Object.entries(studentScores).forEach(([uid, scores]) => {
      if (scores.length === 0) return;

      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const studentInfo = currentStudents.find((s) => s.userId === uid);
      const strikes = studentStrikeCounts[uid] || studentInfo?.strikes || 0;
      const identityIssues = studentIdentityIssues[uid] || 0;

      let reasons = [];
      let isAtRisk = false;

      if (avgScore < SCORE_THRESHOLD) {
        reasons.push(`Low engagement (${(avgScore * 100).toFixed(0)}%)`);
        isAtRisk = true;
      }

      if (strikes >= STRIKE_THRESHOLD) {
        reasons.push(`${strikes} disengagement strikes`);
        isAtRisk = true;
      }

      if (identityIssues >= IDENTITY_THRESHOLD) {
        reasons.push(`${identityIssues} identity violations`);
        isAtRisk = true;
      }

      if (isAtRisk) {
        if (studentInfo?.isSimulated) {
          reasons.push("Simulated learner (demo)");
        }
        atRisk.push({
          userId: uid,
          avgScore: avgScore,
          strikes: strikes,
          identityIssues: identityIssues,
          reason: reasons.join(", "),
          severity:
            identityIssues >= IDENTITY_THRESHOLD
              ? "critical"
              : strikes >= 3
                ? "high"
                : avgScore < 0.3
                  ? "high"
                  : "medium",
        });
      }
    });

    atRisk.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return a.avgScore - b.avgScore;
    });

    return atRisk;
  }

  const handleLeaveMeeting = () => {
    setSessionEnded(true);
    setInMeeting(false);
    setSimulateClassroom(false);

    const endTime = new Date();
    const startTime = sessionStartRef.current || endTime;
    const durationMinutes = (endTime - startTime) / 1000 / 60;

    const reportRoster = Object.entries(students)
      .filter(([uid]) => !removedUserIds.has(uid))
      .map(([uid, data]) => ({ userId: uid, ...data }));

    const scores = reportRoster.map((s) => s.score || 0);
    const avgScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const attentive = reportRoster.filter((s) => (s.score || 0) > 0.7).length;
    const distracted = reportRoster.filter(
      (s) => (s.score || 0) >= 0.4 && (s.score || 0) <= 0.7,
    ).length;
    const disengaged = reportRoster.filter((s) => (s.score || 0) < 0.4).length;

    const totalStudentsSimulated = reportRoster.filter(
      (s) => s.isSimulated,
    ).length;
    const totalStudentsReal = reportRoster.length - totalStudentsSimulated;

    const studentMeta = {};
    reportRoster.forEach((s) => {
      studentMeta[s.userId] = {
        isSimulated: Boolean(s.isSimulated),
        displayName: s.isSimulated
          ? `Simulated · ${s.userId}`
          : (s.userId || "").slice(0, 12),
      };
    });

    const metricsTimeline = metricsHistoryRef.current.map((m, idx) => {
      const stud = m.students || {};
      let rSum = 0,
        rN = 0,
        sSum = 0,
        sN = 0;
      Object.values(stud).forEach((met) => {
        const sc = Number(met?.score || 0);
        if (met?.isSimulated) {
          sSum += sc;
          sN += 1;
        } else {
          rSum += sc;
          rN += 1;
        }
      });
      return {
        time: `${Math.floor(idx * 0.5)}m`,
        avgScore: Number(m.avgScore) || 0,
        students: m.studentCount || 0,
        avgScoreReal: rN ? rSum / rN : null,
        avgScoreSimulated: sN ? sSum / sN : null,
      };
    });

    const perStudentTimelines = {};
    metricsHistoryRef.current.forEach((snapshot, idx) => {
      const t = `${Math.floor(idx * 0.5)}m`;
      const studentData = snapshot.students || {};
      Object.entries(studentData).forEach(([uid, metrics]) => {
        if (!perStudentTimelines[uid]) perStudentTimelines[uid] = [];
        perStudentTimelines[uid].push({
          time: t,
          score: Number(metrics.score || 0),
        });
      });
    });

    const confusionHotspots = findConfusionHotspots(metricsHistoryRef.current);
    const atRiskStudents = identifyAtRiskStudents(
      metricsHistoryRef.current,
      reportRoster,
    );

    const tpi = (() => {
      if (metricsTimeline.length === 0) return 0;
      const scores = metricsTimeline.map((m) => m.avgScore);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const dropPoints = scores.filter(
        (s, i) => i > 0 && s < scores[i - 1] - 0.1,
      ).length;
      const retention =
        1 - Math.min(dropPoints / Math.max(scores.length, 1), 1);
      return Math.round((avg * 0.6 + retention * 0.4) * 100);
    })();

    const data = {
      sessionId,
      teacherId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: durationMinutes,
      avgScore,
      totalStudents: reportRoster.length,
      totalStudentsReal,
      totalStudentsSimulated,
      studentMeta,
      classContextMode,
      strictModeAtEnd: strictMode,
      tpi,
      perStudentTimelines,
      metricsTimeline,
      distribution: {
        attentive,
        distracted,
        disengaged,
      },
      confusionHotspots,
      atRiskStudents,
    };

    setSessionData(data);
    setShowReport(true);
  };

  const handleSaveReport = async () => {
    if (!sessionData) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/session/save-analytics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionData.sessionId,
            teacher_id: sessionData.teacherId,
            start_time: sessionData.startTime,
            end_time: sessionData.endTime,
            duration_minutes: sessionData.duration,
            avg_engagement_score: sessionData.avgScore,
            total_students: sessionData.totalStudents,
            tpi: sessionData.tpi,
            metrics_timeline: metricsHistoryRef.current,
            confusion_hotspots: sessionData.confusionHotspots,
            at_risk_students: sessionData.atRiskStudents,
          }),
        },
      );

      if (response.ok) {
        alert("Session report saved successfully! ✅");
        setShowReport(false);
        window.location.href = "/";
      } else {
        alert("Failed to save report. Please try again.");
      }
    } catch (error) {
      console.error("Error saving report:", error);
      alert("Error saving report. Check console.");
    }
  };

  const handleCloseReport = () => {
    setShowReport(false);
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
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/${session.session_id}/analytics`,
        { signal: abortController.signal },
      );

      if (requestId !== pastReportRequestIdRef.current) return;

      const { exists, analytics } = await res.json();
      if (!exists || !analytics?.length) return;
      const a = analytics[0];
      const rawTimeline = a.metrics_timeline || [];
      const metricsTimeline = rawTimeline.map((m, idx) => {
        const stud = m.students || {};
        let rSum = 0,
          rN = 0,
          sSum = 0,
          sN = 0;
        Object.values(stud).forEach((met) => {
          const sc = Number(met?.score || 0);
          if (met?.isSimulated) {
            sSum += sc;
            sN += 1;
          } else {
            rSum += sc;
            rN += 1;
          }
        });
        return {
          time: `${Math.floor(idx * 0.5)}m`,
          avgScore: Number(m.avgScore) || 0,
          students: m.studentCount || 0,
          avgScoreReal: rN ? rSum / rN : null,
          avgScoreSimulated: sN ? sSum / sN : null,
        };
      });
      const perStudentTimelines = {};
      const studentMeta = {};
      rawTimeline.forEach((snapshot, idx) => {
        const t = `${Math.floor(idx * 0.5)}m`;
        const studentData = snapshot.students || {};
        Object.entries(studentData).forEach(([uid, metrics]) => {
          if (!perStudentTimelines[uid]) perStudentTimelines[uid] = [];
          perStudentTimelines[uid].push({
            time: t,
            score: Number(metrics?.score || 0),
          });
          if (metrics?.isSimulated != null) {
            studentMeta[uid] = {
              isSimulated: Boolean(metrics.isSimulated),
              displayName: metrics.isSimulated
                ? `Simulated · ${uid}`
                : uid.slice(0, 12),
            };
          }
        });
      });
      const lastSnap = rawTimeline[rawTimeline.length - 1];
      const lastStudents = lastSnap?.students || {};
      Object.keys(lastStudents).forEach((uid) => {
        const met = lastStudents[uid];
        if (!studentMeta[uid]) {
          studentMeta[uid] = {
            isSimulated: Boolean(met?.isSimulated),
            displayName: met?.isSimulated
              ? `Simulated · ${uid}`
              : uid.slice(0, 12),
          };
        }
      });
      const simCount = Object.values(lastStudents).filter(
        (m) => m?.isSimulated,
      ).length;
      setSelectedPastSession({
        sessionId: a.session_id,
        teacherId: a.teacher_id,
        duration: a.duration_minutes || 0,
        avgScore: a.avg_engagement_score || 0,
        totalStudents: a.total_students || 0,
        totalStudentsSimulated: simCount,
        totalStudentsReal: Math.max(0, (a.total_students || 0) - simCount),
        studentMeta,
        tpi: a.tpi,
        metricsTimeline,
        perStudentTimelines,
        distribution: { attentive: 0, distracted: 0, disengaged: 0 },
        confusionHotspots: a.confusion_hotspots || [],
        atRiskStudents: (a.at_risk_students || []).map((s) => ({
          userId: s.userId || s.user_id,
          avgScore: s.avgScore ?? s.avg_score ?? 0,
          strikes: s.strikes || 0,
          identityIssues: s.identityIssues ?? s.identity_issues ?? 0,
          reason: s.reason || "",
        })),
      });
      setShowPastSessions(false);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);
    } finally {
      if (pastReportAbortRef.current === abortController) {
        pastReportAbortRef.current = null;
      }
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
          <div className="mb-4 flex justify-end">
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
                  <p className="text-slate-500 text-center py-8">
                    No past sessions found
                  </p>
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
            />

            {!connected && (
              <div className="td-disconnect-banner">
                WebSocket disconnected. Live updates may be delayed.
              </div>
            )}

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
                      <div className="td-rail-title">
                        <span className="td-rail-title-dot" />
                        Live Dashboard
                      </div>

                      <button
                        type="button"
                        className="td-rail-close"
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

                    <SummaryCards
                      flaggedCount={flaggedCount}
                      identityIssueCount={identityIssueCount}
                      avgScore={avgScore}
                    />

                    <div className="td-filter-tabs">
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

                  <div className="td-student-list">
                    {sortedStudents.length === 0 ? (
                      <div className="td-empty">
                        {showFlaggedOnly
                          ? "No flagged students right now."
                          : "Waiting for students..."}
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
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {showReport && sessionData && (
        <SessionReport
          sessionData={sessionData}
          onClose={handleCloseReport}
          onSave={handleSaveReport}
        />
      )}
    </>
  );
}
