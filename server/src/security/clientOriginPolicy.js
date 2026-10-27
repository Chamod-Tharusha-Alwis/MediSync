'use strict';
function clientOrigin(environment = process.env) {
  const qa = environment.NODE_ENV === 'test' || environment.MEDISYNC_QA_MODE === 'true' || environment.MEDISYNC_TEST_MODE === 'true';
  const value = environment.CLIENT_URL || (qa ? 'http://127.0.0.1:3100' : '');
  let url; try { url = new URL(value); } catch (_) { throw new Error('CLIENT_ORIGIN_CONFIGURATION_INVALID'); }
  if (url.origin !== value || url.username || url.password || url.search || url.hash || (qa ? value !== 'http://127.0.0.1:3100' : url.protocol !== 'https:')) throw new Error('CLIENT_ORIGIN_CONFIGURATION_INVALID');
  return value;
}
module.exports = { clientOrigin };
