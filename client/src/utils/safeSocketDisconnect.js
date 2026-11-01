/**
 * Safely disconnects a Socket.IO client instance without triggering
 * Chromium's "WebSocket is closed before the connection is established"
 * console warning when unmounting while a WebSocket handshake is in flight.
 *
 * @param {import('socket.io-client').Socket | null | undefined} socket
 */
export const safeDisconnectSocket = (socket) => {
  if (!socket) return;
  try {
    if (typeof socket.off === 'function') {
      socket.off();
    }
    if (socket.io) {
      socket.io.skipReconnect = true;
    }

    const ws = socket.io?.engine?.transport?.ws;
    if (ws && ws.readyState === 0 /* WebSocket.CONNECTING */) {
      const doDisconnect = () => {
        try {
          if (typeof socket.disconnect === 'function') {
            socket.disconnect();
          }
        } catch (_) {}
      };

      if (typeof ws.addEventListener === 'function') {
        ws.addEventListener('open', doDisconnect, { once: true });
        ws.addEventListener('error', doDisconnect, { once: true });
        ws.addEventListener('close', doDisconnect, { once: true });
        return;
      }
    }

    if (typeof socket.disconnect === 'function') {
      socket.disconnect();
    }
  } catch (_) {
    try {
      if (typeof socket.disconnect === 'function') {
        socket.disconnect();
      }
    } catch (__) {}
  }
};

export default safeDisconnectSocket;
