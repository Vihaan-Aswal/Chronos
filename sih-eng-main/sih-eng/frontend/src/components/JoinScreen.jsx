// src/components/JoinScreen.jsx

import { useEffect, useRef, useState } from "react";
import { loadEmbedder, getEmbedding } from "../utils/embedder";
import { fetchIdentity, registerIdentity } from "../api/identity";

function JoinScreen({ user, onJoin }) {
  const videoRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const lightCanvasRef = useRef(null);

  const [facePresent, setFacePresent] = useState(false);
  const [isCentered, setIsCentered] = useState(false);
  const [lightStatus, setLightStatus] = useState("unknown");
  const [ready, setReady] = useState(false);

  const userId = user?.id || user?.user_id || "unknown-user";

  useEffect(() => {
    let stream;
    let faceLandmarker;
    let animationFrameId;

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
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const vision = await import("@mediapipe/tasks-vision");
        const FilesetResolver = vision.FilesetResolver;
        const FaceLandmarker = vision.FaceLandmarker;

        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.4/wasm"
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
        console.error("init error:", err);
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
        const L = lightCanvasRef.current.getContext("2d", { willReadFrequently: true });
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
      } catch (err) {}

      try {
        const result = faceLandmarker.detectForVideo(video, performance.now());
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

        let minX = 1, maxX = 0, minY = 1, maxY = 0;
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
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch (e) {}
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

  async function handleJoin() {
    if (userId === "unknown-user") {
      return alert("User session not found or invalid. Please sign out and sign back in.");
    }

    const canvas = cropCanvasRef.current;
    if (!canvas) return alert("Internal error: crop canvas missing");
    if (!facePresent) return alert("Please ensure your face is visible in the camera");
    if (!isCentered) return alert("Please center your face in the frame");
    if (lightStatus !== "good") return alert("Please adjust lighting conditions before joining");

    let emb;
    try {
      emb = await getEmbedding(canvas);
    } catch (err) {
      console.error("getEmbedding error:", err);
      return alert("Face embedding failed. Try adjusting position or lighting.");
    }

    if (!emb || !emb.length) return alert("Face not detected properly. Try again.");

    const arr = Array.from(emb).map((v) => Number(v));
    if (arr.some((v) => !isFinite(v))) return alert("Bad face embedding. Adjust your face and try again.");
    if (arr.length !== 128) console.warn("Unexpected embedding length:", arr.length);

    const normalizedEmb = normalize(arr);

    let info;
    try {
      info = await fetchIdentity(userId);
    } catch (err) {
      console.error("fetchIdentity error:", err);
      info = { exists: false, error: err.message };
    }

    if (!info || !info.exists) {
      const r = await registerIdentity(userId, normalizedEmb);
      if (r && r.status === "success") {
        alert("Face registered successfully! Welcome!");
        return onJoin?.();
      }
      alert(`Failed to register identity: ${r?.message || info?.error || "Unknown server error"}.`);
      return;
    }

    const stored = info.embedding || [];
    if (!stored || !stored.length) {
      const r = await registerIdentity(userId, normalizedEmb);
      if (r && r.status === "success") {
        alert("Face registered! You may join now.");
        return onJoin?.();
      }
      alert(`Failed to register identity: ${r?.message || "Unknown error"}.`);
      return;
    }

    const storedNorm = normalize(Array.from(stored));
    const dist = l2Distance(normalizedEmb, storedNorm);

    const verifyThreshold = 0.55;
    const uncertainThreshold = 0.65;

    if (dist < verifyThreshold) {
      alert("Identity verified! Welcome back!");
      return onJoin?.();
    } else if (dist < uncertainThreshold) {
      const retry = confirm(
        `Face verification uncertain. This might be due to lighting or angle. Try again?`
      );
      if (retry) return;

      const override = confirm(
        "Would you like to re-register your face? This will replace your stored identity."
      );
      if (override) {
        const r = await registerIdentity(userId, normalizedEmb);
        if (r && r.status === "success") {
          alert("Face re-registered successfully!");
          return onJoin?.();
        }
      }
      return;
    } else {
      alert(
        `Face verification failed! The face doesn't match the registered identity. Please ensure you're using the correct account.`
      );
      return;
    }
  }

  const roleLabel =
    user?.role === "teacher"
      ? "Verify & Join as Teacher"
      : "Verify & Join Meeting";

  const StatusRow = ({ label, ok }) => (
    <div className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 ${
      ok ? "bg-emerald-500/10 border-emerald-400/30" : "bg-amber-500/10 border-amber-400/30"
    }`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className={`flex items-center gap-2 text-sm font-semibold ${
        ok ? "text-emerald-600" : "text-amber-600"
      }`}>
        {ok ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Yes
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            No
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-8 max-w-md w-full ring-1 ring-slate-900/5">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Identity Verification</h2>
          <p className="text-sm text-slate-600">Position your face in the center and ensure good lighting</p>
        </div>

        <div className="relative mb-6 rounded-xl overflow-hidden border-2 border-slate-200 shadow-inner">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full bg-slate-900"
            style={{ aspectRatio: "4/3" }}
          />
          <canvas ref={lightCanvasRef} width={300} height={220} style={{ display: "none" }} />
          <canvas ref={cropCanvasRef} width={112} height={112} style={{ display: "none" }} />
        </div>

        <div className="space-y-3 mb-6">
          <StatusRow label="Face Detected" ok={facePresent} />
          <StatusRow label="Face Centered" ok={isCentered} />
          <div className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 ${
            lightStatus === "good" ? "bg-emerald-500/10 border-emerald-400/30" : "bg-amber-500/10 border-amber-400/30"
          }`}>
            <span className="text-sm font-medium text-slate-700">Lighting</span>
            <span className={`text-sm font-semibold ${
              lightStatus === "good" ? "text-emerald-600" :
              lightStatus === "too_dark" ? "text-amber-600" : "text-red-600"
            }`}>
              {lightStatus === "good" ? "Good" :
               lightStatus === "too_dark" ? "Too Dark" : "Too Bright"}
            </span>
          </div>
        </div>

        <button
          disabled={!ready}
          onClick={handleJoin}
          className={`w-full py-3.5 px-6 rounded-xl font-semibold text-white transition-all duration-200 ${
            ready
              ? "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:scale-[1.02]"
              : "bg-slate-300 cursor-not-allowed"
          }`}
        >
          {ready ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {roleLabel}
            </span>
          ) : (
            "Please adjust your position"
          )}
        </button>
      </div>
    </div>
  );
}

export default JoinScreen;
