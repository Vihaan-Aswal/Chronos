// src/pages/StudentPage.jsx
// Workstream W7: Student Health Projection, Self-Recovery, and Return-to-Session Flows

import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import JoinScreen from "../components/join-screen.jsx";
import EngagementTracker from "../components/engagement-tracker.jsx";
import NudgeNotification from "../components/nudge-notification.jsx";
import HMSMeeting from "../meeting/hms-meeting.jsx";
import useWebSocket from "../hooks/use-websocket.js";
import StudentTopbar from "../components/student/student-topbar.jsx";
import ReadyLayout from "../components/app/ready-layout.jsx";
import AppHeader from "../components/app/app-header.jsx";
import AppFooter from "../components/app/app-footer.jsx";
import ResourcePanel from "../components/assessment/resource-panel.jsx";
import AnswerSubmissionPanel from "../components/assessment/answer-submission-panel.jsx";
import StudentHealthPanel from "../components/student/student-health-panel.jsx";
import StudentContextModal from "../components/student/student-context-modal.jsx";
import PrivacySettingsDrawer from "../components/privacy/privacy-settings-drawer.jsx";
import { BrowserVisibilityTracker } from "../observation/browser-visibility-tracker.js";
import "../styles/app-system.css";
import "../styles/readiness.css";
import "../styles/room.css";

