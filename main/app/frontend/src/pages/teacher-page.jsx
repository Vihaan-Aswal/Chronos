// src/pages/TeacherPage.jsx

import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";

import useTeacherWebSocket from "../hooks/use-teacher-websocket";
import useClassroomSimulator, {
  isSimulatedStudentId,
} from "../hooks/use-classroom-simulator.js";
import HMSMeeting from "../meeting/hms-meeting.jsx";
import JoinScreen from "../components/join-screen.jsx";
import RoomBar from "../components/teacher/room-bar.jsx";
import StatusStrip from "../components/teacher/status-strip.jsx";
import StudentRow from "../components/teacher/student-row.jsx";
import { kindFor } from "../components/app/student-kind.js";
import Modal from "../components/app/modal.jsx";
import EmptyState from "../components/app/empty-state.jsx";
import ReadyLayout from "../components/app/ready-layout.jsx";

import SessionReport from "../components/session-report.jsx";
import { sendTeacherAction } from "../api/teacher-actions.js";
import { triggerLiveness } from "../api/liveness.js";
import "../styles/app-system.css";
import "../styles/readiness.css";
import "../styles/room.css";

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

  // Dev-only design fixture: ?preview=live opens the live shell without a camera.
  // Production builds fold import.meta.env.DEV to false, so this never ships.
  const previewLive = import.meta.env.DEV && params.get("preview") === "live";
  const [inMeeting, setInMeeting] = useState(previewLive);
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
  const [railOpen, setRailOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1200px)").matches,
  );
  const [messageFor, setMessageFor] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [messageError, setMessageError] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [removeFor, setRemoveFor] = useState(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [leaveSignal, setLeaveSignal] = useState(0);
  const [actionNotes, setActionNotes] = useState({});
  const navigate = useNavigate();

  const sessionStartRef = useRef(previewLive ? new Date() : null);
  const metricsHistoryRef = useRef([]);
  const readinessAutoJoinRef = useRef(false);
  const railToggleButtonRef = useRef(null);
  const isMountedRef = useRef(true);
  const livenessRequestIdRef = useRef(0);

  const { connected, students } = useTeacherWebSocket(sessionId);

  const [showDisconnect, setShowDisconnect] = useState(false);
  useEffect(() => {
    const targetVisible = inMeeting && !connected;
    const delay = targetVisible ? 2000 : 0;
    const t = setTimeout(() => setShowDisconnect(targetVisible), delay);
    return () => clearTimeout(t);
  }, [inMeeting, connected]);
  useClassroomSimulator(sessionId, inMeeting && simulateClassroom);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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

  const noteFor = useCallback((userId, text) => {
    setActionNotes((prev) => ({ ...prev, [userId]: text }));
    window.setTimeout(() => {
      setActionNotes((prev) => {
        if (!prev[userId]) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 5000);
  }, []);

  const handleMarkEngaged = async (userId) => {
    try {
      await sendTeacherAction(sessionId, userId, "mark_engaged");
      noteFor(userId, "Marked engaged.");
    } catch (err) {
      console.error(err);
      noteFor(userId, "Could not mark engaged. Check the connection.");
    }
  };

  const handleIgnore = (userId) => {
    setIgnoredUserIds((prev) => new Set([...prev, userId]));
    noteFor(userId, "Ignored for now. The signal stays in the record.");
  };

  const handleRemove = (userId) => setRemoveFor(userId);

  const confirmRemove = () => {
    const userId = removeFor;
    if (!userId) return;
    setRemovedUserIds((prev) => new Set([...prev, userId]));
    sendTeacherAction(sessionId, userId, "remove").catch(() => {});
    setRemoveFor(null);
  };

  const handleMessage = (userId) => {
    setMessageFor(userId);
    setMessageText("");
    setMessageError("");
  };

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text || !messageFor) return;
    setMessageSending(true);
    setMessageError("");
    try {
      await sendTeacherAction(sessionId, messageFor, "message", text);
      noteFor(messageFor, "Message sent.");
      setMessageFor(null);
    } catch (err) {
      console.error(err);
      setMessageError(
        "The message did not send. Check the connection and try again.",
      );
    } finally {
      setMessageSending(false);
    }
  };

  const requestEndSession = () => setEndConfirmOpen(true);

  const confirmEndSession = () => {
    setEndConfirmOpen(false);
    setLeaveSignal((value) => value + 1);
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
        time: `${(idx * 0.5).toFixed(1)}m`,
        avgScore: Number(m.avgScore) || 0,
        students: m.studentCount || 0,
        avgScoreReal: rN ? rSum / rN : null,
        avgScoreSimulated: sN ? sSum / sN : null,
      };
    });

    const perStudentTimelines = {};
    metricsHistoryRef.current.forEach((snapshot, idx) => {
      const t = `${(idx * 0.5).toFixed(1)}m`;
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
    if (!sessionData) throw new Error("No session record to save.");
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
    if (!response.ok) {
      throw new Error(`Failed to save record: ${response.status}`);
    }
  };

  const handleCloseReport = () => {
    setShowReport(false);
    navigate("/", { replace: true });
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
  const flaggedCount = allStudents.filter((s) => isFlagged(s)).length;
  const identityIssueCount = allStudents.filter(
    (s) =>
      s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2,
  ).length;

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
      <ReadyLayout
        user={user}
        title={
          <>
            Before you <em>join.</em>
          </>
        }
        lede="You are joining as a teacher. Three checks, then class. Past classes live under Session records."
      >
        <JoinScreen user={user} role="teacher" onJoin={handleJoinMeeting} />

        <div className="desk-records">
          <div>
            <h2 className="section-title">Session records</h2>
            <p className="lede">
              Read a past class, export the record, or check the follow-up
              list. No camera check needed.
            </p>
          </div>
          <Link className="btn btn-line" to="/records">
            Open records
          </Link>
        </div>
      </ReadyLayout>
    );
  }

  return (
    <>
      {inMeeting && !showReport && (
        <div className="app room">
          <RoomBar
            sessionId={sessionId}
            connected={connected}
            classContextMode={classContextMode}
            onToggleClassContext={handleToggleClassContext}
            strictMode={strictMode}
            onToggleStrictMode={handleToggleStrictMode}
            simulateClassroom={simulateClassroom}
            onToggleSimulate={() => setSimulateClassroom((v) => !v)}
            livenessLoading={livenessLoading}
            onCheckEngagement={handleCheckEngagement}
            onEndSession={requestEndSession}
          />

          {showDisconnect && (
            <div className="room-banner" role="status">
              Connection lost. Reconnecting…
            </div>
          )}

          <StatusStrip
            sessionStartRef={sessionStartRef}
            presentCount={presentCount}
            attentiveCount={attentiveCount}
            distractedCount={distractedCount}
            flaggedCount={flaggedCount}
            railOpen={railOpen}
            onToggleRail={() => setRailOpen((value) => !value)}
            railId="teacher-live-dashboard-rail"
            toggleButtonRef={railToggleButtonRef}
          />

          <div className="room-main">
            <main className="room-stage">
              <div className="room-stage-shell">
                <HMSMeeting
                  userName={userName}
                  role="host"
                  onLeave={handleLeaveMeeting}
                  cameraStudents={cameraStudents}
                  leaveSignal={leaveSignal}
                />
              </div>
              <div className="room-stage-foot">
                <span>
                  {classContextMode === "exam" ? "Exam context" : "Class context"}
                </span>
                <span className="room-sep" aria-hidden="true" />
                <span>
                  {strictMode ? "Strict tab policy" : "Normal tab policy"}
                </span>
                <span className="room-sep" aria-hidden="true" />
                <span>{simulateClassroom ? "Simulator on" : "Live signals"}</span>
              </div>
            </main>

            <aside
              id="teacher-live-dashboard-rail"
              className={`room-rail ${railOpen ? "is-open" : "is-closed"}`}
              aria-label="Live student dashboard"
            >
              <div className="room-rail-head">
                <h2 className="room-rail-title">
                  In the room
                  <span>
                    {allStudents.length}{" "}
                    {allStudents.length === 1 ? "student" : "students"}
                  </span>
                </h2>
                <p className="room-rail-sub">
                  {flaggedCount} need attention · {identityIssueCount} identity{" "}
                  {identityIssueCount === 1 ? "check" : "checks"}
                </p>
              </div>

              <div
                className="room-filters"
                role="group"
                aria-label="Student filter"
              >
                <button
                  type="button"
                  className="room-filter"
                  aria-pressed={showFlaggedOnly}
                  onClick={() => setShowFlaggedOnly(true)}
                >
                  Needs attention ({flaggedCount})
                </button>
                <button
                  type="button"
                  className="room-filter"
                  aria-pressed={!showFlaggedOnly}
                  onClick={() => setShowFlaggedOnly(false)}
                >
                  All students ({allStudents.length})
                </button>
              </div>

              <div className="room-list">
                {sortedStudents.length === 0 ? (
                  allStudents.length === 0 ? (
                    <EmptyState title="No students yet">
                      Students appear here as they join the room. If someone is
                      waiting, check that their readiness check passed.
                    </EmptyState>
                  ) : (
                    <EmptyState title="All clear">
                      No one needs attention right now. Switch to all students
                      to see the whole room.
                    </EmptyState>
                  )
                ) : (
                  <ul>
                    {sortedStudents.map((s) => {
                      const isSim =
                        s.isSimulated === true ||
                        isSimulatedStudentId(s.userId);
                      const riskFlag =
                        s.multiFaceDetected === true ||
                        ((s.antiCheatViolations || 0) > 0 &&
                          s.lastViolationType === "tab_switch");
                      const label =
                        s.presence === "no_face"
                          ? "No data"
                          : statusLabel(
                              s.score,
                              s.strikes,
                              s.identityStatus,
                              s.identityMismatchCount,
                            );

                      return (
                        <StudentRow
                          key={s.userId}
                          student={s}
                          sessionId={sessionId}
                          statusLabel={label}
                          kind={kindFor(label, riskFlag)}
                          isFlagged={isFlagged(s)}
                          isSimulated={isSim}
                          livenessLoading={livenessLoading}
                          signals={getSignals(s)}
                          actionNote={actionNotes[s.userId]}
                          onMarkEngaged={handleMarkEngaged}
                          onMessage={handleMessage}
                          onIgnore={handleIgnore}
                          onRemove={handleRemove}
                          onVerify={handleCheckEngagement}
                          onNudgeError={(text) => noteFor(s.userId, text)}
                        />
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
          </div>

          <Modal
            open={Boolean(messageFor)}
            onClose={() => setMessageFor(null)}
            title="Send a private message"
            sub={`${messageFor || "The student"} sees a quiet note. It is not a mark.`}
            actions={
              <>
                <button
                  type="button"
                  className="btn btn-line"
                  onClick={() => setMessageFor(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-ink"
                  onClick={sendMessage}
                  disabled={!messageText.trim() || messageSending}
                >
                  {messageSending ? "Sending…" : "Send message"}
                </button>
              </>
            }
          >
            <div className="field">
              <label htmlFor="teacher-message">Message</label>
              <textarea
                id="teacher-message"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="A short, specific note."
                aria-invalid={Boolean(messageError)}
                aria-describedby={messageError ? "teacher-message-error" : undefined}
              />
              <p className="field-hint">
                Write to the person, not the score. The student can read it
                during class.
              </p>
              {messageError && (
                <p className="field-error" id="teacher-message-error" role="alert">
                  {messageError}
                </p>
              )}
            </div>
          </Modal>

          <Modal
            open={Boolean(removeFor)}
            onClose={() => setRemoveFor(null)}
            title="Remove from the room?"
            sub="The student leaves this room's roster. The action is kept in the session record."
            actions={
              <>
                <button
                  type="button"
                  className="btn btn-line"
                  onClick={() => setRemoveFor(null)}
                >
                  Keep in room
                </button>
                <button
                  type="button"
                  className="btn btn-ink"
                  onClick={confirmRemove}
                >
                  Remove
                </button>
              </>
            }
          >
            <p className="lede">
              Removing is not a grade and does not delete the signals already
              collected. It takes the student off this screen.
            </p>
          </Modal>

          <Modal
            open={endConfirmOpen}
            onClose={() => setEndConfirmOpen(false)}
            title="End the session?"
            sub="The room closes and a session record is prepared from the signals collected so far."
            actions={
              <>
                <button
                  type="button"
                  className="btn btn-line"
                  onClick={() => setEndConfirmOpen(false)}
                >
                  Keep teaching
                </button>
                <button
                  type="button"
                  className="btn btn-ink"
                  onClick={confirmEndSession}
                >
                  End session
                </button>
              </>
            }
          >
            <p className="lede">
              You can save the record, export it as a PDF, or close it. Nothing
              is deleted by ending the room.
            </p>
          </Modal>
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
