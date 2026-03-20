// src/pages/StudentPage.jsx

import { useState, useRef } from "react";
import { useLocation } from "react-router-dom";

import JoinScreen from "../components/JoinScreen.jsx";
import EngagementTracker from "../components/EngagementTracker.jsx";
import NudgeNotification from "../components/NudgeNotification.jsx";
import HMSMeeting from "../hms/HMSMeeting.jsx";
import useWebSocket from "../hooks/useWebSocket.js";

export default function StudentPage() {
  const location = useLocation();
  const user = location.state?.user;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Session Expired</h2>
          <p className="text-slate-600 mb-4">No user found. Please login again.</p>
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

  const userId = user.id;
  const sessionId = "default-session";
  const userName = user.email || userId;

  const [inMeeting, setInMeeting] = useState(false);
  const [nudgeMsg, setNudgeMsg] = useState(null);
  const nudgeTimeoutRef = useRef(null);
  const [showTracker, setShowTracker] = useState(true);

  const wsUrl = sessionId && userId
    ? `${import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000"}/ws/engagement/${sessionId}/${userId}`
    : null;

  const { connected, send } = useWebSocket(wsUrl || "", null);

  const handleJoin = () => {
    setInMeeting(true);
  };

  const handleNudge = (msg) => {
    if (nudgeTimeoutRef.current) clearTimeout(nudgeTimeoutRef.current);

    const text =
      msg?.message_text
        ? msg.message_text
        : msg?.nudge_type === "hard"
        ? "Attention Required!"
        : "Please pay attention!";

    setNudgeMsg(text);

    nudgeTimeoutRef.current = setTimeout(() => setNudgeMsg(null), 5000);
  };

  if (!inMeeting) {
    return <JoinScreen user={user} onJoin={handleJoin} />;
  }

  return (
    <>
      <NudgeNotification message={nudgeMsg} />

      <div className="w-full h-screen flex overflow-hidden bg-slate-100">
        <div className="flex-1 bg-slate-900 relative overflow-hidden">
          <HMSMeeting
            userName={userName}
            role="guest"
            onLeave={() => window.location.reload()}
          />
        </div>

        {showTracker && (
          <div className="w-[420px] bg-white h-full border-l border-slate-200 overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white p-5 z-10 shadow-md">
              <h2 className="text-xl font-bold mb-0.5">
                Engagement Monitor
              </h2>
              <p className="text-sm text-indigo-100">
                Real-time attention tracking
              </p>
            </div>

            <div className="p-4">
              <EngagementTracker
                sessionId={sessionId}
                userId={userId}
                onNudge={handleNudge}
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setShowTracker(!showTracker)}
          className="absolute top-4 left-4 bg-white/95 hover:bg-white text-slate-800 px-4 py-2 rounded-full text-sm font-medium shadow-lg border border-slate-200/80 flex items-center gap-2 z-40 transition-all duration-200"
        >
          <span>{showTracker ? "←" : "→"}</span>
          <span>{showTracker ? "Hide" : "Show"} Panel</span>
        </button>
      </div>
    </>
  );
}
