import { useEffect, useRef, useState } from "react";
import { getWebSocketTicket, getAuthToken } from "../api/ws-auth.js";

/**
 * Generic WebSocket hook with ticket-based auto-reconnect.
 */
export default function useWebSocket(url, onMessage = null) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;

    async function connect() {
      if (!isMounted) return;

      try {
        let finalUrl = url;
        // If url doesn't already contain ticket or token, attempt ticket acquisition if sessionId is present
        if (!finalUrl.includes("ticket=") && !finalUrl.includes("token=")) {
          const match = finalUrl.match(/\/ws\/(?:engagement|teacher)\/([^/?#]+)/);
          if (match && match[1]) {
            const sessionId = match[1];
            const channel = finalUrl.includes("/ws/teacher/") ? "teacher" : "engagement";
            try {
              const ticket = await getWebSocketTicket(sessionId, channel);
              const delimiter = finalUrl.includes("?") ? "&" : "?";
              finalUrl = `${finalUrl}${delimiter}ticket=${ticket}`;
            } catch {
              const token = getAuthToken();
              if (token) {
                const delimiter = finalUrl.includes("?") ? "&" : "?";
                finalUrl = `${finalUrl}${delimiter}token=${token}`;
              }
            }
          }
        }

        const ws = new WebSocket(finalUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setConnected(true);
        };

        ws.onmessage = (ev) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(ev.data);
            if (onMessageRef.current) onMessageRef.current(msg);
          } catch (err) {
            console.error("WS parse error", err);
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
      } catch (err) {
        console.error("WS connect error:", err);
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
  }, [url]);

  const send = (data) => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    } catch (err) {
      console.error("WS send error:", err);
    }
  };

  return { connected, send };
}
