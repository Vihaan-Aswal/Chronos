import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  respondPresenceChallenge,
  declinePresenceChallenge,
  requestManualReview,
} from "../../api/presence";

/**
 * Action definitions and human-readable instructions.
 */
const ACTION_MAP = {
  TURN_LEFT: {
    label: "Turn Head Left",
    instruction: "Turn your head to your left ⬅️",
    icon: "arrow_back",
    check: (yaw) => yaw <= -18.0,
  },
  TURN_RIGHT: {
    label: "Turn Head Right",
    instruction: "Turn your head to your right ➡️",
    icon: "arrow_forward",
    check: (yaw) => yaw >= 18.0,
  },
  LOOK_UP: {
    label: "Look Up",
    instruction: "Tilt your head slightly upward ⬆️",
    icon: "arrow_upward",
    check: (yaw, pitch) => pitch <= -12.0,
  },
  LOOK_DOWN: {
    label: "Look Down",
    instruction: "Tilt your head slightly downward ⬇️",
    icon: "arrow_downward",
    check: (yaw, pitch) => pitch >= 12.0,
  },
  NOD: {
    label: "Nod Head",
    instruction: "Gently nod your head up and down ↕️",
    icon: "sync_alt",
    check: (yaw, pitch, nodHistory) => {
      if (!nodHistory || nodHistory.length < 5) return false;
      const pitches = nodHistory.map((h) => h.pitch);
      const maxP = Math.max(...pitches);
      const minP = Math.min(...pitches);
      return maxP >= 8.0 && minP <= -8.0;
    },
  },
  RETURN_NEUTRAL: {
    label: "Center Head",
    instruction: "Look directly at your screen 🎯",
    icon: "center_focus_strong",
    check: (yaw, pitch) => Math.abs(yaw) <= 10.0 && Math.abs(pitch) <= 8.0,
  },
};

