'use strict';
function listenReady(server, port, host) {
  return new Promise((resolve, reject) => {
    function failed(error) { server.removeListener('listening', ready); reject(error); }
    function ready() { server.removeListener('error', failed); resolve(); }
    server.once('error', failed);
    server.once('listening', ready);
    try { server.listen(port, host); } catch (error) { server.removeListener('error', failed); server.removeListener('listening', ready); reject(error); }
  });
}
module.exports = { listenReady };
