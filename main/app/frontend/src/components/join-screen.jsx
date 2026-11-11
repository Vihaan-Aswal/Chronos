// src/components/JoinScreen.jsx
//
// Camera + face + identity check. The detection and verification logic is
// unchanged; the presentation and the failure states are in-product now.

import { useEffect, useRef, useState } from "react";
import { loadEmbedder, getEmbedding } from "../utils/embedder";
import { fetchIdentity, registerIdentity } from "../api/identity";
import {
  AlertIcon,
  CameraOffIcon,
  CheckIcon,
  SearchIcon,
  ShieldIcon,
} from "./app/icons.jsx";

function JoinScreen({ user, onJoin, role = "student" }) {
  const videoRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const lightCanvasRef = useRef(null);
  const pendingEmbeddingRef = useRef(null);

  const [facePresent, setFacePresent] = useState(false);
  const [isCentered, setIsCentered] = useState(false);
  const [lightStatus, setLightStatus] = useState("unknown");
  const [ready, setReady] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [engineError, setEngineError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const userId = user?.id || user?.user_id || "unknown-user";
  const cameraOff = Boolean(mediaError);
  const engineOff = Boolean(engineError);

  useEffect(() => {
    let stream;
    let faceLandmarker;
    let animationFrameId;
    let cancelled = false;

    (async () => {
      try {
        await loadEmbedder();
      } catch (err) {
        console.error("Failed to load embedder:", err);
      }
    })();

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (err) {
        console.error("camera error:", err);
        if (!cancelled) {
          setMediaError(
            "Camera access is blocked. Allow the camera in your browser, then retry the check.",
          );
        }
        return;
      }

      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { FilesetResolver, FaceLandmarker } = vision;

        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.4/wasm",
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-assets/face_landmarker_v2.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });

        detect();
      } catch (err) {
        console.error("face model error:", err);
        if (!cancelled) {
          setEngineError(
            "The face check could not start. Reload the page and try again.",
          );
        }
      }
    }

    function detect() {
      const video = videoRef.current;
      if (!video) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }

      let light = "good";

      try {
        const L = lightCanvasRef.current.getContext("2d", {
          willReadFrequently: true,
        });
        L.drawImage(video, 0, 0, 300, 220);
        const frame = L.getImageData(0, 0, 300, 220);

        let total = 0;
        for (let i = 0; i < frame.data.length; i += 4) {
          total += (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
        }

        const brightness = total / (frame.data.length / 4);
        if (brightness < 60) light = "too_dark";
        if (brightness > 180) light = "too_bright";
        setLightStatus(light);
      } catch {
        // Brightness read can fail briefly before the camera stream is ready.
      }

      try {
        const result = faceLandmarker.detectForVideo(
          video,
          performance.now(),
        );
        const faces = result.faceLandmarks;
        const hasFace = faces && faces.length > 0;

        setFacePresent(hasFace);

        if (!hasFace) {
          setIsCentered(false);
          setReady(false);
          animationFrameId = requestAnimationFrame(detect);
          return;
        }

        const lm = faces[0];

        let minX = 1,
          maxX = 0,
          minY = 1,
          maxY = 0;
        lm.forEach((p) => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });

        const centered =
          Math.abs((minX + maxX) / 2 - 0.5) < 0.15 &&
          Math.abs((minY + maxY) / 2 - 0.5) < 0.15;

        setIsCentered(centered);

        const ok = hasFace && centered && light === "good";
        setReady(ok);

        const C = cropCanvasRef.current.getContext("2d");
        const sx = Math.max(0, Math.floor(minX * video.videoWidth));
        const sy = Math.max(0, Math.floor(minY * video.videoHeight));
        const sw = Math.max(0, Math.floor((maxX - minX) * video.videoWidth));
        const sh = Math.max(0, Math.floor((maxY - minY) * video.videoHeight));

        if (sw > 20 && sh > 20) {
          C.clearRect(0, 0, 112, 112);
          C.drawImage(video, sx, sy, sw, sh, 0, 0, 112, 112);
        }
      } catch (err) {
        console.error("detect error:", err);
      }

      animationFrameId = requestAnimationFrame(detect);
    }

    init();

    return () => {
      cancelled = true;
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // Track stop may throw on already-ended streams; safe to ignore.
        }
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

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

  function flag(title, message) {
    setResult({ tone: "flag", title, message });
  }

  async function handleJoin() {
    if (loading) return;

    if (userId === "unknown-user") {
      flag(
        "Session not found",
        "Sign out, sign back in, and try the check again.",
      );
      return;
    }

    const canvas = cropCanvasRef.current;
    if (!canvas) {
      flag("The check could not run", "Reload the page and try again.");
      return;
    }
    if (!facePresent) {
      flag("No face in frame", "Sit in front of the camera and try again.");
      return;
    }
    if (!isCentered) {
      flag("Move to the centre", "Keep your whole face inside the guide.");
      return;
    }
    if (lightStatus !== "good") {
      flag(
        "Adjust the light",
        "Even light on your face makes the check reliable.",
      );
      return;
    }

    setLoading(true);
    setResult(null);

    let emb;
    try {
      emb = await getEmbedding(canvas);
    } catch (err) {
      console.error("getEmbedding error:", err);
      setLoading(false);
      flag(
        "The face reading failed",
        "Adjust the light or your position, then try again.",
      );
      return;
    }

    if (!emb || !emb.length) {
      setLoading(false);
      flag("No face reading", "Center your face and try again.");
      return;
    }

    const arr = Array.from(emb).map((v) => Number(v));
    if (arr.some((v) => !isFinite(v))) {
      setLoading(false);
      flag("The face reading was unclear", "Adjust your face and try again.");
      return;
    }
    if (arr.length !== 128) {
      console.warn("Unexpected embedding length:", arr.length);
    }

    const normalizedEmb = normalize(arr);
    pendingEmbeddingRef.current = normalizedEmb;

    let info;
    try {
      info = await fetchIdentity(userId);
    } catch (err) {
      console.error("fetchIdentity error:", err);
      info = { exists: false, error: err.message };
    }

    if (!info || !info.exists) {
      const r = await registerIdentity(userId, normalizedEmb);
      setLoading(false);
      if (r && r.status === "success") {
        onJoin?.();
        return;
      }
      flag(
        "The face could not be registered",
        r?.message || info?.error || "Check the connection and try again.",
      );
      return;
    }

    const stored = info.embedding || [];
    if (!stored || !stored.length) {
      const r = await registerIdentity(userId, normalizedEmb);
      setLoading(false);
      if (r && r.status === "success") {
        onJoin?.();
        return;
      }
      flag(
        "The face could not be registered",
        r?.message || "Check the connection and try again.",
      );
      return;
    }

    const storedNorm = normalize(Array.from(stored));
    const dist = l2Distance(normalizedEmb, storedNorm);

    const verifyThreshold = 0.55;
    const uncertainThreshold = 0.65;

    if (dist < verifyThreshold) {
      setLoading(false);
      onJoin?.();
      return;
    }

    if (dist < uncertainThreshold) {
      setLoading(false);
      setResult({
        tone: "warn",
        kind: "uncertain",
        title: "The check is uncertain",
        message:
          "Lighting or angle can cause this. Try again, or re-register this face for the account.",
      });
      return;
    }

    setLoading(false);
    flag(
      "This face does not match",
      "Check that you are signed in with the account this face was enrolled with, then try again.",
    );
  }

  async function handleReregister() {
    const emb = pendingEmbeddingRef.current;
    if (!emb) {
      flag("Try the check again", "The face reading was not kept.");
      return;
    }
    setLoading(true);
    const r = await registerIdentity(userId, emb);
    setLoading(false);
    if (r && r.status === "success") {
      onJoin?.();
      return;
    }
    flag(
      "The face could not be re-registered",
      r?.message || "Try again with even light and a centred face.",
    );
  }

  const faceCheck = cameraOff
    ? {
        ok: false,
        state: "Camera off",
        fix: "Allow camera access in your browser.",
      }
    : facePresent
      ? { ok: true, state: "Ready", fix: "A face is in frame." }
      : {
          ok: false,
          state: "Waiting",
          fix: "Sit in front of the camera.",
        };

  const centerCheck = !facePresent
    ? {
        ok: false,
        state: "Waiting",
        fix: "Centred once a face is found.",
      }
    : isCentered
      ? { ok: true, state: "Ready", fix: "Your face is centred." }
      : {
          ok: false,
          state: "Off-centre",
          fix: "Move to the middle of the frame.",
        };

  const lightCheck =
    lightStatus === "good"
      ? { ok: true, state: "Good", fix: "Even light on your face." }
      : lightStatus === "too_dark"
        ? {
            ok: false,
            state: "Too dark",
            fix: "Face a light or move nearer a lamp.",
          }
        : lightStatus === "too_bright"
          ? {
              ok: false,
              state: "Too bright",
              fix: "Move away from a bright window or lamp.",
            }
          : {
              ok: false,
              state: "Checking",
              fix: "Reading the light in the frame.",
            };

  const canJoin = ready && !loading && !cameraOff && !engineOff;

  const reason = cameraOff
    ? "The camera is off. Allow access, then retry the check."
    : engineOff
      ? "The face check is not running. Reload to try again."
      : !facePresent
        ? "Sit in front of the camera to begin."
        : !isCentered
          ? "Move your face to the middle of the frame."
          : lightStatus !== "good"
            ? "Adjust the light on your face."
            : "The check reads your face once for identity. Nothing is recorded.";

  return (
    <div className="ready-grid">
      <div className="ready-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="ready-video"
          aria-label="Camera preview"
        />

        {!cameraOff && !engineOff && (
          <div className="ready-guide" aria-hidden="true">
            <span />
          </div>
        )}

        {(cameraOff || engineOff) && (
          <div className="ready-error" role="alert">
            <div className="ready-error-inner">
              <CameraOffIcon />
              <h3>{cameraOff ? "The camera is off" : "The check did not start"}</h3>
              <p>{mediaError || engineError}</p>
              <button
                type="button"
                className="btn btn-cream"
                onClick={() => window.location.reload()}
              >
                Retry check
              </button>
            </div>
          </div>
        )}

        <div className="ready-stage-foot">
          <span className={facePresent ? "" : "is-wait"}>
            <i aria-hidden="true" />
            {facePresent ? "Face in frame" : "Looking for a face"}
          </span>
          <span className={lightStatus === "good" ? "" : "is-wait"}>
            <i aria-hidden="true" />
            {lightStatus === "good"
              ? "Lighting good"
              : lightStatus === "too_dark"
                ? "Too dark"
                : lightStatus === "too_bright"
                  ? "Too bright"
                  : "Reading light"}
          </span>
        </div>

        <canvas
          ref={lightCanvasRef}
          width={300}
          height={220}
          style={{ display: "none" }}
        />
        <canvas
          ref={cropCanvasRef}
          width={112}
          height={112}
          style={{ display: "none" }}
        />
      </div>

      <div className="ready-panel">
        <div className="ready-panel-head">
          <h2 className="panel-title">Readiness</h2>
          <p className="meta">Three checks. Nothing is recorded.</p>
        </div>

        <ul className="ready-checks">
          <li className={`ready-check ${faceCheck.ok ? "is-ok" : "is-bad"}`}>
            <span className="ready-check-icon" aria-hidden="true">
              {faceCheck.ok ? <CheckIcon /> : <SearchIcon />}
            </span>
            <div>
              <p className="ready-check-label">Face in frame</p>
              <p className="ready-check-fix">{faceCheck.fix}</p>
            </div>
            <span className="ready-check-state">{faceCheck.state}</span>
          </li>

          <li className={`ready-check ${centerCheck.ok ? "is-ok" : "is-bad"}`}>
            <span className="ready-check-icon" aria-hidden="true">
              {centerCheck.ok ? <CheckIcon /> : <SearchIcon />}
            </span>
            <div>
              <p className="ready-check-label">Face centred</p>
              <p className="ready-check-fix">{centerCheck.fix}</p>
            </div>
            <span className="ready-check-state">{centerCheck.state}</span>
          </li>

          <li className={`ready-check ${lightCheck.ok ? "is-ok" : "is-bad"}`}>
            <span className="ready-check-icon" aria-hidden="true">
              {lightCheck.ok ? <CheckIcon /> : <AlertIcon />}
            </span>
            <div>
              <p className="ready-check-label">Lighting</p>
              <p className="ready-check-fix">{lightCheck.fix}</p>
            </div>
            <span className="ready-check-state">{lightCheck.state}</span>
          </li>
        </ul>

        {result && (
          <div
            className={`notice ${result.tone === "warn" ? "notice-quiet" : "notice-flag"} ready-result`}
            role={result.tone === "flag" ? "alert" : "status"}
          >
            <AlertIcon />
            <div>
              <p className="ready-result-title">{result.title}</p>
              <p>{result.message}</p>
              <div className="ready-result-actions">
                <button
                  type="button"
                  className="btn btn-line"
                  onClick={() => setResult(null)}
                >
                  Try again
                </button>
                {result.kind === "uncertain" && (
                  <button
                    type="button"
                    className="btn btn-ink"
                    onClick={handleReregister}
                    disabled={loading}
                  >
                    Re-register this face
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="ready-actions">
          <button
            type="button"
            className="btn btn-ink btn-lg btn-block"
            disabled={!canJoin}
            onClick={handleJoin}
          >
            {loading
              ? "Checking your identity"
              : ready
                ? `Verify and join as ${role}`
                : "Adjust your position"}
          </button>
          <p className="ready-reason">{reason}</p>
          <button
            type="button"
            className="text-btn"
            onClick={() => window.location.reload()}
          >
            Retry check
          </button>
        </div>

        <div className="ready-note">
          <ShieldIcon />
          <p>
            A face embedding is kept to verify you. The video is not. No audio
            or page content is stored.
          </p>
        </div>
      </div>
    </div>
  );
}

export default JoinScreen;
