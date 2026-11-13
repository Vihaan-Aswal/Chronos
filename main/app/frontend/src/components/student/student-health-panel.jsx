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
    <div className="health">
      <div className="health-head">
        <div className="row">
          <span className="dot dot-live" aria-hidden="true" />
          <h3 className="health-title">System Health &amp; Self-Recovery</h3>
        </div>
        <button
          type="button"
          onClick={onOpenContextModal}
          className="btn btn-line btn-sm"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Add Context
        </button>
      </div>

      {/* Health Indicators */}
      {/* 1. Camera & Lighting */}
      <div className="health-cell">
        <div className="health-cell-head">
          <h4>Camera &amp; Lighting</h4>
          <span
            className={`badge ${
              cameraActive && faceDetected ? "badge-attentive" : "badge-distracted"
            }`}
          >
            {!cameraActive ? "OFFLINE" : !faceDetected ? "NO FACE" : "HEALTHY"}
          </span>
        </div>

        <p>
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
            className="btn btn-line btn-sm"
          >
            {cameraRetrying ? (
              <span className="surface-spin inline-spin" aria-hidden="true" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            )}
            {cameraRetrying ? "Retrying Permission..." : "Retry Camera"}
          </button>
        )}
      </div>

      {/* 2. Network & Connectivity */}
      <div className="health-cell">
        <div className="health-cell-head">
          <h4>Network Telemetry</h4>
          <span
            className={`badge ${
              networkStatus === "connected" ? "badge-attentive" : "badge-flag"
            }`}
          >
            {networkStatus.toUpperCase()}
          </span>
        </div>

        <p>
          {networkStatus === "connected"
            ? "Real-time telemetry stream active."
            : "Connection degraded. Reconnecting automatically..."}
        </p>
      </div>

      {/* 3. Identity Verification */}
      <div className="health-cell">
        <div className="health-cell-head">
          <h4>Identity Continuity</h4>
          <span
            className={`badge ${
              identityState === "VERIFIED"
                ? "badge-attentive"
                : identityState === "CHECKING"
                ? "badge-away"
                : "badge-distracted"
            }`}
          >
            {identityState}
          </span>
        </div>

        <p>
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
            className="btn btn-line btn-sm"
          >
            {identityRetrying ? (
              <span className="surface-spin inline-spin" aria-hidden="true" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
            {identityRetrying ? "Verifying..." : "Re-Verify Identity"}
          </button>
        )}
      </div>

      {/* 4. Active Presence Protocol */}
      <div className="health-cell">
        <div className="health-cell-head">
          <h4>Active Presence</h4>
          <span
            className={`badge ${
              activePresenceState === "PASSED"
                ? "badge-attentive"
                : activePresenceState === "IN_PROGRESS" ||
                  activePresenceState === "REQUESTED"
                ? "badge-distracted"
                : "badge-away"
            }`}
          >
            {activePresenceState}
          </span>
        </div>

        <p>
          {activePresenceState === "PASSED"
            ? "Session presence confirmed."
            : activePresenceState === "IN_PROGRESS" || activePresenceState === "REQUESTED"
            ? "Follow on-screen movement challenge."
            : "Standard observation active."}
        </p>
      </div>
    </div>
  );
}
