// src/components/engagement-tracker.jsx
/**
 * Chronos Student Engagement & Observation Tracker
 * Workstream W4: Local Observation, Browser Context, and Active Presence
 * 
 * Enforces Core Invariants:
 * 1. Computer vision runs locally and feeds normalized observation telemetry via ObservationAdapter.
 * 2. The browser never calculates scores, strikes, or disengagement states.
 * 3. Browser visibility changes are tracked as duration intervals (destination_known: false).
 * 4. Active Presence challenges render in a calm, non-punitive modal with accessibility fallbacks.
 */

import React, { useEffect, useRef, useState } from "react";
import useWebSocket from "../hooks/use-websocket";
import { ObservationAdapter } from "../observation/observation-adapter";
import { BrowserVisibilityTracker } from "../observation/browser-visibility-tracker";
import {
  evaluateLighting,
  evaluateSharpness,
  calculateHeadPoseEuler,
  calculateEAR,
} from "../observation/vision-metrics";
import ActivePresenceModal from "./presence/ActivePresenceModal";
import { loadEmbedder } from "../utils/embedder";
import { fetchIdentity } from "../api/identity";

const DEBUG_LOGS = import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS === "true";

function debugLog(...args) {
  if (DEBUG_LOGS) {
    console.log(...args);
  }
}

