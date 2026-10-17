const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  if (process.env.REACT_APP_MEDISYNC_QA !== 'true') {
    throw new Error('Local MediSync frontend requires npm run start:qa; generic development proxy is disabled.');
  }
  const target = process.env.REACT_APP_PROXY_TARGET;
  if (target !== 'http://127.0.0.1:5100' || process.env.HOST !== '127.0.0.1' || process.env.PORT !== '3100') {
    throw new Error('QA proxy must be 127.0.0.1:3100 -> 127.0.0.1:5100.');
  }

  app.use(
    createProxyMiddleware({
      pathFilter: ['/api', '/socket.io'],
      target,
      changeOrigin: true,
      ws: false,
    })
  );
};
