// src/components/EngagementTracker.jsx
import { useEffect, useRef, useState } from "react";
import useWebSocket from "../hooks/useWebSocket";
import { getEmbedding, loadEmbedder } from "../utils/embedder";
import { fetchIdentity } from "../api/identity";

function EngagementTracker({ sessionId, userId, onNudge }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  
  function computeEAR(landmarks, [upper, lower, inner, outer]) {
    if (!landmarks || landmarks.length === 0) return 0;
    if (!landmarks[upper] || !landmarks[lower] || !landmarks[inner] || !landmarks[outer]) return 0;
    const vertical = distance(landmarks[upper], landmarks[lower]);
    const horizontal = distance(landmarks[inner], landmarks[outer]);
    return horizontal > 0 ? vertical / horizontal : 0;
  }

  const gazeCalib = useRef({
    samples: [],
    centerAvg: 0.5,
    calibrated: false,
    smoothHoriz: 0.5,
    smoothVert: 0.3,
  }).current;

  const poseState = useRef({
    smoothYaw: 0,
    smoothPitch: 0,
    turned: false,
    lookingDown: false,
  }).current;

  const presenceState = useRef({ status: "unknown", bboxArea: 0 }).current;
  const engagementState = useRef({ score: 1, smoothScore: 1 }).current;

  const currentMetricsRef = useRef({
    gazeDirection: "center",
    ear: 0,
    headPose: { yaw: 0, pitch: 0 },
    presence: "unknown",
    identityStatus: "checking"
  });

  // IDENTITY VERIFICATION STATE - low-frequency checks (2-5 min)
  const identityState = useRef({
    lastCheck: 0,
    status: "checking",
    storedEmbedding: null,
    checkInterval: 120000 + Math.floor(Math.random() * 180000), // 2-5 min in ms
    mismatchCount: 0,
    verifiedCount: 0,
    consecutiveMismatches: 0,
    consecutiveVerified: 0,
    unverifiedStreak: 0,
    lastDistance: null,
    skipNextCheck: false // Skip checks when conditions aren't met
  }).current;

  const [identityStatus, setIdentityStatus] = useState("checking");
  const [sessionMode, setSessionMode] = useState("normal");
  const [tabSwitchPopup, setTabSwitchPopup] = useState(false);
  const [livenessChallenge, setLivenessChallenge] = useState(null);
  const livenessChallengeRef = useRef(null);

  // Load embedder and stored identity on mount
  useEffect(() => {
    (async () => {
      try {
        await loadEmbedder();
        const info = await fetchIdentity(userId);
        if (info && info.exists && info.embedding) {
          identityState.storedEmbedding = info.embedding;
          identityState.status = "checking";
          setIdentityStatus("checking");
          console.log("[Identity] Stored embedding loaded");
        } else {
          console.log("[Identity] No stored embedding found");
          identityState.status = "no_enrollment";
          setIdentityStatus("no_enrollment");
        }
      } catch (err) {
        console.error("[Identity] Failed to load:", err);
        // If we couldn't fetch enrollment for any reason, mark as no_enrollment
        identityState.status = "no_enrollment";
        setIdentityStatus("no_enrollment");
      }
    })();
  }, [userId]);

  // IDENTITY VERIFICATION HELPER
  function normalize(vec) {
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map((v) => v / (norm || 1));
  }

  function l2Distance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  async function verifyIdentity(landmarks) {
    if (!identityState.storedEmbedding) {
      // If there's no stored embedding, ensure UI reflects enrollment state
      if (identityState.status !== "no_enrollment") {
        identityState.status = "no_enrollment";
        setIdentityStatus("no_enrollment");
      }
      return;
    }
    if (identityState.status === "no_enrollment") return;
    
    const now = performance.now();
    if (now - identityState.lastCheck < identityState.checkInterval) return;
    
    // Skip if flagged
    if (identityState.skipNextCheck) {      
      return;
    }
    
    identityState.lastCheck = now;

    try {
      const video = videoRef.current;
      const cropCanvas = cropCanvasRef.current;
      if (!video || !cropCanvas) return;

      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      landmarks.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      // pad bbox slightly to include whole face and ensure minimum size
      const PAD = 0.05; // 5% padding
      minX = Math.max(0, minX - PAD);
      minY = Math.max(0, minY - PAD);
      maxX = Math.min(1, maxX + PAD);
      maxY = Math.min(1, maxY + PAD);

      let sx = Math.max(0, Math.floor(minX * video.videoWidth));
      let sy = Math.max(0, Math.floor(minY * video.videoHeight));
      let sw = Math.max(0, Math.floor((maxX - minX) * video.videoWidth));
      let sh = Math.max(0, Math.floor((maxY - minY) * video.videoHeight));

      // Ensure minimum crop area to avoid zero-sized drawImage
      const MIN_DIM = 48;
      if (sw < MIN_DIM) {
        const diff = MIN_DIM - sw;
        sx = Math.max(0, sx - Math.floor(diff / 2));
        sw = MIN_DIM;
        if (sx + sw > video.videoWidth) sx = Math.max(0, video.videoWidth - sw);
      }
      if (sh < MIN_DIM) {
        const diff = MIN_DIM - sh;
        sy = Math.max(0, sy - Math.floor(diff / 2));
        sh = MIN_DIM;
        if (sy + sh > video.videoHeight) sy = Math.max(0, video.videoHeight - sh);
      }

      // Check if face is reasonably centered and frontal
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const isCentered = Math.abs(centerX - 0.5) < 0.25 && Math.abs(centerY - 0.5) < 0.25;
      

      const ctx = cropCanvas.getContext("2d");
      ctx.clearRect(0, 0, 112, 112);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 112, 112);

      const emb = await getEmbedding(cropCanvas);
      if (!emb || !emb.length) return;

      const arr = Array.from(emb).map((v) => Number(v));
      if (arr.some((v) => !isFinite(v))) return;

      const normalizedEmb = normalize(arr);
      const storedNorm = normalize(Array.from(identityState.storedEmbedding));

      const dist = l2Distance(normalizedEmb, storedNorm);

      // Simple, reliable thresholds (no hysteresis, no mid-range complexity)
      const VERIFY_THRESHOLD = 0.50;    // below this = verified
      const MISMATCH_THRESHOLD = 0.55;   // above this = mismatch
      // Between 0.50-0.55 = uncertain zone (hold current status)

      console.log(`[Identity] Distance: ${dist.toFixed(3)}, Status: ${identityState.status}`);

      let prevStatus = identityState.status;

      if (dist < VERIFY_THRESHOLD) {
        // Clear match — verified
        identityState.status = "verified";
        identityState.mismatchCount = 0;
      } else if (dist > MISMATCH_THRESHOLD) {
        // Clear mismatch
        identityState.status = "mismatch";
        identityState.mismatchCount = Math.min((identityState.mismatchCount || 0) + 1, 9999);
      }
      // else: uncertain zone — keep current status

      // store this distance for next comparison
      identityState.lastDistance = dist;

      // Ensure UI & metrics reflect the new state immediately
      setIdentityStatus(identityState.status);
      currentMetricsRef.current.identityStatus = identityState.status;

      // If status changed, send an immediate identity update to teacher so UI reflects it live
      if (prevStatus !== identityState.status && typeof send === "function") {
        try {
          send({
            type: "identity_update",
            session_id: sessionId,
            user_id: userId,
            identity_status: identityState.status,
            identity_mismatch_count: identityState.mismatchCount || 0,
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          console.error("Failed to send identity_update:", err);
        }
      }

    } catch (err) {
      console.error("[Identity] Verification error:", err);
    }
  }

  // GAZE DIRECTION
  function gazeDirection(lm) {
    const LEFT_IRIS = 473, RIGHT_IRIS = 468;
    const LEFT_INNER = 263, LEFT_OUTER = 362;
    const RIGHT_INNER = 133, RIGHT_OUTER = 33;
    const [L_UP, L_DOWN] = [386, 374];
    const [R_UP, R_DOWN] = [159, 145];

    const horiz = ((lm[LEFT_IRIS].x - lm[LEFT_INNER].x) /
      (lm[LEFT_OUTER].x - lm[LEFT_INNER].x) +
      (lm[RIGHT_IRIS].x - lm[RIGHT_INNER].x) /
      (lm[RIGHT_OUTER].x - lm[RIGHT_INNER].x)) / 2;

    const down = ((lm[LEFT_IRIS].y - lm[L_UP].y) /
      (lm[L_DOWN].y - lm[L_UP].y) +
      (lm[RIGHT_IRIS].y - lm[R_UP].y) /
      (lm[R_DOWN].y - lm[R_UP].y)) / 2;

    gazeCalib.smoothHoriz = horiz;
    gazeCalib.smoothVert = down;

    if (!gazeCalib.calibrated) {
      gazeCalib.samples.push(horiz);
      if (gazeCalib.samples.length >= 25) {
        gazeCalib.centerAvg = 0.5;
        gazeCalib.calibrated = true;
      }
    }

    const c = gazeCalib.centerAvg;
    let dir = "center";
    if (down > 0.75) dir = "down";
    else if (horiz < c - 0.07) dir = "left";
    else if (horiz > c + 0.07) dir = "right";

    return { horizontal: horiz, vertical: down, direction: dir };
  }

  // HEAD POSE
  function estimateHeadPose(lm) {
    const nose = lm[1] ?? lm[4];
    const leftIris = lm[473];
    const rightIris = lm[468];
    const eyeMid = { x: (leftIris.x + rightIris.x) / 2, y: (leftIris.y + rightIris.y) / 2 };

    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let p of lm) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const faceW = maxX - minX || 1e-6;
    const faceH = maxY - minY || 1e-6;

    const yaw = (nose.x - (minX + maxX) / 2) / faceW;
    const pitch = (nose.y - eyeMid.y) / faceH;

    poseState.smoothYaw = poseState.smoothYaw * 0.75 + yaw * 0.25;
    poseState.smoothPitch = poseState.smoothPitch * 0.75 + pitch * 0.25;

    poseState.turned = Math.abs(poseState.smoothYaw) > 0.08;
    poseState.lookingDown = poseState.smoothPitch > 0.06;

    return {
      yaw: poseState.smoothYaw,
      pitch: poseState.smoothPitch,
      turned: poseState.turned,
      lookingDown: poseState.lookingDown,
    };
  }

  // SMILE (mouth openness - MediaPipe indices 61, 291 corners, 13, 14 lips)
  function checkSmile(lm) {
    if (!lm || lm.length < 300) return false;
    const p61 = lm[61], p291 = lm[291], p13 = lm[13], p14 = lm[14];
    if (!p61 || !p291 || !p13 || !p14) return false;
    const vert = Math.abs(p13.y - p14.y);
    const horiz = Math.abs(p61.x - p291.x) || 0.01;
    return vert / horiz > 0.12;
  }

  // PRESENCE
  function checkPresence(lm) {
    if (!lm) {
      presenceState.status = "no_face";
      return presenceState;
    }
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let p of lm) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const area = (maxX - minX) * (maxY - minY);
    presenceState.status = area > 0.0001 ? "present" : "no_face";
    presenceState.bboxArea = area;
    return presenceState;
  }

  // SCORING
  const scoreFromGaze = g => g.direction === "center" ? 1 : 0;
  const scoreFromHeadPose = p =>
    (!p.turned && !p.lookingDown) ? 1 :
      (p.turned && Math.abs(p.yaw) < 0.12) ? 0.6 : 0;
  const scoreFromPresence = p => p.status === "present" ? 1 : 0;
  const scoreFromEye = s =>
    s === "eyes_open" ? 1 :
      s === "blink" ? 0.9 :
        s === "closed_brief" ? 0.6 :
          s === "microsleep" ? 0.2 : 0;
  const scoreFromIdentity = status => {
    if (status === "checking" || status === "no_enrollment") return 1;
    if (status === "verified") return 1;
    // Only penalize after confirmed repeated mismatches
    if (status === "mismatch" && identityState.mismatchCount >= 2) return 0.2;
    return 0.9;
  };

  const blinkData = useRef({
    lastEAR: 0,
    smoothEAR: 0,
    blinkStart: null,
    closedStart: null,
    status: "eyes_open",
  }).current;

  const leftEyeIdx = [386, 374, 263, 362];
  const rightEyeIdx = [159, 145, 133, 33];

  const OPEN_THRESHOLD = 0.32;
  const BLINK_THRESHOLD = 0.26;
  const CLOSED_THRESHOLD = 0.22;

  // Auto-nudge config 
  const WINDOW_MS = 10 * 1000;
  const CHECK_INTERVAL = 10 * 1000;
  const AUTO_THRESHOLD = 0.5;
  const RESPONSE_WAIT_MS = 10 * 1000;
  const MAX_STRIKES = 3;

  const scoreBufferRef = useRef([]);
  const pendingAutoRef = useRef({ pending: false, timeoutId: null, responseResolver: null });
  const strikeCountRef = useRef(0);

  // WEBSOCKET
  const wsUrl = sessionId && userId
    ? `${import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000"}/ws/engagement/${sessionId}/${userId}`
    : null;

  async function triggerAutoNudge(avgScore) {
    if (pendingAutoRef.current.pending) return;

    pendingAutoRef.current.pending = true;
    console.log("[EngagementTracker] Auto-nudge triggered (avg)", avgScore);

    const response = await new Promise((resolve) => {
      pendingAutoRef.current.responseResolver = resolve;
      pendingAutoRef.current.timeoutId = setTimeout(() => {
        resolve({ type: "no_response" });
      }, RESPONSE_WAIT_MS);
      setAutoNudgeVisible(true);
    });

    setAutoNudgeVisible(false);
    if (pendingAutoRef.current.timeoutId) {
      clearTimeout(pendingAutoRef.current.timeoutId);
      pendingAutoRef.current.timeoutId = null;
    }
    pendingAutoRef.current.pending = false;
    pendingAutoRef.current.responseResolver = null;

    if (response && response.type === "yes") {
      strikeCountRef.current += 1;  
      const strikes = strikeCountRef.current;

      send({
        type: "auto_nudge_response",
        session_id: sessionId,
        user_id: userId,
        response: "yes",
        timestamp: new Date().toISOString(),
        strike_count: strikes,
        score: Number(engagementState.smoothScore || 0),
      });

      scoreBufferRef.current = [];

      if (strikes >= MAX_STRIKES) {
        send({
          type: "auto_disengaged_strike",
          session_id: sessionId,
          user_id: userId,
          timestamp: new Date().toISOString(),
          strike_count: strikes,
          message: "Repeated disengagement",
          score: Number(engagementState.smoothScore || 0),
        });
      }

      return;
    }

    strikeCountRef.current += 1;
    const strikes = strikeCountRef.current;

    send({
      type: "auto_disengaged",
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      strike_count: strikes,
      avg_score: avgScore,
      score: Number(engagementState.smoothScore || 0)
    });
    scoreBufferRef.current = [];

    if (strikes >= MAX_STRIKES) {
      send({
        type: "auto_disengaged_strike",
        session_id: sessionId,
        user_id: userId,
        timestamp: new Date().toISOString(),
        strike_count: strikes,
        message: "Repeated disengagement",
        score: Number(engagementState.smoothScore || 0)
      });
      scoreBufferRef.current = [];
    }
  }

  const handleMessage = (message) => {
    console.log("[EngagementTracker] Received WebSocket message:", message);
    if (message.type === "nudge") {
      const avg = engagementState?.smoothScore || 0;
      triggerAutoNudge(avg);
    }
    if (message.type === "session_mode") {
      setSessionMode(message.mode || "normal");
    }
    if (message.type === "liveness_challenge") {
      const ch = {
        action_id: message.action_id,
        action_label: message.action_label,
        expires_at: message.expires_at,
      };
      setLivenessChallenge(ch);
      livenessChallengeRef.current = ch;
    }
    if (message.type === "teacher_action") {
      if (message.action === "mark_engaged") {
        strikeCountRef.current = 0;
        scoreBufferRef.current = [];
        if (typeof send === "function") {
          send({
            type: "mark_engaged_ack",
            session_id: sessionId,
            user_id: userId,
            timestamp: new Date().toISOString(),
          });
        }
      }
      if (message.action === "message" && message.message_text && onNudge) {
        onNudge({ nudge_type: "message", message_text: message.message_text });
      }
    }
  };

  const { connected, send } = useWebSocket(wsUrl || "", handleMessage);

  // Anti-tab-switching: visibility listener when Strict Mode
  useEffect(() => {
    if (sessionMode !== "strict") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (typeof send === "function") {
          send({
            type: "anti_cheat_violation",
            session_id: sessionId,
            user_id: userId,
            violation_type: "tab_switch",
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        setTabSwitchPopup(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [sessionMode, sessionId, userId, send]);

  // Send immediate identity update whenever identityStatus changes
  useEffect(() => {
    if (!connected || typeof send !== "function") return;
    try {
      send({
        type: "identity_update",
        session_id: sessionId,
        user_id: userId,
        identity_status: identityState.status || identityStatus || "checking",
        identity_mismatch_count: identityState.mismatchCount || 0,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to send identity_update on status change:", err);
    }
  }, [identityStatus, connected, send]);

  // SEND METRICS
  useEffect(() => {
    
    if (!sessionId || !userId || !wsUrl) return;
    

    const interval = setInterval(() => {
        if (connected && engagementState && engagementState.smoothScore !== undefined) {
        const metrics = currentMetricsRef.current;
        send({
          type: "metrics",
          session_id: sessionId,
          user_id: userId,
          score: Number(engagementState.smoothScore || 0),
          timestamp: new Date().toISOString(),
          gaze_direction: metrics?.gazeDirection || "center",
          ear: metrics?.ear || 0,
          head_pose: metrics?.headPose || { yaw: 0, pitch: 0 },
          presence: metrics?.presence || "unknown",
          // Use authoritative identityState values to avoid stale metrics
          identity_status: identityState.status || "checking",
          identity_mismatch_count: identityState.mismatchCount || 0
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [connected, send, sessionId, userId, wsUrl]);

  // PERIODIC LOW ENGAGEMENT CHECK
  useEffect(() => {
    if (!sessionId || !userId) return;
    let checkInterval = null;

    function computeAverageLastWindow() {
      const now = Date.now();
      const buffer = scoreBufferRef.current;

      while (buffer.length && buffer[0].ts < now - WINDOW_MS) buffer.shift();
      if (buffer.length === 0) return 1;
      const avg = buffer.reduce((s, it) => s + it.score, 0) / buffer.length;
      return avg;
    }

    (async () => {
      const avg = computeAverageLastWindow();
      if (avg < AUTO_THRESHOLD) triggerAutoNudge(avg);
    })();

    checkInterval = setInterval(() => {
      const avg = computeAverageLastWindow();
      if (avg < AUTO_THRESHOLD) {
        triggerAutoNudge(avg);
      }
    }, CHECK_INTERVAL);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [sessionId, userId, send]);

  const [autoNudgeVisible, setAutoNudgeVisible] = useState(false);

  function handleAutoNudgeYes() {
    if (pendingAutoRef.current && pendingAutoRef.current.responseResolver) {
      pendingAutoRef.current.responseResolver({ type: "yes" });
    }
  }

  // SELECT NEAREST FACE (largest bounding box)
  function selectNearestFace(faceLandmarks) {
    if (!faceLandmarks || faceLandmarks.length === 0) return null;
    if (faceLandmarks.length === 1) return faceLandmarks[0];

    let largestArea = 0;
    let nearestFace = null;

    faceLandmarks.forEach(lm => {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      lm.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });

      const area = (maxX - minX) * (maxY - minY);
      if (area > largestArea) {
        largestArea = area;
        nearestFace = lm;
      }
    });

    return nearestFace;
  }

  // MAIN DETECT LOOP
  useEffect(() => {
    let stream = null;
    let loop = null;
    let faceLandmarker;
    let isMounted = true;

    async function init() {
      if (!isMounted) return;
      const vision = await import("@mediapipe/tasks-vision");
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.4/wasm"
      );

      faceLandmarker = await vision.FaceLandmarker.createFromOptions(
        filesetResolver,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-assets/face_landmarker_v2.task",
          },
          runningMode: "video",
          numFaces: 5,
        }
      );

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 720, height: 540 },
        audio: false,
      });

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      detect();
    }

    function detect() {
      if (!isMounted || !videoRef.current || !canvasRef.current) return;

      const results = faceLandmarker.detectForVideo(
        videoRef.current,
        performance.now()
      );

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
        presenceState.status = "no_face";
        engagementState.smoothScore = 0;
        scoreBufferRef.current.push({ ts: Date.now(), score: 0 });

        currentMetricsRef.current = {
          ...currentMetricsRef.current,
          presence: "no_face",
          ear: 0,
          headPose: { yaw: 0, pitch: 0 }
        };

        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(8, 8, 520, 300);
        ctx.fillStyle = "white";
        ctx.font = "28px system-ui, -apple-system, sans-serif";
        ctx.fillText(`Presence: no_face`, 28, 56);
        ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
        ctx.fillText(
          `Score: ${Math.round((engagementState.smoothScore || 0) * 100)}%`,
          28, 110
        );

        if (isMounted) loop = requestAnimationFrame(detect);
        return;
      }

      const lm = selectNearestFace(results.faceLandmarks);

      if (!lm || lm.length === 0) {
        presenceState.status = "no_face";
        engagementState.smoothScore = 0;
        scoreBufferRef.current.push({ ts: Date.now(), score: 0 });

        currentMetricsRef.current = {
          ...currentMetricsRef.current,
          presence: "no_face",
          ear: 0,
          headPose: { yaw: 0, pitch: 0 }
        };

        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(8, 8, 520, 300);
        ctx.fillStyle = "white";
        ctx.font = "28px system-ui, -apple-system, sans-serif";
        ctx.fillText(`Presence: no_face`, 28, 56);
        ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
        ctx.fillText(
          `Score: ${Math.round((engagementState.smoothScore || 0) * 100)}%`,
          28, 110
        );

        if (isMounted) loop = requestAnimationFrame(detect);
        return;
      }

      const pres = checkPresence(lm);

      if (pres.status === "no_face") {
        identityState.status = "checking";
        setIdentityStatus("checking");
        // ensure metrics reflect current identity status even when face missing
        currentMetricsRef.current.identityStatus = identityState.status;
      }
      const leftEAR = computeEAR(lm, leftEyeIdx);
      const rightEAR = computeEAR(lm, rightEyeIdx);
      const EAR = (leftEAR + rightEAR) / 2;

      blinkData.smoothEAR = EAR * 0.8 + blinkData.smoothEAR * 0.2;
      const smooth = blinkData.smoothEAR;
      const now = performance.now();

      if (smooth > OPEN_THRESHOLD) {
        blinkData.status = "eyes_open";
        blinkData.blinkStart = null;
        blinkData.closedStart = null;
        blinkData.smoothEAR = smooth;
      } else if (smooth < BLINK_THRESHOLD && smooth > CLOSED_THRESHOLD) {
        if (!blinkData.blinkStart) blinkData.blinkStart = now;
        if (now - blinkData.blinkStart < 250) blinkData.status = "blink";
      } else if (smooth <= CLOSED_THRESHOLD) {
        if (!blinkData.closedStart) blinkData.closedStart = now;
        const duration = now - blinkData.closedStart;
        if (duration > 1000) blinkData.status = "closed_long";
        else if (duration > 400) blinkData.status = "microsleep";
        else blinkData.status = "closed_brief";
      }

      let gaze, pose;
      try {
        gaze = gazeDirection(lm);
        pose = estimateHeadPose(lm);
      } catch (error) {
        console.error("Error computing gaze/pose:", error);
        presenceState.status = "no_face";
        scoreBufferRef.current.push({ ts: Date.now(), score: 0 });
        if (isMounted) loop = requestAnimationFrame(detect);
        return;
      }

      // VERIFY IDENTITY - low-frequency checks during class (2-5 min interval)
      verifyIdentity(lm);

      // Multi-face detection: flag when more than one face visible
      if (results.faceLandmarks.length > 1 && typeof send === "function") {
        const now = Date.now();
        if (!identityState.multiFaceLastSent || now - identityState.multiFaceLastSent > 30000) {
          identityState.multiFaceLastSent = now;
          send({
            type: "multi_face_detected",
            session_id: sessionId,
            user_id: userId,
            face_count: results.faceLandmarks.length,
            timestamp: new Date().toISOString()
          });
        }
      }

      const raw =
        scoreFromPresence(pres) * 0.3 +
        scoreFromGaze(gaze) * 0.25 +
        scoreFromHeadPose(pose) * 0.2 +
        scoreFromEye(blinkData.status) * 0.15 +
        scoreFromIdentity(identityState.status) * 0.1;

      if (engagementState && engagementState.smoothScore !== undefined) {
        engagementState.smoothScore =
          engagementState.smoothScore * 0.85 + raw * 0.15;
      } else {
        engagementState.smoothScore = raw;
      }

      scoreBufferRef.current.push({
        ts: Date.now(),
        score: Number(engagementState.smoothScore || 0)
      });
      
      if (gaze && pose && pres) {
        currentMetricsRef.current = {
          gazeDirection: gaze.direction || "center",
          ear: smooth || 0,
          headPose: { yaw: pose.yaw || 0, pitch: pose.pitch || 0 },
          presence: pres.status || "unknown",
          identityStatus: identityState.status || "checking"
        };
      }

      // LIVENESS VERIFICATION
      const ch = livenessChallengeRef.current;
      if (ch && typeof send === "function") {
        const now = Date.now();
        if (now > ch.expires_at) {
          send({
            type: "liveness_fail",
            session_id: sessionId,
            user_id: userId,
            action_id: ch.action_id,
            reason: "timeout",
            timestamp: new Date().toISOString(),
          });
          livenessChallengeRef.current = null;
          setLivenessChallenge(null);
        } else {
          const yaw = pose?.yaw ?? 0;
          const pitch = pose?.pitch ?? 0;
          const smiling = checkSmile(lm);
          let passed = false;
          if (ch.action_id === "turn_head_left" && yaw < -0.15) passed = true;
          else if (ch.action_id === "turn_head_right" && yaw > 0.15) passed = true;
          else if (ch.action_id === "turn_head_up" && pitch < -0.08) passed = true;
          else if (ch.action_id === "turn_head_down" && pitch > 0.08) passed = true;
          else if (ch.action_id === "smile" && smiling) passed = true;
          else if (ch.action_id === "look_right_smile" && yaw > 0.15 && smiling) passed = true;
          else if (ch.action_id === "look_left_smile" && yaw < -0.15 && smiling) passed = true;
          if (passed) {
            send({
              type: "liveness_pass",
              session_id: sessionId,
              user_id: userId,
              action_id: ch.action_id,
              timestamp: new Date().toISOString(),
            });
            livenessChallengeRef.current = null;
            setLivenessChallenge(null);
          }
        }
      }

      // OVERLAY
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(8, 8, 540, 310);
      ctx.fillStyle = "white";
      ctx.font = "28px system-ui, -apple-system, sans-serif";
      
      ctx.fillText(`Presence: ${pres.status}`, 28, 56);
      ctx.fillText(
        `Gaze: ${gaze.direction} (H:${gaze.horizontal.toFixed(2)})`,
        28, 100
      );
      ctx.fillText(
        `Head: yaw ${pose.yaw.toFixed(2)}`, 
        28, 144
      );
      ctx.fillText(
        `Eye: ${blinkData.status}`, 
        28, 188
      );
      
      // Score
      ctx.font = "bold 36px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = engagementState.smoothScore > 0.7 ? "#10b981" : 
                      engagementState.smoothScore > 0.4 ? "#f59e0b" : "#ef4444";
      ctx.fillText(
        `Score: ${Math.round(engagementState.smoothScore * 100)}%`,
        28, 290
      );

      if (isMounted) loop = requestAnimationFrame(detect);
    }

    init();

    return () => {
      isMounted = false;
      cancelAnimationFrame(loop);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Live Tracking</h3>
        {wsUrl && (
          <div className="px-3 py-1 rounded-lg text-sm font-medium">
            {connected ? (
              <span className="text-green-600 bg-green-100 px-3 py-1.5 rounded-lg">🟢 Connected</span>
            ) : (
              <span className="text-red-600 bg-red-100 px-3 py-1.5 rounded-lg">🔴 Disconnected</span>
            )}
          </div>
        )}
      </div>

      {/* Identity Status Alert */}
      {identityStatus === "mismatch" && identityState.mismatchCount >= 2 && (
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-bold text-red-900">Identity Mismatch Detected</div>
              <div className="text-sm text-red-700">
                The person in frame does not match the enrolled identity.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "4/3" }}>
        <video ref={videoRef} style={{ display: "none" }} />
        <canvas ref={cropCanvasRef} width={112} height={112} style={{ display: "none" }} />
        <canvas
          ref={canvasRef}
          width={720}
          height={540}
          className="w-full h-full object-contain"
          style={{ position: "absolute", top: 0, left: 0 }}
        />
      </div>

      {/* AUTO-NUDGE MODAL */}
      {autoNudgeVisible && (
        <div style={{
          position: "fixed", left: 0, right: 0, top: 0, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", zIndex: 9999
        }}>
          <div style={{ background: "white", padding: 24, borderRadius: 12, width: 360, textAlign: "center" }}>
            <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 600 }}>You appear disengaged.</h3>
            <p style={{ marginBottom: 20, color: "#444", fontSize: 15 }}>Tap "I'm Here" if you're paying attention.</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button onClick={handleAutoNudgeYes} style={{ padding: "10px 20px", background: "#10b981", color: "white", borderRadius: 8, fontSize: 15, fontWeight: 600 }}>YES</button>
            </div>
          </div>
        </div>
      )}

      {/* LIVENESS CHALLENGE */}
      {livenessChallenge && (
        <div style={{
          position: "fixed", left: 0, right: 0, top: 0, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", zIndex: 9998
        }}>
          <div style={{ background: "white", padding: 28, borderRadius: 12, width: 380, textAlign: "center" }}>
            <h3 style={{ marginBottom: 12, fontSize: 22, fontWeight: 600 }}>Check Engagement</h3>
            <p style={{ marginBottom: 16, color: "#333", fontSize: 18, fontWeight: 500 }}>
              {livenessChallenge.action_label}
            </p>
            <p style={{ color: "#666", fontSize: 14 }}>
              {Math.max(0, Math.ceil((livenessChallenge.expires_at - Date.now()) / 1000))}s remaining
            </p>
          </div>
        </div>
      )}

      {/* TAB SWITCH WARNING (Strict Mode) */}
      {tabSwitchPopup && (
        <div style={{
          position: "fixed", left: 0, right: 0, top: 0, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", zIndex: 9999
        }}>
          <div style={{ background: "white", padding: 24, borderRadius: 12, width: 360, textAlign: "center" }}>
            <h3 style={{ marginBottom: 12, fontSize: 20, fontWeight: 600 }}>Return to class (Strict Mode)</h3>
            <p style={{ marginBottom: 20, color: "#444", fontSize: 15 }}>Please keep the class window active and visible.</p>
            <button
              onClick={() => setTabSwitchPopup(false)}
              style={{ padding: "10px 24px", background: "#3b82f6", color: "white", borderRadius: 8, fontSize: 15, fontWeight: 600 }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EngagementTracker;

