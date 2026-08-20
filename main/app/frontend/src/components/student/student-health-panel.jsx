// src/components/student/student-health-panel.jsx
// Workstream W7: Student Health Projection & Technical Self-Recovery

import { useState } from "react";

export default function StudentHealthPanel({
  cameraActive = true,
  faceDetected = true,
  lightingQuality = "optimal",
  networkStatus = "connected",
  identityState = "VERIFIED",
  activePresenceState = "NOT_REQUESTED",
  onRetryCamera,
  onRetryIdentity,
  onOpenContextModal,
}) {
  const [cameraRetrying, setCameraRetrying] = useState(false);
  const [identityRetrying, setIdentityRetrying] = useState(false);

  const handleCameraRetry = async () => {
    setCameraRetrying(true);
    try {
      if (onRetryCamera) {
        await onRetryCamera();
      } else {
        await navigator.mediaDevices?.getUserMedia({ video: true });
      }
    } catch (err) {
      console.warn("Camera retry failed:", err);
    } finally {
      setTimeout(() => setCameraRetrying(false), 800);
    }
  };

  const handleIdentityRetry = async () => {
    setIdentityRetrying(true);
    try {
      if (onRetryIdentity) {
        await onRetryIdentity();
      }
    } catch (err) {
      console.warn("Identity retry failed:", err);
    } finally {
      setTimeout(() => setIdentityRetrying(false), 800);
    }
  };

  return (
    <div className="bg-[#1a1c1e] text-slate-100 rounded-2xl border border-white/10 p-4 space-y-4 shadow-lg">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
            System Health &amp; Self-Recovery
          </h3>
        </div>
        <button
          type="button"
          onClick={onOpenContextModal}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#dcc492]/10 hover:bg-[#dcc492]/20 text-[#dcc492] border border-[#dcc492]/30 transition flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Add Context
        </button>
      </div>

      {/* Grid of Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* 1. Camera & Lighting */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300">Camera &amp; Lighting</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                cameraActive && faceDetected
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              {!cameraActive ? "OFFLINE" : !faceDetected ? "NO FACE" : "HEALTHY"}
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            {!cameraActive
              ? "Camera feed unavailable or permission revoked."
              : !faceDetected
              ? "Align your face in the center of the camera."
              : lightingQuality === "low"
              ? "Lighting is low. Please turn on front light."
              : "Camera feed and framing are clear."}
          </p>

          {!cameraActive && (
            <button
              type="button"
              onClick={handleCameraRetry}
              disabled={cameraRetrying}
              className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {cameraRetrying ? "Retrying Permission..." : "Retry Camera"}
            </button>
          )}
        </div>

        {/* 2. Network & Connectivity */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300">Network Telemetry</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                networkStatus === "connected"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
              }`}
            >
              {networkStatus.toUpperCase()}
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            {networkStatus === "connected"
              ? "Real-time telemetry stream active."
              : "Connection degraded. Reconnecting automatically..."}
          </p>
        </div>

        {/* 3. Identity Verification */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300">Identity Continuity</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                identityState === "VERIFIED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : identityState === "CHECKING"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              {identityState}
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            {identityState === "VERIFIED"
              ? "Local biometric template verified."
              : identityState === "CHECKING"
              ? "Verifying identity continuity..."
              : "Identity confidence low. Center camera and retry."}
          </p>

          {identityState !== "VERIFIED" && identityState !== "NOT_REQUESTED" && (
            <button
              type="button"
              onClick={handleIdentityRetry}
              disabled={identityRetrying}
              className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {identityRetrying ? "Verifying..." : "Re-Verify Identity"}
            </button>
          )}
        </div>

        {/* 4. Active Presence Protocol */}
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300">Active Presence</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                activePresenceState === "PASSED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : activePresenceState === "IN_PROGRESS" || activePresenceState === "REQUESTED"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
              }`}
            >
              {activePresenceState}
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            {activePresenceState === "PASSED"
              ? "Session presence confirmed."
              : activePresenceState === "IN_PROGRESS" || activePresenceState === "REQUESTED"
              ? "Follow on-screen movement challenge."
              : "Standard observation active."}
          </p>
        </div>
      </div>
    </div>
  );
}
