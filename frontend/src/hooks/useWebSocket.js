import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom WebSocket hook with auto-reconnect.
 * @param {string} path - WebSocket path (e.g., '/ws/display')
 * @returns {{ lastMessage, isConnected, sendMessage }}
 */
export default function useWebSocket(path) {
  const [lastMessage, setLastMessage] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}${path}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) {
          setIsConnected(true);
          console.log(`[WS] Connected to ${path}`);
        }
      };

      ws.onmessage = (event) => {
        if (mountedRef.current) {
          try {
            const data = JSON.parse(event.data);
            setLastMessage(data);
          } catch {
            setLastMessage(event.data);
          }
        }
      };

      ws.onclose = () => {
        if (mountedRef.current) {
          setIsConnected(false);
          console.log(`[WS] Disconnected from ${path}. Reconnecting in 3s...`);
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error(`[WS] Error on ${path}:`, error);
        ws.close();
      };
    } catch (err) {
      console.error(`[WS] Failed to connect to ${path}:`, err);
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { lastMessage, isConnected, sendMessage };
}
