// React QA is bound to loopback and proxies only to the isolated Express server.
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
Object.assign(process.env, {
  HOST: '127.0.0.1',
  PORT: '3100',
  BROWSER: 'none',
  REACT_APP_MEDISYNC_QA: 'true',
  REACT_APP_API_URL: '/api',
  REACT_APP_SERVER_URL: 'http://127.0.0.1:3100',
  REACT_APP_PROXY_TARGET: 'http://127.0.0.1:5100',
  REACT_APP_GA_MEASUREMENT_ID: '',
});
require('react-scripts/scripts/start');
