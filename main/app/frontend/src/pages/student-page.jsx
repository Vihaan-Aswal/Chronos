// src/pages/StudentPage.jsx

import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
import "../styles/room.css";

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
  const [showTracker, setShowTracker] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );
  const [signal, setSignal] = useState({ band: "nodata", identity: "checking" });
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  const handleSignalChange = useCallback((next) => {
    setSignal(next);
    setHistory((prev) => {
      if (prev[prev.length - 1] === next.band) return prev;
      return [...prev, next.band].slice(-20);
    });
  }, []);

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

  const bandCopy = {
    attentive: {
      title: "Attentive",
      copy: "Present and looking at the room.",
    },
    distracted: {
      title: "Distracted",
      copy: "A dip in focus. A nudge may follow.",
    },
    away: {
      title: "Away",
      copy: "Not looking at the room right now.",
    },
    nodata: {
      title: "No data",
      copy: "No face in frame. Check your camera and light.",
    },
  };
  const current = bandCopy[signal.band] || bandCopy.nodata;
  const identityLabel =
    {
      verified: "Verified",
      mismatch: "Mismatch",
      checking: "Checking",
      no_enrollment: "Not enrolled",
    }[signal.identity] || "Checking";
  const cells = Array.from(
    { length: 20 },
    (_, index) => history[index - (20 - history.length)] || null,
  );

  return (
    <>
      <NudgeNotification message={nudgeState?.text} key={nudgeState?.id} />

      <div className="app room">
        <StudentTopbar
          wsConnected={wsConnected}
          sessionId={sessionId}
          userName={userName}
          railOpen={showTracker}
          onToggleRail={() => setShowTracker((value) => !value)}
          onLeave={() => navigate("/", { replace: true })}
        />

        {showDisconnect && (
          <div className="room-banner" role="status">
            Connection lost. Reconnecting…
          </div>
        )}

        <div className="room-main">
          <main className="room-stage">
            <div className="room-stage-shell">
              <HMSMeeting
                userName={userName}
                role="guest"
                onLeave={() => navigate("/", { replace: true })}
              />
            </div>
            <div className="room-stage-foot">
              <span>In class</span>
              <span className="room-sep" aria-hidden="true" />
              <span>Only your own signals are shown to you</span>
            </div>
          </main>

          <aside
            id="student-signals"
            className={`room-rail room-rail--student ${showTracker ? "is-open" : "is-closed"}`}
            aria-label="Your signals"
          >
            <div className="room-rail-head">
              <h2 className="room-rail-title">
                Your signals
                <span>Only you</span>
              </h2>
              <p className="room-rail-sub">
                Your teacher sees repeated concerns, not every glance.
              </p>
            </div>

            <div className="signal-state">
              <p className="label">Right now</p>
              <p className="signal-state-title">{current.title}</p>
              <p className="signal-state-copy">{current.copy}</p>
              <div className="signal-strip" aria-hidden="true">
                {cells.map((band, index) => (
                  <span
                    key={index}
                    className={`signal-cell ${band ? `is-${band}` : ""}`.trim()}
                  />
                ))}
              </div>
              <div className="signal-strip-caption">
                <span>
                  {history.length === 0
                    ? "Waiting for the first check"
                    : "Last 20 checks"}
                </span>
                <span>Now</span>
              </div>
            </div>

            <dl className="signal-facts">
              <div className="signal-fact">
                <dt>Identity</dt>
                <dd>{identityLabel}</dd>
              </div>
              <div className="signal-fact">
                <dt>Session</dt>
                <dd>{sessionId}</dd>
              </div>
              <div className="signal-fact">
                <dt>Camera</dt>
                <dd>On this device</dd>
              </div>
            </dl>

            <div className="signal-camera">
              <div className="signal-camera-head">
                <h3>Camera check</h3>
                <span className="meta">Local only</span>
              </div>
              <EngagementTracker
                sessionId={sessionId}
                userId={userId}
                onNudge={handleNudge}
                onStateChange={handleSignalChange}
              />
            </div>

            <p className="signal-note">
              A nudge is a quiet message, not a mark. Frames, audio, and page
              content are never stored.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
