import { useEffect, useRef, useState } from "react";

/**
 * Teacher WebSocket:
 * - Receives engagement metrics + auto-nudge responses
 * - Tracks all active students with detailed facial metrics
 * - Now includes identity verification status
 */
export default function useTeacherWebSocket(sessionId) {
  const [connected, setConnected] = useState(false);
  const [students, setStudents] = useState({});
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      const base = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000";
      const wsUrl = `${base}/ws/teacher/${sessionId}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const msg = JSON.parse(event.data);
            const uid = msg.user_id;
            if (!uid) return;

            setStudents((prev) => {
              const prevStudent = prev[uid] || {};
              const isSimulated =
                Boolean(msg.is_simulated) || prevStudent.isSimulated === true;

              // --- TYPE handlers ---
              if (msg.type === "anti_cheat_violation") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    antiCheatViolations:
                      (prevStudent.antiCheatViolations || 0) + 1,
                    lastViolationType: msg.violation_type,
                    lastViolationTime: msg.timestamp,
                  },
                };
              }

              if (msg.type === "metrics") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    score: msg.score ?? prevStudent.score ?? 0,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                    // Store facial metrics for confusion detection
                    gazeDirection:
                      msg.gaze_direction ||
                      prevStudent.gazeDirection ||
                      "center",
                    ear: msg.ear ?? prevStudent.ear ?? 0,
                    headPose: msg.head_pose ||
                      prevStudent.headPose || { yaw: 0, pitch: 0 },
                    presence: msg.presence || prevStudent.presence || "unknown",
                    // Identity verification
                    identityStatus:
                      msg.identity_status ||
                      prevStudent.identityStatus ||
                      "checking",
                    identityMismatchCount:
                      msg.identity_mismatch_count ??
                      prevStudent.identityMismatchCount ??
                      0,
                    isSimulated,
                  },
                };
              }

              if (msg.type === "identity_update") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    identityStatus:
                      msg.identity_status ||
                      prevStudent.identityStatus ||
                      "checking",
                    identityMismatchCount:
                      msg.identity_mismatch_count ??
                      prevStudent.identityMismatchCount ??
                      0,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "auto_disengaged") {
                const strikeCount =
                  msg.strike_count ?? prevStudent.strikes ?? 0;
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    strikes: strikeCount,
                    disengaged: strikeCount >= 3,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "auto_disengaged_strike") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    strikes: msg.strike_count,
                    disengaged: true,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "auto_nudge_response") {
                const strikeCount =
                  msg.strike_count ?? prevStudent.strikes ?? 0;
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    strikes: strikeCount,
                    disengaged: strikeCount >= 3,
                    score: msg.score ?? prevStudent.score ?? 0,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              if (msg.type === "nudge") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    lastManualNudge: Date.now(),
                  },
                };
              }

              if (msg.type === "multi_face_detected") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    multiFaceDetected: true,
                    multiFaceCount: msg.face_count ?? 0,
                    multiFaceTime: msg.timestamp,
                  },
                };
              }

              if (msg.type === "mark_engaged_ack") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    strikes: 0,
                    disengaged: false,
                    manuallyMarkedEngaged: true,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                    antiCheatViolations: 0,
                    lastViolationType: null,
                    multiFaceDetected: false,
                    livenessFailed: false,
                    identityMismatchCount: 0,
                    identityStatus: "verified",
                  },
                };
              }

              if (msg.type === "liveness_pass") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    livenessVerified: true,
                    livenessFailed: false,
                    livenessLastCheck: msg.timestamp,
                  },
                };
              }

              if (msg.type === "liveness_fail") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    isSimulated,
                    livenessFailed: true,
                    livenessFailReason: msg.reason || "timeout",
                    strikes: (prevStudent.strikes || 0) + 1,
                    disengaged: true,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  },
                };
              }

              // fallback
              return {
                ...prev,
                [uid]: {
                  ...prevStudent,
                  isSimulated,
                  ...msg,
                },
              };
            });
          } catch (err) {
            console.error("Teacher WS message error:", err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnected(false);
          wsRef.current = null;
          reconnectRef.current = setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setConnected(false);
        };
      } catch {
        reconnectRef.current = setTimeout(connect, 2500);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  return { connected, students };
}
