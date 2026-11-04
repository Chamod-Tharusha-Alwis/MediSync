'use strict';
const { createSessionPolicy, FRONTEND, API } = require('../../scripts/authenticatedSessionPolicy.cjs');
const login = API + '/api/auth/login';
const policy = () => createSessionPolicy({ role: 'doctor', sessionMutationsApproved: true });
const authenticate = p => { p.assertRequest(login, { method: 'POST' }); p.observeLoginResponse(200, { requiresOTP: false, roleMatches: true, accessTokenPresent: true }); };

test('no session write is enabled without explicit approval; no environment flag is consulted', () => {
  const p = createSessionPolicy({ role: 'doctor' });
  expect(() => p.assertRequest(login, { method: 'POST' })).toThrow('QA_REQUEST_REJECTED');
  expect(p.summary().budgetUsed).toEqual({ LOGIN: 0, REFRESH: 0, LOGOUT: 0 });
});
test('one login, one refresh and one logout are the complete accepted write budget', () => {
  const p = policy(); authenticate(p);
  p.assertRequest(API + '/api/auth/refresh', { method: 'POST' });
  p.assertRequest(API + '/api/auth/logout', { method: 'POST' });
  expect(p.summary()).toMatchObject({ state: 'CLOSED', rejected: 0, budgetUsed: { LOGIN: 1, REFRESH: 1, LOGOUT: 1 } });
  for (const path of ['login', 'refresh', 'logout']) expect(() => p.assertRequest(API + '/api/auth/' + path, { method: 'POST' })).toThrow();
});
test.each(['refresh', 'logout'])('%s cannot precede authentication', path => {
  const p = policy(); expect(() => p.assertRequest(API + '/api/auth/' + path, { method: 'POST' })).toThrow();
});
test('rejected login cannot be retried or refreshed', () => {
  const p = policy(); p.assertRequest(login, { method: 'POST' }); p.observeLoginResponse(401);
  expect(() => p.assertRequest(login, { method: 'POST' })).toThrow();
  expect(() => p.assertRequest(API + '/api/auth/refresh', { method: 'POST' })).toThrow();
});
test.each([undefined, null, [], true, '', {}, { requiresOTP: true, roleMatches: true, accessTokenPresent: true }, { requiresOTP: false, roleMatches: false, accessTokenPresent: true }, { requiresOTP: false, roleMatches: true, accessTokenPresent: false }])('HTTP200 alone or an incomplete/OTP-pending proof never grants an authenticated session %#', proof => {
  const p = policy(); p.assertRequest(login, { method: 'POST' }); p.observeLoginResponse(200, proof);
  expect(p.summary().state).toBe('CLOSED');
  expect(() => p.assertRequest(API + '/api/auth/refresh', { method: 'POST' })).toThrow();
  expect(() => p.assertRequest(API + '/api/auth/logout', { method: 'POST' })).toThrow();
});
test('refresh attempt is consumed before dispatch and never retried', () => {
  const p = policy(); authenticate(p); p.assertRequest(API + '/api/auth/refresh', { method: 'POST' });
  expect(() => p.assertRequest(API + '/api/auth/refresh', { method: 'POST' })).toThrow();
  expect(p.summary().budgetUsed.REFRESH).toBe(1);
});
test('pharmacy accepts only its real login endpoint', () => {
  const p = createSessionPolicy({ role: 'pharmacy', sessionMutationsApproved: true });
  expect(() => p.assertRequest(login, { method: 'POST' })).toThrow();
  expect(p.assertRequest(API + '/api/pharmacy/login', { method: 'POST' })).toBe(true);
});
test.each(['admin', 'patient', 'doctor', 'hospital'])('%s uses only the generic login endpoint', role => {
  const p = createSessionPolicy({ role, sessionMutationsApproved: true });
  expect(() => p.assertRequest(API + '/api/pharmacy/login', { method: 'POST' })).toThrow();
  expect(p.assertRequest(login, { method: 'POST' })).toBe(true);
});
test.each(['/ingest', '/api/seed-demo', '/api/outbreak/trigger', '/api/cache/clear', '/api/clear-cache', '/api/auth/verify-otp', '/api/auth/send-otp', '/api/doctor/consultations', '/api/pharmacy/dispense', '/api/auth/heartbeat', '/api/notifications/read', '/api/auth/change-password'])('session proposal still rejects POST %s', path => {
  const p = policy(); authenticate(p); expect(() => p.assertRequest(API + path, { method: 'POST' })).toThrow();
});
test.each(['GET', 'PUT', 'PATCH', 'DELETE'])('session write endpoint rejects wrong method %s', method => {
  const p = policy(); expect(() => p.assertRequest(login, { method })).toThrow();
});
test('exact CORS preflight remains read-only and cannot consume or grant login approval', () => {
  const p = createSessionPolicy({ role: 'doctor' });
  expect(p.assertRequest(login, { method: 'OPTIONS' })).toBe(true);
  expect(p.summary().budgetUsed.LOGIN).toBe(0);
  expect(() => p.assertRequest(login, { method: 'POST' })).toThrow();
  expect(() => p.assertRequest(login + '?private=sentinel', { method: 'OPTIONS' })).toThrow();
});
test.each(['http://medisync-wabc.onrender.com/api/auth/login', 'https://untrusted.example.invalid/api/auth/login', FRONTEND + '/api/auth/login', login + '?private=sentinel', login + '#sentinel', API + '/api/auth/%6cogin', API + '/api/auth/../auth/login', API + '/api/auth/login/'])('lookalike or decorated session target is denied %#', url => {
  const p = policy(); expect(() => p.assertRequest(url, { method: 'POST' })).toThrow();
});
test('read-only same-origin dashboard assets and APIs remain allowed', () => {
  const p = policy(); authenticate(p);
  expect(p.assertRequest(FRONTEND + '/doctor/dashboard')).toBe(true);
  expect(p.assertRequest(API + '/api/doctor/stats')).toBe(true);
});
test('request counts never retain URL identifiers, query, credentials, headers, bodies or unknown methods', () => {
  const p = policy();
  p.assertRequest(API + '/api/doctor/owned-private-sentinel?token=owned-private-sentinel');
  for (const method of ['POST', 'PUT']) expect(() => p.assertRequest(API + '/api/doctor/owned-private-sentinel', { method, headers: { token: 'owned-private-sentinel' }, body: 'owned-private-sentinel' })).toThrow();
  expect(() => p.assertRequest('not-a-url-owned-private-sentinel', { method: 'owned-private-sentinel' })).toThrow();
  expect(JSON.stringify(p.summary())).not.toContain('owned-private-sentinel');
  expect(p.summary().requests).toEqual(expect.arrayContaining([{ method: 'GET', pathPattern: '/api/:redacted', accepted: true, count: 1 }, { method: 'POST', pathPattern: '/api/:redacted', accepted: false, count: 1 }]));
});
test('global universally read-only verifier is still closed to every session POST', () => {
  const p = require('../../scripts/liveVerificationReadOnly.cjs').createPolicy();
  for (const path of ['login', 'refresh', 'logout']) expect(() => p.assertRequest(API + '/api/auth/' + path, { method: 'POST' })).toThrow();
});
