// Test-only native listener guard; no database/environment imports.
const http = require('http');
let installed = false;
function installLoopbackListenerGuard() {
  if (installed) return;
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (port, host, ...rest) {
    if (port && typeof port === 'object') {
      if (port.path || (port.host && !['127.0.0.1', 'localhost', '::1'].includes(port.host))) throw new Error('[QA] Non-loopback listener refused');
      return originalListen.call(this, { ...port, host: '127.0.0.1' }, host, ...rest);
    }
    if (typeof host === 'function') return originalListen.call(this, port, '127.0.0.1', host, ...rest);
    if (host && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('[QA] Non-loopback listener refused');
    return originalListen.call(this, port, '127.0.0.1', ...rest);
  };
  installed = true;
}
module.exports = { installLoopbackListenerGuard };
