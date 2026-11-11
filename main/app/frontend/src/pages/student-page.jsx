// src/pages/StudentPage.jsx

import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";

import JoinScreen from "../components/join-screen.jsx";
import EngagementTracker from "../components/engagement-tracker.jsx";
import NudgeNotification from "../components/nudge-notification.jsx";
import HMSMeeting from "../meeting/hms-meeting.jsx";
import useWebSocket from "../hooks/use-websocket.js";
import StudentTopbar from "../components/student/student-topbar.jsx";
import ReadyLayout from "../components/app/ready-layout.jsx";
import AppHeader from "../components/app/app-header.jsx";
import AppFooter from "../components/app/app-footer.jsx";
import "../styles/app-system.css";
import "../styles/readiness.css";
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

  // Dev-only design fixture: ?preview=live opens the live shell without a camera.
  const previewLive =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("preview") === "live";
  const [inMeeting, setInMeeting] = useState(previewLive);
  const [nudgeState, setNudgeState] = useState(null);
  const nudgeTimeoutRef = useRef(null);
  const readinessAutoJoinRef = useRef(false);
  const [showTracker, setShowTracker] = useState(false);

  const wsUrl =
    sessionId && userId
      ? `${import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000"}/ws/engagement/${sessionId}/${userId}`
      : null;

  const { connected: wsConnected } = useWebSocket(wsUrl || "", null);

  const [showDisconnect, setShowDisconnect] = useState(false);
  useEffect(() => {
    const targetVisible = inMeeting && !wsConnected;
    const delay = targetVisible ? 2000 : 0;
    const t = setTimeout(() => setShowDisconnect(targetVisible), delay);
    return () => clearTimeout(t);
  }, [inMeeting, wsConnected]);

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
      <div className="app page">
        <AppHeader links={[{ label: "Home", to: "/" }]} />
        <main className="page-main" id="main">
          <div className="wrap ready-page">
            <header className="ready-head">
              <h1 className="page-title">
                This session has <em>ended.</em>
              </h1>
              <p className="page-lede">
                No signed-in student was found on this device. Sign in again
                with the account you used to join.
              </p>
            </header>
            <div className="row">
              <Link className="btn btn-ink" to="/signin">
                Sign in
              </Link>
              <Link className="btn btn-line" to="/">
                Back to the homepage
              </Link>
            </div>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  if (!inMeeting) {
    return (
      <ReadyLayout
        user={user}
        title={
          <>
            Before you <em>join.</em>
          </>
        }
        lede="You are joining as a student. Only your own state is shown to you; your teacher sees repeated concerns, not every glance."
      >
        <JoinScreen user={user} role="student" onJoin={handleJoin} />
      </ReadyLayout>
    );
  }

  return (
    <>
      <NudgeNotification message={nudgeState?.text} key={nudgeState?.id} />

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

            <aside
              className={`sd-tracker-rail ${showTracker ? "is-open" : "is-closed"}`}
              id="student-tracker-rail"
            >
              <div className="sd-tracker-rail-inner">
                <div className="sd-tracker-rail-head">
                  <div className="sd-rail-title-row">
                    <h2 className="sd-rail-title">
                      <span className="sd-rail-title-dot" />
                      Engagement Monitor
                    </h2>
                  </div>
                  <p className="sd-rail-subtitle">Your session focus signals</p>
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
          </div>
        </div>
      </div>
    </>
  );
}
