// Suite-owned loopback listener. No database, routes or environment imports.
const http = require('http');
function createOwnedHttpServer(app, { startupTimeoutMs = 5000, shutdownTimeoutMs = 5000 } = {}) {
  const server = http.createServer(app), sockets = new Set(), startupAbort = new AbortController();
  const receipt = { requestedHost: '127.0.0.1', requestedPort: 0, address: null, started: false, closed: false,
    startupFailed: false, shutdownTimedOut: false, socketsRemaining: 0 };
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  async function close() {
    if (!server.listening && !sockets.size) { receipt.closed = true; receipt.socketsRemaining = 0; return; }
    try { await new Promise((resolve, reject) => {
      const closedSockets = [...sockets].map(socket => new Promise(done => socket.once('close', done)));
      let forcedDrainTimer;
      const timer = setTimeout(() => {
        receipt.shutdownTimedOut = true;
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections?.();
        forcedDrainTimer = setTimeout(() => reject(new Error('Owned HTTP server forced drain timed out')), 1000);
        Promise.all(closedSockets).then(() => { clearTimeout(forcedDrainTimer); reject(new Error('Owned HTTP server shutdown timed out')); });
      }, shutdownTimeoutMs);
      server.close(error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') { clearTimeout(timer); reject(error); }
        else Promise.all(closedSockets).then(() => {
          clearTimeout(timer); clearTimeout(forcedDrainTimer);
          if (receipt.shutdownTimedOut) reject(new Error('Owned HTTP server shutdown timed out')); else resolve();
        });
      });
      server.closeIdleConnections?.();
    }); } finally {
      receipt.closed = !server.listening && server.address() === null;
      receipt.socketsRemaining = sockets.size;
    }
    if (!receipt.closed) throw new Error('Owned HTTP server is still listening');
  }
  async function start() {
    if (receipt.started) throw new Error('Owned HTTP server already started');
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); server.off('error', onError); server.off('listening', onListening); };
        const onError = error => { cleanup(); reject(error); };
        const onListening = () => { cleanup(); resolve(); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('Owned HTTP server startup timed out')); }, startupTimeoutMs);
        server.once('error', onError); server.once('listening', onListening);
        try { server.listen({ host: '127.0.0.1', port: 0, signal: startupAbort.signal }); } catch (error) { onError(error); }
      });
      const address = server.address();
      if (!address || typeof address !== 'object' || address.address !== '127.0.0.1' || !Number.isInteger(address.port) || address.port < 1 || address.port > 65535) {
        throw new Error('Owned HTTP server has no valid loopback address');
      }
      receipt.address = { address: address.address, family: address.family, port: address.port }; receipt.started = true;
      return server;
    } catch (error) {
      receipt.startupFailed = true;
      startupAbort.abort();
      await close();
      throw error;
    }
  }
  return { server, start, close, status: () => ({ ...receipt, socketsRemaining: sockets.size, listening: server.listening }) };
}
module.exports = { createOwnedHttpServer };
