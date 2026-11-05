'use strict';

// Proposed browser-QA boundary only. No transport, credentials, environment
// reads or live runner. Existing universally read-only verifiers stay unchanged.
const { createPolicy } = require('./liveVerificationReadOnly.cjs');
const FRONTEND = 'https://medisync.chamodtharusha.com.lk';
const API = 'https://medisync-wabc.onrender.com';
const METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SESSION_PATHS = new Map([
  ['/api/auth/login', 'LOGIN'], ['/api/pharmacy/login', 'LOGIN'],
  ['/api/auth/refresh', 'REFRESH'], ['/api/auth/logout', 'LOGOUT']
]);
const DENIED_SEGMENT = /(?:^|\/)(?:ingest|seed[^/]*|trigger|clear[-_]?cache|invalidate[-_]?cache|flush[^/]*|otp|send-otp|verify-otp|dispense|dispensing)(?:\/|$)/i;
const fail = code => { throw Object.assign(Error(code), { code }); };

function bucket(input, method) {
  const verb = METHODS.has(method) ? method : 'OTHER';
  let url;
  try { url = new URL(input); } catch (_) { return { method: verb, pathPattern: 'UNCLASSIFIED' }; }
  if (![FRONTEND, API].includes(url.origin)) return { method: verb, pathPattern: 'UNTRUSTED_ORIGIN' };
  if (SESSION_PATHS.has(url.pathname)) return { method: verb, pathPattern: url.pathname };
  // Never retain an arbitrary pathname, query, fragment, host, identifier or body.
  if (DENIED_SEGMENT.test(url.pathname)) return { method: verb, pathPattern: 'DENIED_OPERATION' };
  return { method: verb, pathPattern: url.origin === API ? '/api/:redacted' : '/:page-or-asset' };
}

function createSessionPolicy({ role, sessionMutationsApproved = false } = {}) {
  if (!['admin', 'patient', 'doctor', 'hospital', 'pharmacy'].includes(role)) fail('QA_ROLE_REJECTED');
  const readPolicy = createPolicy(), requests = new Map();
  const counts = { LOGIN: 0, REFRESH: 0, LOGOUT: 0 };
  let state = 'PRE_LOGIN', rejected = 0;
  const loginPath = role === 'pharmacy' ? '/api/pharmacy/login' : '/api/auth/login';
  const record = (input, method, accepted) => {
    const row = { ...bucket(input, method), accepted };
    const key = JSON.stringify(row);
    requests.set(key, (requests.get(key) || 0) + 1);
  };
  function assertRequest(input, { method = 'GET' } = {}) {
    const verb = typeof method === 'string' ? method.toUpperCase() : 'OTHER';
    try {
      if (typeof input !== 'string' || input.length > 4096) fail('QA_TARGET_REJECTED');
      const url = new URL(input);
      if (![FRONTEND, API].includes(url.origin) || url.protocol !== 'https:' || url.username || url.password || /%|\\|(?:^|\/)\.\.(?:\/|$)/.test(input.split(/[?#]/)[0])) fail('QA_TARGET_REJECTED');
      if (DENIED_SEGMENT.test(url.pathname)) fail('QA_OPERATION_REJECTED');
      const action = url.origin === API && SESSION_PATHS.get(url.pathname);
      if (action && verb === 'OPTIONS' && !url.search && !url.hash) {
        // Browser CORS preflight has no session mutation and consumes no budget.
        readPolicy.assertRequest(input, { method: verb });
      } else if (action) {
        if (sessionMutationsApproved !== true || verb !== 'POST' || url.search || url.hash || state === 'CLOSED' || counts[action] !== 0) fail('QA_SESSION_OPERATION_REJECTED');
        if (action === 'LOGIN' ? state !== 'PRE_LOGIN' || url.pathname !== loginPath : state !== 'AUTHENTICATED') fail('QA_SESSION_STATE_REJECTED');
        counts[action]++;
        if (action === 'LOGIN') state = 'LOGIN_DISPATCHED';
        if (action === 'LOGOUT') state = 'CLOSED';
      } else {
        readPolicy.assertRequest(input, { method: verb });
      }
      record(input, verb, true);
      return true;
    } catch (_) {
      rejected++;
      record(input, verb, false);
      fail('QA_REQUEST_REJECTED');
    }
  }
  function observeLoginResponse(status, proof = {}) {
    if (state !== 'LOGIN_DISPATCHED' || !Number.isInteger(status)) fail('QA_SESSION_STATE_REJECTED');
    // HTTP200 may mean OTP is pending. The approved runner must validate the
    // actual response privately, then pass only these non-sensitive booleans.
    state = status === 200 && proof && typeof proof === 'object' && !Array.isArray(proof) && proof.requiresOTP === false && proof.roleMatches === true && proof.accessTokenPresent === true
      ? 'AUTHENTICATED' : 'CLOSED';
  }
  return {
    assertRequest, observeLoginResponse,
    summary: () => ({ state, rejected, budgetUsed: { ...counts }, requests: [...requests].map(([key, count]) => ({ ...JSON.parse(key), count })) })
  };
}

module.exports = { createSessionPolicy, FRONTEND, API };