export default function ActivePresenceModal({
  challenge,
  sessionId,
  currentPose = { yaw: 0, pitch: 0, roll: 0 },
  qualityScore = 1.0,
  onComplete,
  onDismiss,
}) {
  const [stage, setStage] = useState("BASELINE");
  const [secondsRemaining, setSecondsRemaining] = useState(15);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const actions = useMemo(() => challenge?.actions || ["TURN_LEFT", "LOOK_UP"], [challenge?.actions]);
  const action1Key = actions[0] || "TURN_LEFT";
  const action2Key = actions[1] || "LOOK_UP";

  const action1Def = useMemo(() => ACTION_MAP[action1Key] || ACTION_MAP.TURN_LEFT, [action1Key]);
  const action2Def = useMemo(() => ACTION_MAP[action2Key] || ACTION_MAP.LOOK_UP, [action2Key]);

  const statusMessage = useMemo(() => {
    switch (stage) {
      case "BASELINE":
        return "Look straight at the camera to establish baseline...";
      case "ACTION_1":
        return action1Def.instruction;
      case "RETURN_CENTER":
        return "Return your head to the center...";
      case "ACTION_2":
        return action2Def.instruction;
      case "FINAL_CENTER":
        return "Hold center for confirmation...";
      default:
        return "Align your face and hold still...";
    }
  }, [stage, action1Def, action2Def]);

  const holdTimerRef = useRef(0);
  const nodHistoryRef = useRef([]);
  const startTimeRef = useRef(0);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  const handleTimeout = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await respondPresenceChallenge(sessionId, {
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        submitted_actions: [],
        quality_ok: false,
        elapsed_ms: 15000,
        is_neutral_baseline_held: false,
        is_return_to_neutral_held: false,
      });
    } catch {
      // Ignore sync errors on timeout
    }
    onDismiss?.();
  }, [challenge, sessionId, onDismiss]);

  const handleSuccess = useCallback(async () => {
    setIsSubmitting(true);
    const elapsedMs = Math.max(0, Date.now() - startTimeRef.current);
    try {
      await respondPresenceChallenge(sessionId, {
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        submitted_actions: actions,
        quality_ok: qualityScore >= 0.70,
        elapsed_ms: elapsedMs,
        is_neutral_baseline_held: true,
        is_return_to_neutral_held: true,
        alternative_verification: false,
      });
      onComplete?.({ status: "PASSED" });
    } catch (err) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  }, [actions, challenge, onComplete, qualityScore, sessionId]);

  const advanceStage = useCallback(() => {
    setStage((prev) => {
      if (prev === "BASELINE") return "ACTION_1";
      if (prev === "ACTION_1") return "RETURN_CENTER";
      if (prev === "RETURN_CENTER") return "ACTION_2";
      if (prev === "ACTION_2") return "FINAL_CENTER";
      if (prev === "FINAL_CENTER") {
        handleSuccess();
        return "COMPLETE";
      }
      return prev;
    });
  }, [handleSuccess]);

  // 15-second total countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [handleTimeout]);

  // Real-time gesture evaluation loop
  useEffect(() => {
    if (isSubmitting || stage === "COMPLETE") return;

    const yaw = currentPose.yaw || 0;
    const pitch = currentPose.pitch || 0;

    nodHistoryRef.current.push({ pitch, ts: Date.now() });
    if (nodHistoryRef.current.length > 20) {
      nodHistoryRef.current.shift();
    }

    let isPoseValid = false;
    let targetHoldMs = 1000;

    switch (stage) {
      case "BASELINE":
        isPoseValid = Math.abs(yaw) <= 10.0 && Math.abs(pitch) <= 8.0;
        targetHoldMs = 1000;
        break;

      case "ACTION_1":
        isPoseValid = action1Def.check(yaw, pitch, nodHistoryRef.current);
        targetHoldMs = 350;
        break;

      case "RETURN_CENTER":
        isPoseValid = Math.abs(yaw) <= 10.0 && Math.abs(pitch) <= 8.0;
        targetHoldMs = 400;
        break;

      case "ACTION_2":
        isPoseValid = action2Def.check(yaw, pitch, nodHistoryRef.current);
        targetHoldMs = 350;
        break;

      case "FINAL_CENTER":
        isPoseValid = Math.abs(yaw) <= 10.0 && Math.abs(pitch) <= 8.0;
        targetHoldMs = 300;
        break;

      default:
        break;
    }

    if (isPoseValid) {
      holdTimerRef.current += 100;
      const progress = Math.min(100, Math.round((holdTimerRef.current / targetHoldMs) * 100));
      setHoldProgress(progress);

      if (holdTimerRef.current >= targetHoldMs) {
        holdTimerRef.current = 0;
        setHoldProgress(0);
        advanceStage();
      }
    } else {
      holdTimerRef.current = Math.max(0, holdTimerRef.current - 50);
      setHoldProgress((prev) => Math.max(0, prev - 10));
    }
  }, [action1Def, action2Def, advanceStage, currentPose, isSubmitting, stage]);

  const handleAlternativeNeutralVerification = async () => {
    setIsSubmitting(true);
    const elapsedMs = Math.max(0, Date.now() - startTimeRef.current);
    try {
      await respondPresenceChallenge(sessionId, {
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        submitted_actions: actions,
        quality_ok: true,
        elapsed_ms: elapsedMs,
        is_neutral_baseline_held: true,
        is_return_to_neutral_held: true,
        alternative_verification: true,
      });
      onComplete?.({ status: "PASSED", alternative: true });
    } catch (err) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  };

  const handleManualReviewRequest = async () => {
    setIsSubmitting(true);
    try {
      await requestManualReview(sessionId, {
        challenge_id: challenge.challenge_id,
        reason: "Student requested manual teacher verification",
      });
      onComplete?.({ status: "MANUAL_REVIEW" });
    } catch (err) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setIsSubmitting(true);
    try {
      await declinePresenceChallenge(sessionId, {
        challenge_id: challenge.challenge_id,
        reason: "Participant declined check",
      });
      onDismiss?.();
    } catch (err) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onDismiss?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <div className="app surface-overlay surface-overlay--forest" role="dialog" aria-modal="true" aria-labelledby="presence-modal-title">
      <div className="surface-modal presence-modal">
        {/* Top Header & Countdown */}
        <div className="surface-head">
          <div className="surface-head-main">
            <div className="surface-mark surface-mark--gold" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <h3 id="presence-modal-title" className="surface-title">
                Active Presence Verification
              </h3>
              <p className="surface-sub">
                Quick confirmation of attendance & engagement
              </p>
            </div>
          </div>
          <div className="presence-timer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            {secondsRemaining}s
          </div>
        </div>

        <div className="surface-body">
          {/* Step Indicator Progress */}
          <div className="presence-steps">
            {[
              { key: "BASELINE", label: "Center" },
              { key: "ACTION_1", label: action1Def.label },
              { key: "ACTION_2", label: action2Def.label },
              { key: "FINAL_CENTER", label: "Confirm" },
            ].map((s, idx) => {
              const isDone =
                (stage === "ACTION_1" && idx === 0) ||
                (stage === "RETURN_CENTER" && idx <= 1) ||
                (stage === "ACTION_2" && idx <= 1) ||
                (stage === "FINAL_CENTER" && idx <= 2) ||
                stage === "COMPLETE";
              const isCurrent =
                stage === s.key ||
                (stage === "RETURN_CENTER" && idx === 1);

              return (
                <div
                  key={s.key}
                  className={`presence-step${isDone ? " is-done" : ""}${isCurrent ? " is-current" : ""}`}
                >
                  <span>Step {idx + 1}</span>
                  <b>{s.label}</b>
                </div>
              );
            })}
          </div>

          {/* Main Instruction Display */}
          <div className="presence-card">
            <div className="presence-mark" aria-hidden="true">
              <span className="material-symbols-outlined text-3xl">
                {stage === "BASELINE" || stage === "RETURN_CENTER" || stage === "FINAL_CENTER"
                  ? "face"
                  : stage === "ACTION_1"
                  ? action1Def.icon
                  : action2Def.icon}
              </span>
            </div>

            <div className="presence-instruction">{statusMessage}</div>

            {/* Real-time Hold Progress Bar */}
            <div
              className="presence-progress"
              role="progressbar"
              aria-valuenow={holdProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Pose hold progress"
            >
              <span style={{ width: `${holdProgress}%` }} />
            </div>
            <div className="presence-progress-caption">
              Hold pose: {holdProgress}%
            </div>
          </div>

          {errorMsg && (
            <div className="notice notice-flag" role="alert">
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Accessibility & Manual Fallbacks */}
          <div className="presence-fallback">
            <p>
              Need an alternative accommodation or having camera trouble?
            </p>

            <div className="presence-actions">
              <button
                type="button"
                onClick={handleAlternativeNeutralVerification}
                disabled={isSubmitting}
                className="btn btn-cream btn-sm"
              >
                Use Neutral Hold
              </button>
              <button
                type="button"
                onClick={handleManualReviewRequest}
                disabled={isSubmitting}
                className="btn btn-ghost btn-sm"
              >
                Teacher Check
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={isSubmitting}
                className="btn btn-quiet-cream btn-sm"
              >
                Decline Check
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
