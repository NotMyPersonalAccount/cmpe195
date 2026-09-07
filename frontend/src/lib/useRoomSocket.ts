import { useCallback, useEffect, useRef, useState } from "react";

import { getClientId } from "./clientId";
import type { Role, RoomState } from "./types";

const SEND_INTERVAL_MS = 100;
const HEARTBEAT_MS = 15_000;
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8_000;

function socketUrl(roomId: string, clientId: string, role: Role): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/rooms/${encodeURIComponent(roomId)}?client_id=${clientId}&role=${role}`;
}

export function useRoomSocket(roomId: string, role: Role) {
  const [state, setState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const closed = useRef(false);
  const backoff = useRef(BACKOFF_MIN_MS);

  // Last value we told the server about. Resent on reconnect so a socket drop
  // -- or being reaped during an outage -- heals itself.
  const lastSent = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const sendTimer = useRef<number | null>(null);

  useEffect(() => {
    closed.current = false;
    const clientId = getClientId();
    let reconnectTimer: number | undefined;
    let heartbeat: number | undefined;

    const connect = () => {
      if (closed.current) return;
      const sock = new WebSocket(socketUrl(roomId, clientId, role));
      ws.current = sock;

      sock.onopen = () => {
        setConnected(true);
        backoff.current = BACKOFF_MIN_MS;
        if (role === "student" && lastSent.current !== null) {
          sock.send(JSON.stringify({ type: "score", value: lastSent.current }));
        }
        heartbeat = window.setInterval(() => {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_MS);
      };

      sock.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "state") setState(msg as RoomState);
      };

      sock.onclose = () => {
        setConnected(false);
        window.clearInterval(heartbeat);
        if (closed.current) return;
        reconnectTimer = window.setTimeout(connect, backoff.current);
        backoff.current = Math.min(backoff.current * 2, BACKOFF_MAX_MS);
      };

      sock.onerror = () => sock.close();
    };

    connect();

    return () => {
      closed.current = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(reconnectTimer);
      if (sendTimer.current) window.clearTimeout(sendTimer.current);
      sendTimer.current = null;
      ws.current?.close();
    };
  }, [roomId, role]);

  /**
   * Throttled score send. A slider drag fires continuously, so sends are capped
   * at one per SEND_INTERVAL_MS -- but the trailing value is always delivered,
   * so where the student actually let go is what lands.
   */
  const sendScore = useCallback((value: number) => {
    pending.current = value;
    if (sendTimer.current !== null) return;

    const flush = () => {
      const next = pending.current;
      pending.current = null;
      if (next !== null && ws.current?.readyState === WebSocket.OPEN) {
        lastSent.current = next;
        ws.current.send(JSON.stringify({ type: "score", value: next }));
      }
      // Sending re-arms the window so the rate stays capped; an empty window
      // closes it, so an idle slider sends again immediately on next touch.
      sendTimer.current =
        next !== null ? window.setTimeout(flush, SEND_INTERVAL_MS) : null;
    };

    flush();
  }, []);

  return { state, connected, sendScore };
}