export default function StudentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const token =
    sessionStorage.getItem("chronos_token") ||
    localStorage.getItem("token") ||
    "";

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
  const sessionId = params.get("sessionId") || location.state?.sessionId || "default-session";
  const userName = user?.email || userId || "Student";
  const readinessCompleted = location.state?.readinessCompleted === true;

  // Dev-only design fixture: ?preview=live opens the live shell without a camera.
  const previewLive =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("preview") === "live";
  const [inMeeting, setInMeeting] = useState(previewLive);
  const [nudgeState, setNudgeState] = useState(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isPrivacyDrawerOpen, setIsPrivacyDrawerOpen] = useState(false);
  const [returnToSessionPrompt, setReturnToSessionPrompt] = useState(null);
  const [visionStatus, setVisionStatus] = useState({
    cameraActive: true,
    faceDetected: true,
    lightingQuality: "optimal",
    networkStatus: "connected",
  });

  const nudgeTimeoutRef = useRef(null);
  const returnPromptTimeoutRef = useRef(null);
  const readinessAutoJoinRef = useRef(false);

  const [showTracker, setShowTracker] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );
  const [signal, setSignal] = useState({ band: "nodata", identity: "checking" });
  const [history, setHistory] = useState([]);
  // Side rail tab: "signals" | "resources" | "submission" | "health"
  const [activeSideTab, setActiveSideTab] = useState("signals");
  const visibilityTrackerRef = useRef(null);

  const handleSignalChange = useCallback((next) => {
    setSignal(next);
    setHistory((prev) => {
      if (prev[prev.length - 1] === next.band) return prev;
      return [...prev, next.band].slice(-20);
    });
  }, []);

  const wsUrl =
    sessionId && userId
      ? `${import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000"}/ws/engagement/${sessionId}`
      : null;

  const { connected: wsConnected } = useWebSocket(wsUrl || "", null);

  const [showDisconnect, setShowDisconnect] = useState(false);
  useEffect(() => {
    const targetVisible = inMeeting && !wsConnected;
    const delay = targetVisible ? 2000 : 0;
    const t = setTimeout(() => setShowDisconnect(targetVisible), delay);
    return () => clearTimeout(t);
  }, [inMeeting, wsConnected]);

  // Setup BrowserVisibilityTracker for external resource clicks, focus & return-to-session prompt
  useEffect(() => {
    if (!sessionId || !userId || !inMeeting) return;
    const tenantId = sessionStorage.getItem("chronos_tenant_id") || "ten-default";
    const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

    const handleEventProduced = (envelope) => {
      // 1. Ingest event to server asynchronously
      let authToken = "";
      try {
        const raw = sessionStorage.getItem("chronos_user");
        if (raw) authToken = JSON.parse(raw)?.token || "";
      } catch {
        authToken = "";
      }

      fetch(`${BASE}/api/v1/events/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(envelope),
      }).catch(() => {});

      // 2. Return-to-session calm prompt trigger (15s to 60s away)
      const durationMs = envelope?.payload?.duration_ms || 0;
      if (
        (envelope.event_type === "PAGE_VISIBLE" || envelope.event_type === "WINDOW_FOCUSED") &&
        durationMs >= 15000
      ) {
        const awaySec = Math.round(durationMs / 1000);
        setReturnToSessionPrompt({ awaySeconds: awaySec });

        if (returnPromptTimeoutRef.current) clearTimeout(returnPromptTimeoutRef.current);
        returnPromptTimeoutRef.current = setTimeout(() => {
          setReturnToSessionPrompt(null);
        }, 10000);
      }
    };

    const tracker = new BrowserVisibilityTracker({
      sessionId,
      participantId: userId,
      tenantId,
      policyId: "RESOURCE_SUPPORTED_ASSESSMENT",
      onEventProduced: handleEventProduced,
    });
    tracker.start();
    visibilityTrackerRef.current = tracker;

    return () => {
      tracker.stop();
      visibilityTrackerRef.current = null;
      if (returnPromptTimeoutRef.current) clearTimeout(returnPromptTimeoutRef.current);
    };
  }, [sessionId, userId, inMeeting]);

  const handleJoin = useCallback(() => {
    setInMeeting(true);
    setActiveSideTab("resources"); // Default to showing assessment materials on join
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

    const text = typeof msg === "string"
      ? (msg === "hard" ? "Please refocus on the session window" : "Please refocus when ready")
      : msg?.message_text
        ? msg.message_text
        : msg?.nudge_type === "hard"
          ? "Please refocus on the session window"
          : "Please refocus when ready";

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
        <JoinScreen
          user={user}
          role="student"
          onJoin={handleJoin}
          token={token}
        />
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

  const tabs = [
    { id: "signals", label: "Signals" },
    { id: "resources", label: "Resources" },
    { id: "submission", label: "Answer" },
    { id: "health", label: "Health" },
  ];

  return (
    <>
      <NudgeNotification message={nudgeState?.text} />

      {returnToSessionPrompt && (
        <div className="room-return" role="status">
          <p>
            Welcome back. You were away for {returnToSessionPrompt.awaySeconds}{" "}
            seconds.
          </p>
          <div className="room-return-actions">
            <button
              type="button"
              className="btn btn-ink btn-sm"
              onClick={() => {
                setReturnToSessionPrompt(null);
                setIsContextModalOpen(true);
              }}
            >
              Add context
            </button>
            <button
              type="button"
              className="btn btn-line btn-sm"
              onClick={() => setReturnToSessionPrompt(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="app room">
        <h1 className="sr-only">Student room, session {sessionId}</h1>
        <StudentTopbar
          wsConnected={wsConnected}
          sessionId={sessionId}
          userName={userName}
          railOpen={showTracker}
          onToggleRail={() => setShowTracker((value) => !value)}
          onLeave={() => navigate("/", { replace: true })}
          onOpenPrivacy={() => setIsPrivacyDrawerOpen(true)}
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
              <span className="room-sep" aria-hidden="true" />
              <button
                type="button"
                className="text-btn"
                onClick={() => setIsContextModalOpen(true)}
              >
                Add context or ask for help
              </button>
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

            <div className="room-filters" role="tablist" aria-label="Rail view">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className="room-filter"
                  aria-selected={activeSideTab === tab.id}
                  aria-pressed={activeSideTab === tab.id}
                  onClick={() => setActiveSideTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeSideTab === "signals" && (
              <>
                <div className="signal-state">
                  <p className="label">Right now</p>
                  <p className="signal-state-title" key={`${signal.band}-title`}>
                    {current.title}
                  </p>
                  <p className="signal-state-copy" key={`${signal.band}-copy`}>
                    {current.copy}
                  </p>
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

                <p className="signal-note">
                  A nudge is a quiet message, not a mark. Frames, audio, and page
                  content are never stored.
                </p>
              </>
            )}

            {activeSideTab === "resources" && (
              <div className="room-panel">
                <ResourcePanel
                  sessionId={sessionId}
                  token={token}
                  visibilityTrackerRef={visibilityTrackerRef}
                  policyId="RESOURCE_SUPPORTED_ASSESSMENT"
                  className="border-0 bg-transparent p-0"
                />
              </div>
            )}

            {activeSideTab === "submission" && (
              <div className="room-panel">
                <AnswerSubmissionPanel
                  sessionId={sessionId}
                  token={token}
                  className="border-0 bg-transparent p-0"
                />
              </div>
            )}

            {activeSideTab === "health" && (
              <div className="room-panel">
                <StudentHealthPanel
                  cameraActive={visionStatus.cameraActive}
                  faceDetected={visionStatus.faceDetected}
                  lightingQuality={visionStatus.lightingQuality}
                  networkStatus={wsConnected ? "connected" : "reconnecting"}
                  onOpenContextModal={() => setIsContextModalOpen(true)}
                />
              </div>
            )}

            {/* Mounted once so the local vision heartbeat survives tab changes. */}
            <div
              className="signal-camera"
              style={{ display: activeSideTab === "signals" ? undefined : "none" }}
            >
              <div className="signal-camera-head">
                <h3>Camera check</h3>
                <span className="meta">Local only</span>
              </div>
              <EngagementTracker
                sessionId={sessionId}
                userId={userId}
                onNudge={handleNudge}
                onVisionStatusChange={setVisionStatus}
                onStateChange={handleSignalChange}
              />
            </div>
          </aside>
        </div>
      </div>

      {/* Student Structured Context & Appeal Modal */}
      <StudentContextModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
        sessionId={sessionId}
      />

      {/* Privacy Settings, Consent Withdrawal & DSR Drawer */}
      <PrivacySettingsDrawer
        isOpen={isPrivacyDrawerOpen}
        onClose={() => setIsPrivacyDrawerOpen(false)}
        sessionId={sessionId}
        token={token}
      />
    </>
  );
}
