import { useEffect, useRef, useCallback } from 'react';
import type { WsMessage } from '../types';

function getWsUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) {
    return apiUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')
      .replace('/api', '/ws');
  }
  return 'ws://localhost:3002/ws';
}

export function useWs(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMsgRef = useRef(onMessage);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onMsgRef.current = onMessage;

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as WsMessage;
          onMsgRef.current(msg);
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        timerRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      timerRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
