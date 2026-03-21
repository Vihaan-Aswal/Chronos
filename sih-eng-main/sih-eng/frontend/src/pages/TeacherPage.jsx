// src/pages/TeacherPage.jsx

import { useLocation, useSearchParams } from "react-router-dom";
import { useState, useRef, useEffect } from "react";

import useTeacherWebSocket from "../hooks/useTeacherWebSocket";
import useClassroomSimulator, {
  isSimulatedStudentId,
} from "../hooks/useClassroomSimulator.js";
import NudgeButton from "../components/NudgeButton.jsx";
import HMSMeeting from "../hms/HMSMeeting.jsx";

import SessionReport from "../components/SessionReport.jsx";
import { sendTeacherAction } from "../api/teacherActions.js";
import { triggerLiveness } from "../api/liveness.js";

export default function TeacherPage() {
  const location = useLocation();
  const [params] = useSearchParams();

  let user = location.state?.user;
  if (!user) {
    try {
      const raw = sessionStorage.getItem("chronos_user");
      if (raw) user = JSON.parse(raw);
    } catch {}
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Session Expired</h2>
          <p className="text-slate-600 mb-4">No user found. Please login again.</p>
          <a href="/" className="inline-block px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition">
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  const sessionId = params.get("sessionId") || "default-session";
  const userName = user.email;
  const teacherId = user.id;

  const [inMeeting, setInMeeting] = useState(true);
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

  const sessionStartRef = useRef(null);
  const metricsHistoryRef = useRef([]);

  const { connected, students } = useTeacherWebSocket(sessionId);
  useClassroomSimulator(sessionId, inMeeting && simulateClassroom);

  const allStudents = Object.entries(students)
    .filter(([uid]) => !removedUserIds.has(uid))
    .map(([uid, data]) => ({ userId: uid, ...data }));

  const isFlagged = (s) => {
    if (ignoredUserIds.has(s.userId)) return false;
    const hasIdentityIssue = s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2;
    const hasTabSwitch = (s.antiCheatViolations || 0) > 0 && s.lastViolationType === "tab_switch";
    const hasMultiFace = s.multiFaceDetected === true;
    const hasLivenessFail = s.livenessFailed === true;
    return s.strikes >= 3 || s.disengaged || hasIdentityIssue || hasTabSwitch || hasMultiFace || hasLivenessFail;
  };

  const studentArray = showFlaggedOnly
    ? allStudents.filter(isFlagged)
    : allStudents;

  const severityScore = (s) => {
    const hasIdentity = s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2;
    const hasMultiFace = s.multiFaceDetected === true;
    const hasTabSwitch = (s.antiCheatViolations || 0) > 0;
    if (hasIdentity || hasMultiFace) return 3;
    if (hasTabSwitch || s.strikes >= 3) return 2;
    if ((s.score || 0) < 0.4) return 1;
    return 0;
  };

  const sortedStudents = [...studentArray].sort((a, b) => severityScore(b) - severityScore(a));

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
    setLivenessLoading(true);
    try {
      await triggerLiveness(sessionId, userId);
    } catch (err) {
      console.error(err);
    } finally {
      setLivenessLoading(false);
    }
  };

  useEffect(() => {
    if (!inMeeting) return;

    const collectMetrics = () => {
      // Build a fresh snapshot from the live `students` state
      const currentStudentArray = Object.entries(students).map(([uid, data]) => ({ userId: uid, ...data }));
      if (currentStudentArray.length === 0) return;

      const scores = currentStudentArray.map(s => s.score || 0);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      const studentSnapshot = {};
      currentStudentArray.forEach(s => {
        studentSnapshot[s.userId] = {
          score: s.score || 0,
          strikes: s.strikes || 0,
          timestamp: s.timestamp || new Date().toISOString(),
          gazeDirection: s.gazeDirection || 'center',
          ear: s.ear || 0.35,
          headPose: s.headPose || { yaw: 0, pitch: 0 },
          presence: s.presence || 'unknown',
          identityStatus: s.identityStatus || 'checking',
          identityMismatchCount: s.identityMismatchCount || 0,
          isSimulated: Boolean(s.isSimulated),
        };
      });

      metricsHistoryRef.current.push({
        timestamp: new Date().toISOString(),
        avgScore,
        studentCount: currentStudentArray.length,
        students: studentSnapshot
      });
    };

    collectMetrics();
    const interval = setInterval(collectMetrics, 30000);

    return () => clearInterval(interval);
  }, [inMeeting, students]);

  const statusColor = (score, identityStatus, identityMismatchCount) => {
    if (identityStatus === "mismatch" && identityMismatchCount >= 2) return "text-red-600";
    if (score > 0.7) return "text-green-600";
    if (score >= 0.4) return "text-yellow-600";
    return "text-red-600";
  };

  const statusLabel = (score, strikes, identityStatus, identityMismatchCount) => {
    if (identityStatus === "mismatch" && identityMismatchCount >= 2) return "Identity Mismatch";
    if (strikes >= 3) return "Disengaged";
    if (score > 0.7) return "Attentive";
    if (score >= 0.4) return "Distracted";
    return "Away";
  };

  const handleJoinMeeting = () => {
    sessionStartRef.current = new Date();
    setInMeeting(true);
  };

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
        }
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
        }
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
    const lowEngagement = score < 0.70;
    
    // Physical indicators of struggle
    const squinting = ear < 0.28;
    const headTilted = Math.abs(headPose.yaw || 0) > 0.10;
    
    // Strikes indicate disengagement
    const hasStrikes = strikes > 0;
    
    // Count as confusion if: low engagement + any sign, or if they have strikes
    return (lowEngagement && (squinting || headTilted)) || hasStrikes;
  }

  // CONFUSION HOTSPOTS - Fixed
  function findConfusionHotspots(metricsHistory) {
    const hotspots = [];
    
    metricsHistory.forEach((snapshot, idx) => {
      const studentData = snapshot.students || {};
      const studentIds = Object.keys(studentData);
      
      if (studentIds.length === 0) return;

      let confusedCount = 0;
      studentIds.forEach(uid => {
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
          totalStudents: studentIds.length
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
    metricsHistory.forEach(snapshot => {
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
            metrics.strikes
          );
        }
      });
    });

    const atRisk = [];
    const SCORE_THRESHOLD = 0.40;
    const STRIKE_THRESHOLD = 2;
    const IDENTITY_THRESHOLD = 3;

    Object.entries(studentScores).forEach(([uid, scores]) => {
      if (scores.length === 0) return;
      
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const studentInfo = currentStudents.find(s => s.userId === uid);
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
            identityIssues >= IDENTITY_THRESHOLD ? "critical" :
            strikes >= 3 ? "high" :
            avgScore < 0.30 ? "high" : "medium"
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
      (s) => (s.score || 0) >= 0.4 && (s.score || 0) <= 0.7
    ).length;
    const disengaged = reportRoster.filter((s) => (s.score || 0) < 0.4).length;

    const totalStudentsSimulated = reportRoster.filter((s) => s.isSimulated).length;
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
      reportRoster
    );

    const tpi = (() => {
      if (metricsTimeline.length === 0) return 0;
      const scores = metricsTimeline.map(m => m.avgScore);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const dropPoints = scores.filter((s, i) => i > 0 && s < scores[i - 1] - 0.1).length;
      const retention = 1 - Math.min(dropPoints / Math.max(scores.length, 1), 1);
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
        disengaged
      },
      confusionHotspots,
      atRiskStudents
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
            at_risk_students: sessionData.atRiskStudents
          })
        }
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
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/analytics/list?teacher_id=${teacherId}`
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
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/session/${session.session_id}/analytics`
      );
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
      const simCount = Object.values(lastStudents).filter((m) => m?.isSimulated).length;
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
        atRiskStudents: (a.at_risk_students || []).map(s => ({
          userId: s.userId || s.user_id,
          avgScore: s.avgScore ?? s.avg_score ?? 0,
          strikes: s.strikes || 0,
          identityIssues: s.identityIssues ?? s.identity_issues ?? 0,
          reason: s.reason || ""
        }))
      });
      setShowPastSessions(false);
    } catch (err) {
      console.error(err);
    }
  };

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
          {/* <JoinScreen /> previously here, removed per Phase 9 */}
        </div>

        {showPastSessions && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-slate-200">
              <div className="p-5 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">Past Sessions</h2>
                <button onClick={() => setShowPastSessions(false)} className="text-slate-500 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition">Close</button>
              </div>
              <div className="p-4 space-y-2">
                {pastSessions.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No past sessions found</p>
                ) : (
                  pastSessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => loadPastSessionReport(s)}
                      className="p-4 border border-slate-200 rounded-xl hover:bg-indigo-50/50 hover:border-indigo-200 cursor-pointer transition"
                    >
                      <div className="font-medium text-slate-900">{s.session_id}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        {new Date(s.start_time).toLocaleString()} - {(s.avg_engagement_score * 100 || 0).toFixed(0)}% avg
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
        <div className="w-full h-screen flex bg-slate-100">
          <div className="flex-1 border-r border-slate-700 relative bg-slate-900">
            <HMSMeeting
              userName={userName}
              role="host"
              onLeave={handleLeaveMeeting}
            />

            <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-medium shadow ${connected ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"}`}>
              {connected ? "🟢 WS Connected" : "🔴 WS Disconnected"}
            </div>
          </div>

          <div className="w-[400px] bg-gradient-to-b from-slate-50 to-white h-full border-l border-slate-200/80 overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-white/10 bg-gradient-to-br from-indigo-700 via-violet-700 to-indigo-900 text-white">
              <h1 className="text-xl font-bold tracking-tight">
                Teacher Dashboard
              </h1>
              <p className="text-xs text-indigo-100/90 mt-1 font-mono break-all opacity-90">
                {sessionId}
              </p>
              <p className="text-xs text-indigo-200/80 mt-1">{user.email}</p>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleToggleClassContext}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm border transition ${
                      classContextMode === "exam"
                        ? "bg-rose-500/90 border-rose-300 text-white"
                        : "bg-white/15 border-white/25 text-white hover:bg-white/25"
                    }`}
                  >
                    {classContextMode === "exam" ? "Exam mode" : "Class mode"}
                  </button>
                  <div className="inline-flex rounded-xl overflow-hidden border border-white/25 shadow-sm">
                    <button
                      type="button"
                      onClick={handleToggleStrictMode}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${
                        strictMode
                          ? "bg-amber-500 text-white"
                          : "bg-white/15 text-white hover:bg-white/25"
                      }`}
                    >
                      {strictMode ? "Strict tab" : "Normal tab"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimulateClassroom((v) => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-sm transition ${
                      simulateClassroom
                        ? "bg-emerald-500 border-emerald-300 text-white"
                        : "bg-white/15 border-white/25 text-white hover:bg-white/25"
                    }`}
                  >
                    {simulateClassroom ? "Simulate ON" : "Simulate"}
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-indigo-100/80">
                  {classContextMode === "exam"
                    ? "Exam: strict gaze / one-strike disengage on students."
                    : "Class: standard engagement model."}{" "}
                  {strictMode
                    ? "Strict tab switches mark disengaged."
                    : "Tab switching allowed."}{" "}
                  {simulateClassroom
                    ? "20 simulated learners are streaming metrics."
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => handleCheckEngagement()}
                  disabled={livenessLoading}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-white text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 shadow-md transition"
                >
                  {livenessLoading ? "Sending…" : "Check engagement (all)"}
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-800">
                  {showFlaggedOnly ? "Flagged" : "All"} ({sortedStudents.length})
                </h2>
                <button
                  onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
                  className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                >
                  {showFlaggedOnly ? "Show All" : "Flagged Only"}
                </button>
              </div>

              {sortedStudents.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-300 rounded-2xl text-slate-500 bg-white/80">
                  {showFlaggedOnly ? "No flagged students" : "Waiting for students…"}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedStudents.map((s) => {
                    const hasIdentityIssue = s.identityStatus === "mismatch" && (s.identityMismatchCount || 0) >= 2;
                    const isPinned = isFlagged(s);
                    const isSim =
                      s.isSimulated === true || isSimulatedStudentId(s.userId);
                    
                    return (
                      <div
                        key={s.userId}
                        className={`p-4 border rounded-2xl shadow-md transition ring-1 ring-black/5 ${
                          isPinned
                            ? "border-amber-400 border-2 bg-gradient-to-br from-amber-50 to-orange-50/50"
                            : hasIdentityIssue
                            ? "bg-red-50 border-red-300"
                            : s.strikes >= 3
                            ? "bg-red-50/80 border-red-200"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-semibold text-slate-800 flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isPinned && <span title="Pinned">📌</span>}
                              <span className="truncate text-sm">
                                {isSim ? s.userId : `${s.userId.slice(0, 10)}…`}
                              </span>
                              {isSim && (
                                <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                                  Simulated
                                </span>
                              )}
                              {classContextMode === "exam" && !isSim && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                                  Exam
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end max-w-[200px]">
                            {!isSim && (
                              <NudgeButton sessionId={sessionId} userId={s.userId} />
                            )}
                            <button
                              type="button"
                              disabled={isSim}
                              onClick={() => handleMarkEngaged(s.userId)}
                              className="inline-flex items-center gap-1 bg-emerald-500 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-emerald-600 transition disabled:opacity-40 disabled:pointer-events-none"
                            >
                              ✓ Engaged
                            </button>
                            <button
                              type="button"
                              disabled={isSim}
                              onClick={() => handleMessage(s.userId)}
                              className="inline-flex items-center gap-1 bg-indigo-500 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-indigo-600 transition disabled:opacity-40 disabled:pointer-events-none"
                            >
                              ✉ Msg
                            </button>
                            <button
                              type="button"
                              disabled={isSim}
                              onClick={() => handleIgnore(s.userId)}
                              className="inline-flex items-center gap-1 bg-slate-500 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-slate-600 transition disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Ignore
                            </button>
                            <button
                              type="button"
                              disabled={isSim}
                              onClick={() => handleRemove(s.userId)}
                              className="inline-flex items-center gap-1 bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-red-600 transition disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              disabled={isSim || livenessLoading}
                              onClick={() => handleCheckEngagement(s.userId)}
                              className="inline-flex items-center gap-1 bg-purple-500 text-white px-2 py-1 rounded-lg text-xs font-medium hover:bg-purple-600 disabled:opacity-40 disabled:pointer-events-none transition"
                            >
                              Verify
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <span
                            className={`text-2xl font-bold ${statusColor(
                              s.score,
                              s.identityStatus,
                              s.identityMismatchCount
                            )}`}
                          >
                            {((s.score || 0) * 100).toFixed(0)}%
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${statusColor(
                              s.score,
                              s.identityStatus,
                              s.identityMismatchCount
                            )} bg-opacity-20`}
                          >
                            {statusLabel(s.score, s.strikes, s.identityStatus, s.identityMismatchCount)}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          Last: {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : "—"}
                        </div>

                        {s.strikes > 0 && (
                          <div className="text-xs text-red-600 mt-1 font-medium">
                            ⚠ Strikes: {s.strikes}
                          </div>
                        )}

                        {hasIdentityIssue && (
                          <div className="text-xs text-red-700 font-bold mt-1 bg-red-200/80 px-2 py-1 rounded-lg">
                            🚨 IDENTITY MISMATCH ({s.identityMismatchCount || 0}×)
                          </div>
                        )}

                        {s.multiFaceDetected && (
                          <div className="text-xs text-amber-700 font-bold mt-1 bg-amber-200/80 px-2 py-1 rounded-lg">
                            👥 Multiple faces
                          </div>
                        )}

                        {(s.antiCheatViolations || 0) > 0 && s.lastViolationType === "tab_switch" && (
                          <div className="text-xs text-orange-700 font-bold mt-1 bg-orange-200/80 px-2 py-1 rounded-lg">
                            📑 Tab switched
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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