export default function EngagementTracker({
  sessionId,
  userId,
  onNudge,
  onVisionStatusChange,
  onStateChange,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);

  // Active presence challenge modal state
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [facePresent, setFacePresent] = useState(false);
  const [lightingStatus, setLightingStatus] = useState("optimal"); // optimal | low | harsh
  const [currentPose, setCurrentPose] = useState({ yaw: 0, pitch: 0, roll: 0 });
  const [qualityScore, setQualityScore] = useState(1.0);
  const [identityStatus, setIdentityStatus] = useState("checking");
  const [tabSwitchPopup, setTabSwitchPopup] = useState(false);

  // Persistent adapter references
  const adapterRef = useRef(null);
  const visibilityTrackerRef = useRef(null);
  const currentPoseRef = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const onVisionStatusChangeRef = useRef(onVisionStatusChange);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onVisionStatusChangeRef.current = onVisionStatusChange;
  }, [onVisionStatusChange]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // A readable band for the student rail. The browser no longer scores
  // engagement, so the band reflects what the camera can actually see.
  const band = cameraActive && facePresent ? "attentive" : "nodata";
  useEffect(() => {
    onStateChangeRef.current?.({ band, identity: identityStatus });
  }, [band, identityStatus]);

  // Identity verification state
  const identityStateRef = useRef({
    lastCheck: 0,
    status: "checking",
    storedEmbedding: null,
    checkInterval: 180000, // 3 min
  });

  // WebSocket connection for telemetry transmission and server events
  const wsBase = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";
  const wsUrl = sessionId && userId ? `${wsBase}/ws/engagement/${sessionId}` : null;
  const { connected, send } = useWebSocket(wsUrl, (message) => {
    debugLog("[EngagementTracker] Received WebSocket message:", message);

    if (
      message.type === "active_presence_challenge" ||
      message.type === "liveness_challenge"
    ) {
      // Validate challenge targets this participant or all
      const targetUser = message.participant_id || message.user_id;
      if (!targetUser || targetUser === userId || targetUser === "all") {
        setActiveChallenge({
          challenge_id: message.challenge_id,
          actions: message.actions || (message.action_id ? [message.action_id.toUpperCase(), "RETURN_NEUTRAL"] : ["TURN_LEFT", "LOOK_UP"]),
          nonce: message.nonce || message.challenge_id,
          expires_at: message.expires_at,
          attempt_number: message.attempt_number || 1,
        });
      }
    } else if (message.type === "nudge") {
      onNudge?.(message);
    }
  });

  // Initialize Observation Adapter & Browser Visibility Tracker
  useEffect(() => {
    if (!sessionId || !userId) return;

    const tenantId = sessionStorage.getItem("chronos_tenant_id") || "ten-default";
    const isDemo = sessionStorage.getItem("chronos_is_demo") === "true";

    const adapter = new ObservationAdapter({
      sessionId,
      participantId: userId,
      tenantId,
      policyId: "CLASSROOM",
      isDemo,
      onSampleProduced: (envelope) => {
        if (typeof send === "function" && connected) {
          send(envelope);
        }
      },
    });

    const visibilityTracker = new BrowserVisibilityTracker({
      sessionId,
      participantId: userId,
      tenantId,
      policyId: "CLASSROOM",
      onEventProduced: (envelope) => {
        if (typeof send === "function" && connected) {
          send(envelope);
        }
        if (envelope.event_type === "PAGE_HIDDEN" || envelope.event_type === "WINDOW_BLURRED") {
          setTabSwitchPopup(true);
        }
      },
    });

    adapterRef.current = adapter;
    visibilityTrackerRef.current = visibilityTracker;

    adapter.start();
    visibilityTracker.start();

    return () => {
      adapter.stop();
      visibilityTracker.stop();
    };
  }, [sessionId, userId, connected, send]);

  // Load embedder and stored reference identity on mount
  useEffect(() => {
    (async () => {
      try {
        await loadEmbedder();
        const info = await fetchIdentity(userId);
        if (info && info.exists && info.embedding) {
          identityStateRef.current.storedEmbedding = info.embedding;
          identityStateRef.current.status = "checking";
          setIdentityStatus("checking");
        } else {
          identityStateRef.current.status = "no_enrollment";
          setIdentityStatus("no_enrollment");
        }
      } catch (err) {
        debugLog("[Identity] Failed to load embedding:", err);
      }
    })();
  }, [userId]);

  // MediaPipe FaceLandmarker and video inference loop
  useEffect(() => {
    let stream = null;
    let faceLandmarker = null;
    let animationFrameId = null;
    let isMounted = true;

    async function initVision() {
      const isCameraOptional = sessionStorage.getItem("chronos_camera_optional") === "true";
      if (isCameraOptional) {
        setCameraActive(false);
        onVisionStatusChangeRef.current?.({
          cameraActive: false,
          faceDetected: false,
          lightingQuality: "optional",
          networkStatus: "connected",
        });
        if (adapterRef.current) {
          adapterRef.current.updateMetrics({
            cameraActive: false,
            faceCount: 0,
            technicalReasons: ["CAMERA_OPTIONAL_MODE"],
          });
        }
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 720, height: 540 },
          audio: false,
        });

        if (!isMounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }

        const vision = await import("@mediapipe/tasks-vision");
        const FilesetResolver = vision.FilesetResolver;
        const FaceLandmarker = vision.FaceLandmarker;

        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.4/wasm"
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-assets/face_landmarker_v2.task",
          },
          runningMode: "video",
          numFaces: 2,
        });

        startInferenceLoop();
      } catch (err) {
        debugLog("[EngagementTracker] Camera/Vision init failed:", err);
        setCameraActive(false);
        onVisionStatusChangeRef.current?.({
          cameraActive: false,
          faceDetected: false,
          lightingQuality: "low",
          networkStatus: "connected",
        });
        if (adapterRef.current) {
          adapterRef.current.updateMetrics({
            cameraActive: false,
            faceCount: 0,
            technicalReasons: ["CAMERA_UNAVAILABLE"],
          });
        }
      }
    }

    function startInferenceLoop() {
      let lastInferenceTime = 0;

      function detect(timestamp) {
        if (!isMounted) return;

        if (videoRef.current && faceLandmarker && videoRef.current.readyState >= 2) {
          // Throttle inference to ~20 fps for smooth performance
          if (timestamp - lastInferenceTime >= 50) {
            lastInferenceTime = timestamp;
            const startTime = performance.now();

            try {
              const results = faceLandmarker.detectForVideo(videoRef.current, timestamp);
              const faces = results?.faceLandmarks || [];
              const faceCount = faces.length;

              setFacePresent(faceCount === 1);

              let lighting = { brightnessScore: 1.0, isLightingSufficient: true };
              let sharpness = { sharpnessScore: 1.0, isSharp: true };
              let pose = { yawDeg: 0, pitchDeg: 0, rollDeg: 0, poseConfidence: 1.0 };
              let ear = 0.3;

              if (canvasRef.current && videoRef.current) {
                const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                  canvasRef.current.width = 160;
                  canvasRef.current.height = 120;
                  ctx.drawImage(videoRef.current, 0, 0, 160, 120);
                  lighting = evaluateLighting(canvasRef.current, ctx);
                  sharpness = evaluateSharpness(canvasRef.current, ctx);
                }
              }

              const currentLightingQuality = lighting.brightnessScore < 0.6 ? "low" : "optimal";
              setLightingStatus(currentLightingQuality);

              if (faceCount > 0) {
                const primaryLandmarks = faces[0];
                pose = calculateHeadPoseEuler(primaryLandmarks);
                ear = calculateEAR(primaryLandmarks);
                currentPoseRef.current = { yaw: pose.yawDeg, pitch: pose.pitchDeg, roll: pose.rollDeg };
                setCurrentPose({ yaw: pose.yawDeg, pitch: pose.pitchDeg, roll: pose.rollDeg });
              }

              const combinedQuality = Math.min(lighting.brightnessScore, sharpness.sharpnessScore);
              setQualityScore(combinedQuality);

              onVisionStatusChangeRef.current?.({
                cameraActive: true,
                faceDetected: faceCount === 1,
                lightingQuality: currentLightingQuality,
                networkStatus: "connected",
              });

              const processingMs = performance.now() - startTime;

              // Forward pure physical telemetry to observation adapter
              if (adapterRef.current) {
                const technicalReasons = [];
                if (faceCount === 0) technicalReasons.push("NO_FACE_DETECTED");
                if (faceCount > 1) technicalReasons.push("MULTIPLE_FACES_DETECTED");
                if (!lighting.isLightingSufficient) technicalReasons.push("CAMERA_POOR_QUALITY");
                if (!sharpness.isSharp) technicalReasons.push("IMAGE_QUALITY_INSUFFICIENT");
                if (pose.poseConfidence < 0.6) technicalReasons.push("LOW_CONFIDENCE");

                adapterRef.current.updateMetrics({
                  cameraActive: true,
                  faceCount,
                  qualityScore: combinedQuality,
                  brightnessScore: lighting.brightnessScore,
                  sharpnessScore: sharpness.sharpnessScore,
                  poseConfidence: pose.poseConfidence,
                  yawDeg: faceCount > 0 ? pose.yawDeg : null,
                  pitchDeg: faceCount > 0 ? pose.pitchDeg : null,
                  rollDeg: faceCount > 0 ? pose.rollDeg : null,
                  ear,
                  isPageHidden: document.hidden,
                  technicalReasons,
                  processingDurationMs: processingMs,
                });
              }
            } catch (err) {
              debugLog("[Inference] Error:", err);
            }
          }
        }
        animationFrameId = requestAnimationFrame(detect);
      }

      animationFrameId = requestAnimationFrame(detect);
    }

    initVision();

    return () => {
      isMounted = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="relative w-full rounded-2xl bg-[#091926] border border-white/10 shadow-xl overflow-hidden p-4">
      {/* Video Preview Container */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/10">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover grayscale-[10%]"
        />

        {/* Hidden offscreen canvases for lighting/sharpness evaluation */}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={cropCanvasRef} className="hidden" />

        {/* Live Overlay Status Strip */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-md border ${
                facePresent
                  ? "bg-emerald-950/70 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-950/70 border-amber-500/30 text-amber-300"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">
                {facePresent ? "face" : "face_retouching_off"}
              </span>
              {facePresent ? "Face In Frame" : "No Face Detected"}
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-md border ${
                lightingStatus === "optimal"
                  ? "bg-emerald-950/70 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-950/70 border-amber-500/30 text-amber-300"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">
                {lightingStatus === "optimal" ? "light_mode" : "wb_sunny"}
              </span>
              Lighting: {lightingStatus}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full text-[11px] text-white/70 border border-white/10 backdrop-blur-md">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {cameraActive ? "Active Observation" : "Camera Initializing"}
            </div>

            {identityStatus === "verified" && (
              <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] text-emerald-300 backdrop-blur-md">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                Verified
              </div>
            )}
          </div>
        </div>

        {/* Head Pose Guidance Indicators */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-white/80 font-mono">
          <span>Yaw: {currentPose.yaw}°</span>
          <span className="text-white/30">|</span>
          <span>Pitch: {currentPose.pitch}°</span>
        </div>
      </div>

      {/* Tab Switch Context Notice */}
      {tabSwitchPopup && (
        <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs text-white/80">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-sm">info</span>
            <span>Returned to session window. Navigation intervals recorded.</span>
          </div>
          <button
            onClick={() => setTabSwitchPopup(false)}
            className="text-white/40 hover:text-white text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Presence Verification Modal */}
      {activeChallenge && (
        <ActivePresenceModal
          challenge={activeChallenge}
          sessionId={sessionId}
          currentPose={currentPose}
          qualityScore={qualityScore}
          onComplete={() => setActiveChallenge(null)}
          onDismiss={() => setActiveChallenge(null)}
        />
      )}
    </div>
  );
}
