'use strict';
// URL-only validation; never resolves DNS or exposes credential values.
function validateRedisConnection(environment) {
  const production = environment.NODE_ENV === 'production';
  if (production && !environment.REDIS_URL) throw new Error('REDIS_PRODUCTION_CONFIGURATION_REQUIRED');
  const value = environment.REDIS_URL || 'redis://127.0.0.1:6379';
  let url; try { url = new URL(value); } catch (_) { throw new Error('REDIS_CONNECTION_CONFIGURATION_INVALID'); }
  if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || url.search || url.hash || (url.pathname && !/^\/\d*$/.test(url.pathname))) throw new Error('REDIS_CONNECTION_CONFIGURATION_INVALID');
  if (production) {
    if (!url.password) throw new Error('REDIS_AUTHENTICATION_REQUIRED');
    if (url.protocol !== 'rediss:' && !['127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('REDIS_REMOTE_TLS_REQUIRED');
  }
  return value;
}
module.exports = { validateRedisConnection };
