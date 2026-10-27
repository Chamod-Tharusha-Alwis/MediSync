// Public build configuration only. Never include credentials in browser URLs.
function resolveClinicalEndpoints(apiValue, serverValue) {
  const parse = (value, kind) => {
    if (typeof value !== 'string' || !value || value !== value.trim()) throw new Error(`CLINICAL_${kind}_URL_REQUIRED`);
    let url;
    try { url = new URL(value); } catch (_) { throw new Error(`CLINICAL_${kind}_URL_INVALID`); }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
        /^\d+(?:\.\d+){3}$/.test(hostname) || hostname.includes(':') || url.port) {
      throw new Error(`CLINICAL_${kind}_URL_INVALID`);
    }
    return url;
  };
  const api = parse(apiValue, 'API');
  const server = parse(serverValue, 'SERVER');
  if (!/^\/api\/?$/.test(api.pathname) || server.pathname !== '/' || api.origin !== server.origin) {
    throw new Error('CLINICAL_ENDPOINT_CONTRACT_INVALID');
  }
  return Object.freeze({ apiBaseUrl: api.origin + '/api', socketServerUrl: server.origin });
}

module.exports = { resolveClinicalEndpoints };
