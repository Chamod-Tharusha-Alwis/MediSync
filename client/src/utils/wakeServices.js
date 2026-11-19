// Fire-and-forget "wake-up" requests sent when the admin sign-in page opens, so a sleeping free-tier instance starts
// while the administrator types the password and OTP instead of after sign-in. No data, no credentials, no retries,
// no polling, no keep-alive timer. Failures are ignored.
//   API:  GET <REACT_APP_API_URL or /api>/health (public, answers 200 when ready)
//   ML:   GET REACT_APP_ML_HEALTH_URL (only if that variable is set; sent as no-cors because the response is not read)
let sent = false;

export function wakeServices(env = process.env, fetchImpl = typeof fetch === 'function' ? fetch : null) {
  if (sent || !fetchImpl || env.NODE_ENV === 'test') return [];
  sent = true;
  const apiBase = String(env.REACT_APP_API_URL || '/api').replace(/\/+$/, '');
  const targets = [`${apiBase}/health`];
  if (env.REACT_APP_ML_HEALTH_URL) targets.push(env.REACT_APP_ML_HEALTH_URL);
  for (const url of targets) {
    try {
      const external = /^https?:\/\//.test(url) && typeof window !== 'undefined' && !url.startsWith(window.location.origin);
      Promise.resolve(fetchImpl(url, { method: 'GET', credentials: 'omit', cache: 'no-store', keepalive: true, ...(external && url === env.REACT_APP_ML_HEALTH_URL ? { mode: 'no-cors' } : {}) }))
        .catch(() => {});
    } catch (_) { /* ignore */ }
  }
  return targets;
}

export function _resetWakeForTests() { sent = false; }
