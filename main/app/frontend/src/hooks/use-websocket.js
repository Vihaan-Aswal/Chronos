import { useEffect, useRef, useState } from "react";

/**
 * Generic WebSocket hook with auto-reconnect.
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

    function connect() {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(url);
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
