// src/pages/StudentPage.jsx

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

import JoinScreen from "../components/JoinScreen.jsx";
import EngagementTracker from "../components/EngagementTracker.jsx";
import NudgeNotification from "../components/NudgeNotification.jsx";
import HMSMeeting from "../hms/HMSMeeting.jsx";
import useWebSocket from "../hooks/useWebSocket.js";
import StudentTopbar from "../components/student/StudentTopbar.jsx";
import "../styles/dashboard-shared.css";
import "../styles/student-meeting.css";

export default function StudentPage() {
  const location = useLocation();
  let user = location.state?.user;
  if (!user) {
    try {
      const raw = sessionStorage.getItem("chronos_user");
      if (raw) user = JSON.parse(raw);
    } catch {
      user = null;
    }
  }

  const userId = user?.id || "";
  const sessionId = "default-session";
  const userName = user?.email || userId || "Student";
  const readinessCompleted = location.state?.readinessCompleted === true;

  const [inMeeting, setInMeeting] = useState(false);
  const [nudgeState, setNudgeState] = useState(null);
  const nudgeTimeoutRef = useRef(null);
  const readinessAutoJoinRef = useRef(false);
  const [showTracker, setShowTracker] = useState(false);

  const wsUrl =
    sessionId && userId
      ? `${import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000"}/ws/engagement/${sessionId}/${userId}`
      : null;

  const { connected: wsConnected } = useWebSocket(wsUrl || "", null);

  const handleJoin = useCallback(() => {
    setInMeeting(true);
  }, []);

  useEffect(() => {
    if (!readinessCompleted || inMeeting || readinessAutoJoinRef.current) {
      return;
    }
    readinessAutoJoinRef.current = true;
    const timeoutId = window.setTimeout(() => {
      handleJoin();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [readinessCompleted, inMeeting, handleJoin]);

  const handleNudge = (msg) => {
    if (nudgeTimeoutRef.current) clearTimeout(nudgeTimeoutRef.current);

    const text = msg?.message_text
      ? msg.message_text
      : msg?.nudge_type === "hard"
        ? "Attention Required!"
        : "Please pay attention!";

    setNudgeState({ text, id: Date.now() });

    nudgeTimeoutRef.current = setTimeout(() => setNudgeState(null), 5000);
  };

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

  if (!inMeeting) {
    return <JoinScreen user={user} onJoin={handleJoin} />;
  }

  return (
    <>
      <NudgeNotification message={nudgeState?.text} key={nudgeState?.id} />

      <div className="sd-app">
        <div className="sd-frame">
          <StudentTopbar
            wsConnected={wsConnected}
            sessionId={sessionId}
            userName={userName}
          />

          <div className="sd-status-bar" aria-label="Student session strip">
            <div className="sd-status-left">
              <span className="sd-session-id">{sessionId.toUpperCase()}</span>
              <span className="sd-sep-line" />
              <span className="sd-role-chip">STUDENT VIEW</span>
            </div>

            <div className="sd-status-right">
              <button
                type="button"
                onClick={() => setShowTracker(!showTracker)}
                className="sd-tracker-toggle"
                aria-expanded={showTracker}
                aria-controls="student-tracker-rail"
              >
                <span className="sd-toggle-dot" aria-hidden="true" />
                {showTracker ? "Hide Panel" : "Tracking Panel"}
              </button>
            </div>
          </div>

          <div className="sd-workspace">
            <div className="sd-stage-area">
              <div className="sd-stage-shell">
                <div className="sd-hms-wrap">
                  <HMSMeeting
                    userName={userName}
                    role="guest"
                    onLeave={() => (window.location.href = "/")}
                  />
                </div>
              </div>
            </div>

            {showTracker && (
              <aside className="sd-tracker-rail" id="student-tracker-rail">
                <div className="sd-tracker-rail-inner">
                  <div className="sd-tracker-rail-head">
                    <div className="sd-rail-title-row">
                      <h2 className="sd-rail-title">
                        <span className="sd-rail-title-dot" />
                        Engagement Monitor
                      </h2>
                    </div>
                    <p className="sd-rail-subtitle">
                      Your session focus signals
                    </p>
                  </div>

                  <div className="sd-tracker-content">
                    <EngagementTracker
                      sessionId={sessionId}
                      userId={userId}
                      onNudge={handleNudge}
                    />
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
