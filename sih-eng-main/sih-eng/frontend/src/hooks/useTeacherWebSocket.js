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

      const wsUrl = `${
        import.meta.env.VITE_BACKEND_WS_URL
      }/ws/teacher/${sessionId}`;

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

            setStudents(prev => {
              const prevStudent = prev[uid] || {};

              // --- TYPE handlers ---
              if (msg.type === "anti_cheat_violation") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    antiCheatViolations: (prevStudent.antiCheatViolations || 0) + 1,
                    lastViolationType: msg.violation_type,
                    lastViolationTime: msg.timestamp,
                  }
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
                    gazeDirection: msg.gaze_direction || prevStudent.gazeDirection || 'center',
                    ear: msg.ear ?? prevStudent.ear ?? 0,
                    headPose: msg.head_pose || prevStudent.headPose || { yaw: 0, pitch: 0 },
                    presence: msg.presence || prevStudent.presence || 'unknown',
                    // Identity verification
                    identityStatus: msg.identity_status || prevStudent.identityStatus || 'checking',
                    identityMismatchCount: msg.identity_mismatch_count ?? prevStudent.identityMismatchCount ?? 0,
                  }
                };
              }

              if (msg.type === "identity_update") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    identityStatus: msg.identity_status || prevStudent.identityStatus || 'checking',
                    identityMismatchCount: msg.identity_mismatch_count ?? prevStudent.identityMismatchCount ?? 0,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  }
                };
              }

              if (msg.type === "auto_disengaged") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    strikes: msg.strike_count,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  }
                };
              }

              if (msg.type === "auto_disengaged_strike") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    strikes: msg.strike_count,
                    disengaged: true,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  }
                };
              }

              if (msg.type === "nudge") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    lastManualNudge: Date.now(),
                  }
                };
              }

              if (msg.type === "multi_face_detected") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    multiFaceDetected: true,
                    multiFaceCount: msg.face_count ?? 0,
                    multiFaceTime: msg.timestamp,
                  }
                };
              }

              if (msg.type === "mark_engaged_ack") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    strikes: 0,
                    disengaged: false,
                    manuallyMarkedEngaged: true,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  }
                };
              }

              if (msg.type === "liveness_pass") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    livenessVerified: true,
                    livenessLastCheck: msg.timestamp,
                  }
                };
              }

              if (msg.type === "liveness_fail") {
                return {
                  ...prev,
                  [uid]: {
                    ...prevStudent,
                    livenessFailed: true,
                    livenessFailReason: msg.reason || "timeout",
                    strikes: (prevStudent.strikes || 0) + 1,
                    disengaged: true,
                    timestamp: msg.timestamp || prevStudent.timestamp,
                  }
                };
              }

              // fallback
              return {
                ...prev,
                [uid]: {
                  ...prevStudent,
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

