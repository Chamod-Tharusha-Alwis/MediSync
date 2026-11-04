'use strict';
// Browser test boundary, not application authorization. Never logs request data.
const { createSessionPolicy, FRONTEND, API } = require('./authenticatedSessionPolicy.cjs');
const STATIC_PATHS = new Set([
  '/api/auth/login', '/api/pharmacy/login', '/api/auth/refresh', '/api/auth/logout',
  '/api/auth/heartbeat', '/api/auth/preferences/language', '/api/auth/me',
  '/api/admin/stats', '/api/admin/ml-status', '/api/alerts/active',
  '/api/alerts/broadcasts/latest', '/api/notifications', '/api/notifications/unread-count',
  '/api/admin/outbreak/trigger', '/api/cache/clear', '/ingest', '/socket.io/'
]);
function requestPattern(input, method) {
  const verb = ['GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE','WS'].includes(method) ? method : 'OTHER';
  let u; try { u = new URL(input); } catch (_) { return { method: verb, pathPattern: 'UNCLASSIFIED' }; }
  const origin = u.origin.replace(/^wss:/, 'https:');
  if (![FRONTEND, API].includes(origin)) return { method: verb, pathPattern: 'UNTRUSTED_ORIGIN' };
  if (STATIC_PATHS.has(u.pathname)) return { method: verb, pathPattern: u.pathname };
  if (/^\/api\/notifications\/[^/]+\/(?:read|seen)$/.test(u.pathname)) return { method: verb, pathPattern: '/api/notifications/:id/read-or-seen' };
  return { method: verb, pathPattern: origin === API ? '/api/:redacted' : '/:page-or-asset' };
}
function createBrowserBoundary(role) {
  const policy = createSessionPolicy({ role, sessionMutationsApproved: true });
  const blocked = new Map();
  const recordBlocked = (url, method) => {
    const row = requestPattern(url, method), key = JSON.stringify(row);
    blocked.set(key, (blocked.get(key) || 0) + 1);
  };
  async function attach(context) {
    // WebSocket frames could mutate state without an HTTP POST. Deny the entire
    // unapproved transport rather than pretend the clinical/session guard covers it.
    if (typeof context.routeWebSocket !== 'function') throw Error('WEBSOCKET_FENCE_UNAVAILABLE');
    await context.routeWebSocket('**/*', ws => { recordBlocked(ws.url(), 'WS'); ws.close(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = request.url(), method = request.method();
      try {
        const u = new URL(url);
        if (u.pathname.startsWith('/socket.io')) throw Error('UNAPPROVED_SOCKET_TRANSPORT');
        policy.assertRequest(url, { method });
      } catch (_) {
        recordBlocked(url, method);
        await route.abort('blockedbyclient'); return;
      }
      await route.continue();
    });
    // Prevent the harness from accidentally bypassing page routing.
    if (context.request) for (const key of ['get','head','post','put','patch','delete','fetch']) {
      context.request[key] = () => { throw Error('BROWSER_API_BYPASS_REJECTED'); };
    }
  }
  return { attach, observeLoginResponse: policy.observeLoginResponse,
    summary: () => ({ ...policy.summary(), blockedRequests: [...blocked].map(([k,count]) => ({ ...JSON.parse(k), count })) }) };
}
function loginProof(role, status, body) {
  const d = body && typeof body === 'object' && body.data;
  const allowed = { admin: ['admin','super_admin'], patient: ['patient'], doctor: ['doctor'], hospital: ['hospital','hospital_admin'], pharmacy: ['pharmacist','pharmacy_admin'] };
  return { requiresOTP: Boolean(d?.requiresOTP), roleMatches: allowed[role]?.includes(d?.role) === true,
    accessTokenPresent: typeof d?.accessToken === 'string' && d.accessToken.length > 20 };
}
function classifyConsole(text) {
  if (/ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(text)) return 'BOUNDARY_BLOCKED_NETWORK';
  if (/websocket|socket\.io/i.test(text)) return 'SOCKET_TRANSPORT_ERROR';
  if (/minified react error|react child|uncaught|TypeError/i.test(text)) return 'RENDER_OR_RUNTIME_ERROR';
  if (/failed to load resource|status of [45]\d\d/i.test(text)) return 'HTTP_RESOURCE_ERROR';
  return 'OTHER_CONSOLE_ERROR';
}
function pageVerdict(observation) {
  return observation.rendered === true && observation.temporaryBanner === false &&
    observation.consoleErrors === 0 && observation.pageErrors === 0;
}
function adminHonesty(observation, metadata) {
  // Missing data must not be replaced with the existing fabricated fallback.
  const fallbackExposed = observation.telemetryFallbackVisible === true && metadata.mlDataPointsVerified !== true;
  return { map: observation.mapRendered ? 'RENDERED_DATA_TRUTH_NOT_VERIFIED' :
    observation.metricsUnavailable ? 'NOT_AVAILABLE_EXPLICIT' : 'NOT_AVAILABLE_NOT_EXPLAINED',
    forecast: observation.forecastPresent ? 'REQUIRES_REVIEW' : 'NO_FORECAST_VIEW_IMPLEMENTED',
    telemetry: fallbackExposed ? 'UNVERIFIED_FALLBACK_DISPLAYED' : 'NO_UNVERIFIED_FALLBACK_OBSERVED',
    passed: !fallbackExposed && (observation.metricsUnavailable || observation.mapRendered && metadata.mapDataVerified === true) && !observation.forecastPresent };
}
module.exports = { createBrowserBoundary, requestPattern, loginProof, classifyConsole, pageVerdict, adminHonesty };
