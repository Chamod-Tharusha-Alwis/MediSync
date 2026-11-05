'use strict';
// Browser test boundary, not application authorization. Never logs request data.
const { createSessionPolicy, FRONTEND, API } = require('./authenticatedSessionPolicy.cjs');
const {transportUrl,permittedFrames}=require('./notificationTransportPolicy.cjs');
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
  if(/^\/api\/admin\/ml-status\/*$/i.test(u.pathname))return {method:verb,pathPattern:'/api/admin/ml-status'};
  if (STATIC_PATHS.has(u.pathname)) return { method: verb, pathPattern: u.pathname };
  if (/^\/api\/notifications\/[^/]+\/(?:read|seen)$/.test(u.pathname)) return { method: verb, pathPattern: '/api/notifications/:id/read-or-seen' };
  return { method: verb, pathPattern: origin === API ? '/api/:redacted' : '/:page-or-asset' };
}
function createBrowserBoundary(role, {notificationTransportApproved=false,mlStatusGetLimit}={}) {
  if(mlStatusGetLimit!==undefined&&(role!=='admin'||mlStatusGetLimit!==1))throw Error('ML_STATUS_LIMIT_REJECTED');
  let mlStatusGetDispatches=0;
  const policy = createSessionPolicy({ role, sessionMutationsApproved: true });
  const blocked = new Map();
  const blockedTransportReasons = {};
  const sockets = new Set();
  let socketToken;
  const authenticated=()=>policy.summary().state==='AUTHENTICATED'&&typeof socketToken==='string';
  let resolveLogin;
  const loginObserved = new Promise(resolve=>{resolveLogin=resolve;});
  async function waitForAuthentication() {
    if(authenticated())return true;
    if(policy.summary().state!=='LOGIN_DISPATCHED')return false;
    let timer;
    try{return await Promise.race([loginObserved,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),3000);})]);}
    finally{clearTimeout(timer);}
  }
  const recordBlocked = (url, method) => {
    const row = requestPattern(url, method), key = JSON.stringify(row);
    blocked.set(key, (blocked.get(key) || 0) + 1);
    if(row.pathPattern==='/socket.io/'){
      const reason=policy.summary().state==='CLOSED'?'CLOSED_SESSION':
        !transportUrl(url,method==='WS'?'websocket':'polling',method==='WS'?'GET':method)?'URL_SHAPE_REJECTED':
        !authenticated()?'NOT_AUTHENTICATED':'FRAME_OR_CONTENT_TYPE_REJECTED';
      blockedTransportReasons[reason]=(blockedTransportReasons[reason]||0)+1;
    }
  };
  async function attach(context) {
    if (typeof context.routeWebSocket !== 'function') throw Error('WEBSOCKET_FENCE_UNAVAILABLE');
    await context.routeWebSocket('**/*', async ws => {
      if(!notificationTransportApproved||!transportUrl(ws.url(),'websocket','GET')||!await waitForAuthentication()){recordBlocked(ws.url(),'WS');ws.close();return;}
      const server=ws.connectToServer();
      let closed=false;
      const closeBoth=()=>{if(closed)return;closed=true;sockets.delete(closeBoth);ws.close();server.close();};
      sockets.add(closeBoth);
      // Register both directions explicitly: do not auto-forward arbitrary events.
      ws.onMessage(data=>{
        if(closed)return;
        if(!permittedFrames(data,socketToken,{closed:!authenticated(),websocket:true})){recordBlocked(ws.url(),'WS');closeBoth();return;}
        server.send(data);
      });
      server.onMessage(data=>{if(!authenticated()){closeBoth();return;}if(!closed)ws.send(data);});
      ws.onClose(closeBoth);server.onClose(closeBoth);
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = request.url(), method = request.method();
      try {
        const u = new URL(url);
        if (u.pathname.startsWith('/socket.io')) {
          if(!notificationTransportApproved||!transportUrl(url,'polling',method))throw Error('UNAPPROVED_SOCKET_TRANSPORT');
          if(policy.summary().state==='LOGIN_DISPATCHED')await waitForAuthentication();
          if(method==='GET'&&!authenticated())throw Error('UNAPPROVED_SOCKET_TRANSPORT');
          if(method==='POST'){
            const type=request.headers?.()['content-type']||'';
            if(!/^text\/plain(?:;|$)/i.test(type)||!socketToken||!permittedFrames(request.postData(),socketToken,{closed:!authenticated()}))throw Error('UNAPPROVED_SOCKET_TRANSPORT');
          }
        } else {
          const limitedMl=mlStatusGetLimit!==undefined&&u.origin===API&&/^\/api\/admin\/ml-status\/*$/i.test(u.pathname);
          if(limitedMl&&(u.pathname!=='/api/admin/ml-status'||u.search||u.hash||!['GET','OPTIONS'].includes(method)))throw Error('ML_STATUS_SCOPE_REJECTED');
          if(limitedMl&&method==='GET'&&(!authenticated()||mlStatusGetDispatches>=mlStatusGetLimit))throw Error('ML_STATUS_LIMIT_REJECTED');
          policy.assertRequest(url, { method });
          if(limitedMl&&method==='GET')mlStatusGetDispatches++;
          if(policy.summary().state==='CLOSED')for(const close of [...sockets])close();
        }
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
  return { attach, observeLoginResponse(status,proof,token){
      policy.observeLoginResponse(status,proof);
      socketToken=policy.summary().state==='AUTHENTICATED'&&typeof token==='string'&&token.length>20?token:undefined;
      resolveLogin(authenticated());
    },
    summary: () => ({ ...policy.summary(), ...(mlStatusGetLimit===undefined?{}:{mlStatusGetDispatches,mlStatusGetLimit}), blockedTransportReasons:{...blockedTransportReasons}, blockedRequests: [...blocked].map(([k,count]) => ({ ...JSON.parse(k), count })) }) };
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
