const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const isQa = process.env.REACT_APP_MEDISYNC_QA === 'true';

  let target = process.env.REACT_APP_PROXY_TARGET;

  if (isQa) {
    if (target !== 'http://127.0.0.1:5100' || process.env.HOST !== '127.0.0.1' || process.env.PORT !== '3100') {
      throw new Error('QA proxy must be 127.0.0.1:3100 -> 127.0.0.1:5100.');
    }
  } else {
    target = target || process.env.REACT_APP_SERVER_URL || 'http://127.0.0.1:5000';
  }

  app.use(
    createProxyMiddleware({
      target,
      pathFilter: '/api',
      changeOrigin: true,
    })
  );

  app.use(
    createProxyMiddleware({
      target,
      pathFilter: '/socket.io',
      changeOrigin: true,
      ws: true,
    })
  );
};
