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

  const StatusRow = ({ label, ok, statusText }) => (
    <div className="flex items-center justify-between py-5 border-b border-surface-container-high/60 last:border-0">
      <div className="flex items-center gap-4">
        <span 
          className={`material-symbols-outlined text-2xl ${ok ? "text-primary" : "text-secondary/30"}`}
          style={{ fontVariationSettings: `'FILL' ${ok ? 1 : 0}` }}
        >
          check_circle
        </span>
        <span className="font-body text-base font-medium text-primary">{label}</span>
      </div>
      <span 
        className={`font-label text-[0.7rem] uppercase tracking-[0.2em] font-bold ${
          ok ? "text-primary" : "text-secondary/60"
        }`}
      >
        {statusText}
      </span>
    </div>
  );

  return (
    <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-8 md:gap-12 items-start">
      {/* ── 1. Large Camera Preview Section ──────────────────────────────── */}
      <div className="relative w-full aspect-video bg-surface-container-high rounded-2xl overflow-hidden shadow-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover grayscale-[10%] brightness-95"
          style={{ backgroundColor: "#0F1E2B" }}
        />
        
        {/* Face Guide Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div 
            className="w-1/4 aspect-[3/4] opacity-50"
            style={{ 
              border: "2px dashed rgba(220, 196, 146, 0.4)",
              borderRadius: "50% / 60% 60% 40% 40%" 
            }}
          />
        </div>

        {/* Hidden canvases for logic */}
        <canvas ref={lightCanvasRef} width={300} height={220} style={{ display: "none" }} />
        <canvas ref={cropCanvasRef} width={112} height={112} style={{ display: "none" }} />
      </div>

      {/* ── 2. Checklist & Action Section ────────────────────────────────── */}
      <div className="w-full">
        <div 
          className="p-8 md:p-10 rounded-2xl shadow-xl border"
          style={{ backgroundColor: "#FAF7F2", borderColor: "rgba(222,218,212,0.4)" }}
        >
          <div className="flex flex-col gap-10">
            <div className="space-y-6">
              <h2 className="font-headline text-3xl text-center md:text-left text-primary">
                Readiness Checklist
              </h2>
              
              <div className="flex flex-col gap-1">
                <StatusRow 
                  label="Face Detected" 
                  ok={facePresent} 
                  statusText={facePresent ? "Ready" : "Searching..."} 
                />
                <StatusRow 
                  label="Face Centered" 
                  ok={isCentered} 
                  statusText={isCentered ? "Ready" : "Please Center"} 
                />
                <StatusRow 
                  label="Lighting" 
                  ok={lightStatus === "good"} 
                  statusText={
                    lightStatus === "good" ? "Optimal" :
                    lightStatus === "too_dark" ? "Too Dark" : 
                    lightStatus === "too_bright" ? "Too Bright" : "Analyzing..."
                  } 
                />
              </div>
            </div>

            <div className="flex flex-col gap-6 items-center">
              <button 
                disabled={!ready}
                onClick={handleJoin}
                className="w-full max-w-sm py-6 rounded-sm font-label text-xs uppercase tracking-[0.25em] font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                style={{ backgroundColor: "#DCC492", color: "#251A00" }}
              >
                {ready ? roleLabel : "Adjust your position"}
              </button>
              
              <button 
                type="button"
                className="font-label text-[0.7rem] uppercase tracking-widest text-secondary hover:text-primary transition-colors underline underline-offset-8 decoration-outline-variant/40"
                onClick={() => window.location.reload()}
              >
                Retry Check
              </button>
            </div>
          </div>

          {/* Privacy assurance note */}
          <div className="mt-10 pt-6 border-t border-outline-variant/10 flex gap-4 items-start md:items-center justify-center">
            <span className="material-symbols-outlined text-secondary text-lg mt-0.5 md:mt-0">
              verified_user
            </span>
            <p className="font-body text-[0.8rem] text-on-surface-variant opacity-80 leading-snug">
              Privacy-aware verification. Only essential readiness signals are checked.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JoinScreen;
