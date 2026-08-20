// src/pages/StudentPage.jsx

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

import JoinScreen from "../components/join-screen.jsx";
import EngagementTracker from "../components/engagement-tracker.jsx";
import NudgeNotification from "../components/nudge-notification.jsx";
import HMSMeeting from "../meeting/hms-meeting.jsx";
import useWebSocket from "../hooks/use-websocket.js";
import StudentTopbar from "../components/student/student-topbar.jsx";
import ResourcePanel from "../components/assessment/resource-panel.jsx";
import AnswerSubmissionPanel from "../components/assessment/answer-submission-panel.jsx";
import { BrowserVisibilityTracker } from "../observation/browser-visibility-tracker.js";
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

  // Side Rail Active Mode: "tracker" | "resources" | "submission" | null
  const [activeSideTab, setActiveSideTab] = useState(null);
  const [isAssessmentExpanded, setIsAssessmentExpanded] = useState(false);
  const visibilityTrackerRef = useRef(null);

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

  // Setup BrowserVisibilityTracker for external resource clicks & focus
  useEffect(() => {
    if (!sessionId || !userId || !inMeeting) return;
    const tenantId = sessionStorage.getItem("chronos_tenant_id") || "ten-default";
    const tracker = new BrowserVisibilityTracker({
      sessionId,
      participantId: userId,
      tenantId,
      policyId: "RESOURCE_SUPPORTED_ASSESSMENT",
    });
    tracker.start();
    visibilityTrackerRef.current = tracker;

    return () => {
      tracker.stop();
      visibilityTrackerRef.current = null;
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

  const isRailOpen = activeSideTab !== null;

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
              {/* Assessment Panel Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  if (activeSideTab === "resources" || activeSideTab === "submission") {
                    setActiveSideTab(null);
                  } else {
                    setActiveSideTab("resources");
                  }
                }}
                className={`sd-tracker-toggle ${
                  activeSideTab === "resources" || activeSideTab === "submission"
                    ? "bg-[#dcc492]/20 border-[#dcc492]/40 text-[#dcc492]"
                    : ""
                }`}
                aria-expanded={activeSideTab === "resources" || activeSideTab === "submission"}
                title="View question papers and submit answers"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Assessment Panel
              </button>

              {/* Focus Tracker Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  setActiveSideTab(activeSideTab === "tracker" ? null : "tracker");
                }}
                className={`sd-tracker-toggle ${activeSideTab === "tracker" ? "is-active" : ""}`}
                aria-expanded={activeSideTab === "tracker"}
                aria-controls="student-tracker-rail"
                title="View focus and engagement signals"
              >
                <span className="sd-toggle-dot" aria-hidden="true" />
                {activeSideTab === "tracker" ? "Hide Monitor" : "Focus Monitor"}
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

            {/* Side Rail Panel */}
            <aside
              className={`sd-tracker-rail ${isRailOpen ? "is-open" : "is-closed"} ${
                isAssessmentExpanded ? "w-[600px] min-w-[500px]" : ""
              }`}
              id="student-tracker-rail"
            >
              <div className={`sd-tracker-rail-inner ${isAssessmentExpanded ? "!w-full" : ""}`}>
                {/* Header with Navigation Tabs */}
                <div className="sd-tracker-rail-head">
                  <div className="sd-rail-title-row">
                    <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-[rgba(211,228,248,0.08)] flex-1">
                      <button
                        type="button"
                        onClick={() => setActiveSideTab("resources")}
                        className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 ${
                          activeSideTab === "resources"
                            ? "bg-[#dcc492] text-[#020e18] shadow-sm"
                            : "text-[#d3e4f8]/70 hover:text-white"
                        }`}
                      >
                        Resources
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSideTab("submission")}
                        className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 ${
                          activeSideTab === "submission"
                            ? "bg-[#7eb2ff] text-[#020e18] shadow-sm"
                            : "text-[#d3e4f8]/70 hover:text-white"
                        }`}
                      >
                        Submit Answer
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSideTab("tracker")}
                        className={`py-1 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 ${
                          activeSideTab === "tracker"
                            ? "bg-white/20 text-white shadow-sm"
                            : "text-[#d3e4f8]/70 hover:text-white"
                        }`}
                      >
                        Focus
                      </button>
                    </div>

                    {/* Expand Width & Close Buttons */}
                    <div className="flex items-center gap-1 pl-1">
                      {(activeSideTab === "resources" || activeSideTab === "submission") && (
                        <button
                          type="button"
                          onClick={() => setIsAssessmentExpanded(!isAssessmentExpanded)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-[#d3e4f8]/60 hover:text-white transition"
                          title={isAssessmentExpanded ? "Collapse width" : "Expand width"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {isAssessmentExpanded ? (
                              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
                            ) : (
                              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                            )}
                          </svg>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setActiveSideTab(null)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-[#d3e4f8]/60 hover:text-white transition"
                        title="Close panel"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content Panel Area */}
                <div className="sd-tracker-content p-3 overflow-y-auto flex-1 flex flex-col min-h-0">
                  {activeSideTab === "resources" && (
                    <ResourcePanel
                      sessionId={sessionId}
                      token={sessionStorage.getItem("chronos_token") || localStorage.getItem("token")}
                      visibilityTrackerRef={visibilityTrackerRef}
                      policyId="RESOURCE_SUPPORTED_ASSESSMENT"
                      className="flex-1 border-0 bg-transparent p-0"
                    />
                  )}

                  {activeSideTab === "submission" && (
                    <AnswerSubmissionPanel
                      sessionId={sessionId}
                      token={sessionStorage.getItem("chronos_token") || localStorage.getItem("token")}
                      className="flex-1 border-0 bg-transparent p-0"
                    />
                  )}

                  {activeSideTab === "tracker" && (
                    <EngagementTracker
                      sessionId={sessionId}
                      userId={userId}
                      onNudge={handleNudge}
                    />
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
