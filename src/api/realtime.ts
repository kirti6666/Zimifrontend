import { SOCKET_URL } from "../config";

/* Live events pushed by the server, already in the form the screens take:
   { "type": "call.incoming", "data": { ... } }. See AppMessage in src/bridge.ts. */
export interface ServerEvent {
  type: string;
  data?: Record<string, unknown>;
}

const LIVE_TYPES = new Set([
  "call.incoming", "call.connected", "call.ended", "gift.received", "chat.message",
  "wallet.balance", "verification.status",
]);

/* One socket for the signed-in user. Reconnects with a growing delay (1s up to 30s).
   Returns a function that closes it for good. */
export function connectRealtime(token: string, onEvent: (event: ServerEvent) => void): () => void {
  if (!SOCKET_URL) return () => {};
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  let closed = false;

  const open = () => {
    socket = new WebSocket(`${SOCKET_URL}?token=${encodeURIComponent(token)}`);
    socket.onopen = () => { delay = 1000; };
    socket.onmessage = (msg) => {
      try {
        const event = JSON.parse(String(msg.data)) as ServerEvent;
        if (LIVE_TYPES.has(event.type)) onEvent(event);
      } catch {
        // Ignore anything that is not a JSON event.
      }
    };
    socket.onclose = () => {
      if (closed) return;
      retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, 30000);
    };
  };

  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    socket?.close();
  };
}
