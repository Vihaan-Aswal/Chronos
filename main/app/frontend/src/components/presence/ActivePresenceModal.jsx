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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="presence-modal-title">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#091926] border border-[#DCC492]/30 shadow-2xl p-6 text-white">
        {/* Top Header & Countdown */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#DCC492] text-2xl" aria-hidden="true">
              verified_user
            </span>
            <div>
              <h3 id="presence-modal-title" className="font-headline font-bold text-lg text-[#DCC492]">
                Active Presence Verification
              </h3>
              <p className="text-xs text-white/60">
                Quick confirmation of attendance & engagement
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
            <span className="material-symbols-outlined text-xs text-[#DCC492]">
              timer
            </span>
            <span className="text-xs font-mono font-bold text-[#DCC492]">
              {secondsRemaining}s
            </span>
          </div>
        </div>

        {/* Step Indicator Progress */}
        <div className="grid grid-cols-4 gap-2 mb-6">
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
                className={`py-2 px-1 rounded-lg text-center border transition-all ${
                  isDone
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-400"
                    : isCurrent
                    ? "bg-[#DCC492]/20 border-[#DCC492] text-[#DCC492] font-semibold"
                    : "bg-white/5 border-white/10 text-white/40"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider">Step {idx + 1}</div>
                <div className="text-xs truncate">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Main Instruction Display */}
        <div className="bg-black/30 rounded-xl p-5 border border-white/10 text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#DCC492]/10 border border-[#DCC492]/30 mb-3 text-[#DCC492]">
            <span className="material-symbols-outlined text-3xl">
              {stage === "BASELINE" || stage === "RETURN_CENTER" || stage === "FINAL_CENTER"
                ? "face"
                : stage === "ACTION_1"
                ? action1Def.icon
                : action2Def.icon}
            </span>
          </div>

          <div className="text-base font-medium text-white mb-2">{statusMessage}</div>

          {/* Real-time Hold Progress Bar */}
          <div
            className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden max-w-xs mx-auto"
            role="progressbar"
            aria-valuenow={holdProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Pose hold progress"
          >
            <div
              className="h-full bg-gradient-to-r from-[#DCC492] to-emerald-400 transition-all duration-100"
              style={{ width: `${holdProgress}%` }}
            />
          </div>
          <div className="text-[11px] text-white/50 mt-1.5">
            Hold pose: {holdProgress}%
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-500/30 rounded-lg text-red-300 text-xs text-center">
            {errorMsg}
          </div>
        )}

        {/* Accessibility & Manual Fallbacks */}
        <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
          <div className="text-[11px] text-white/50 text-center mb-1">
            Need an alternative accommodation or having camera trouble?
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={handleAlternativeNeutralVerification}
              disabled={isSubmitting}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-xs text-white/90 transition-all"
            >
              Use Neutral Hold
            </button>
            <button
              onClick={handleManualReviewRequest}
              disabled={isSubmitting}
              className="px-3 py-2 bg-amber-950/30 hover:bg-amber-900/40 border border-amber-500/30 rounded-lg text-xs text-amber-300 transition-all"
            >
              Teacher Check
            </button>
            <button
              onClick={handleDecline}
              disabled={isSubmitting}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/60 transition-all"
            >
              Decline Check
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
