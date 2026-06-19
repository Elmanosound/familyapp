import { io, Socket } from 'socket.io-client';
import { isNative } from './platform';

let socket: Socket | null = null;

// Resolve the Socket.io server origin.
// - Web: same origin as the page (served by the backend / Vite proxy).
// - Native: window.location.origin is "https://localhost" (the WebView), which
//   is useless, so an absolute URL is required. We use VITE_SOCKET_URL, or fall
//   back to the API origin derived from VITE_API_URL (".../api/v1" → host root).
function resolveSocketUrl(): string {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (isNative() && import.meta.env.VITE_API_URL) {
    try {
      return new URL(import.meta.env.VITE_API_URL).origin;
    } catch {
      /* fall through to window.location.origin */
    }
  }
  return window.location.origin;
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(resolveSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    timeout: 5000,
  });

  socket.on('connect', () => {
    // connected — nothing to log in production
  });

  socket.on('connect_error', (_err) => {
    // reconnection handled automatically by socket.io-client
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
