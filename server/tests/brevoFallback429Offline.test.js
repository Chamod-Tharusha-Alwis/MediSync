'use strict';
// Actual dispatch/classification code; inert transports and quota adapter only.
jest.mock('axios', () => ({
  get: jest.fn(() => { throw Error('UNEXPECTED_NETWORK'); }),
  post: jest.fn(() => { throw Error('UNEXPECTED_NETWORK'); })
}));
jest.mock('../src/config/redis', () => ({
  getDailyEmailCount: jest.fn(), incrementDailyEmailCount: jest.fn(),
  reserveDailyEmailSlot: jest.fn(), releaseDailyEmailSlot: jest.fn(),
  setDailyEmailCount: jest.fn(), isUsingPersistentRedis: jest.fn(() => true)
}));
const axios = require('axios');
const quota = require('../src/config/redis');
const names = ['NODE_ENV','MEDISYNC_TEST_MODE','EMAIL_SERVICE_LIVE_TEST','RESEND_API_KEY','RESEND_SMTP_PASS','RESEND_KEY','RESEND_APIKEY','RESEND_FROM_ADDRESS','EMAIL_BACKUP_PROVIDER','BREVO_API_KEY','BREVO_FROM_ADDRESS','BREVO_DAILY_FREE_LIMIT'];
let saved, email, resendPost, brevoPost;
const address = ['operator', 'example.test'].join('@');
const message = { to: address, subject: 'Offline delivery diagnostic', text: 'Synthetic transport fixture.', html: '<p>Synthetic transport fixture.</p>' };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-04T17:36:43Z')); });
afterEach(() => jest.useRealTimers());
beforeAll(() => {
  saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { NODE_ENV: 'test', RESEND_API_KEY: 'offline-placeholder', RESEND_FROM_ADDRESS: address, EMAIL_BACKUP_PROVIDER: 'brevo', BREVO_API_KEY: 'offline-placeholder', BREVO_FROM_ADDRESS: address, BREVO_DAILY_FREE_LIMIT: '300' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  email = require('../src/utils/emailService');
});
beforeEach(() => {
  jest.clearAllMocks();
  quota.reserveDailyEmailSlot.mockResolvedValue({ reserved: true, count: 1, persistentRedis: true });
  quota.releaseDailyEmailSlot.mockResolvedValue(0);
  resendPost = jest.fn().mockRejectedValue({ response: { status: 429, data: { name: 'rate_limit_exceeded', message: 'rate limit exceeded' } } });
  brevoPost = jest.fn().mockResolvedValue({ status: 201, data: { messageId: 'offline-backup-acceptance' } });
  email.__setTransportsForTesting({ resendPost, brevoPost });
});
afterEach(() => {
  expect(axios.get).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
  email.__resetTransportsForTesting();
});
afterAll(() => {
  for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  jest.restoreAllMocks();
});
test('actual dispatch classifies mocked HTTP 429 and invokes Brevo once without asserting delivery', async () => {
  const result = await email.sendEmail(message);
  expect(resendPost).toHaveBeenCalledTimes(1);
  expect(brevoPost).toHaveBeenCalledTimes(1);
  expect(quota.reserveDailyEmailSlot).toHaveBeenCalledWith('brevo', 300);
  expect(quota.reserveDailyEmailSlot.mock.invocationCallOrder[0]).toBeLessThan(brevoPost.mock.invocationCallOrder[0]);
  const time='11/4/2026, 11:06:43 PM (Sri Lanka time, UTC+05:30)';
  const stampedHtml=message.html+`<p data-medisync-sent-at="Asia/Colombo" style="font-size:12px;color:#64748b;">Sent: ${time}</p>`;
  expect(brevoPost.mock.calls[0][1]).toMatchObject({ to: [{ email: address }], subject: message.subject, textContent: message.text+'\n\nSent: '+time, htmlContent: stampedHtml });
  expect(resendPost.mock.calls[0][1].html).toBe(stampedHtml);
  expect(brevoPost.mock.calls[0][1]).not.toHaveProperty('attachment');
  expect(result).toMatchObject({ provider: 'brevo', fallbackUsed: true, primaryErrorCode: 'daily_quota_exceeded', providerAccepted: true, deliveryQueued: false, deliveryConfirmed: false });
});
test('Resend acceptance with unconfirmed delivery never triggers Brevo', async () => {
  resendPost.mockResolvedValue({ status: 200, data: { id: 'offline-primary-acceptance' } });
  expect(await email.sendEmail(message)).toMatchObject({ provider: 'resend', providerAccepted: true, deliveryConfirmed: false, fallbackUsed: false });
  expect(brevoPost).not.toHaveBeenCalled();
  expect(quota.reserveDailyEmailSlot).not.toHaveBeenCalled();
});
test.each([400, 401, 403, 422])('ordinary HTTP %i rejection never invokes Brevo', async status => {
  resendPost.mockRejectedValue({ response: { status, data: { message: 'request rejected' } } });
  expect(await email.sendEmail(message)).toMatchObject({ providerAccepted: false, fallbackUsed: false });
  expect(brevoPost).not.toHaveBeenCalled();
});

test.each([
  [400, 'permanent_validation_failure'],
  [401, 'provider_auth_configuration_error'],
  [403, 'sender_domain_configuration_error'],
  [422, 'permanent_validation_failure']
])('HTTP %i cannot be overridden by misleading quota text or a rate-limit name', async (status, errorCode) => {
  resendPost.mockRejectedValue({ response: { status, data: { name: 'rate_limit_exceeded', message: 'quota exceeded; too many requests' } } });
  expect(await email.sendEmail(message)).toMatchObject({ errorCode, providerAccepted: false, fallbackUsed: false });
  expect(resendPost).toHaveBeenCalledTimes(1);
  expect(brevoPost).not.toHaveBeenCalled();
  expect(quota.reserveDailyEmailSlot).not.toHaveBeenCalled();
});

test.each([
  ['invalid_api_key', 'provider_auth_configuration_error'],
  ['restricted_api_key', 'provider_auth_configuration_error'],
  ['validation_error', 'permanent_validation_failure'],
  ['missing_required_field', 'permanent_validation_failure'],
  ['invalid_parameter', 'permanent_validation_failure'],
  ['invalid_to_address', 'permanent_validation_failure']
].flatMap(([name, errorCode]) => [429, undefined].map(status => [name, errorCode, status])))('permanent error name %s (%s; HTTP %s) takes precedence over quota text', async (name, errorCode, status) => {
  resendPost.mockRejectedValue({ response: { status, data: { name, message: 'quota exceeded; rate limit reached' } } });
  expect(await email.sendEmail(message)).toMatchObject({ errorCode, providerAccepted: false, fallbackUsed: false });
  expect(resendPost).toHaveBeenCalledTimes(1);
  expect(brevoPost).not.toHaveBeenCalled();
  expect(quota.reserveDailyEmailSlot).not.toHaveBeenCalled();
});
test('ambiguous Resend timeout never invokes Brevo', async () => {
  resendPost.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
  expect(await email.sendEmail(message)).toMatchObject({ errorCode: 'ambiguous_timeout', fallbackUsed: false });
  expect(brevoPost).not.toHaveBeenCalled();
});
test('allowFallback false blocks Brevo even for HTTP 429', async () => {
  expect(await email.sendEmail({ ...message, allowFallback: false })).toMatchObject({ errorCode: 'bulk_fallback_prohibited', fallbackUsed: false });
  expect(brevoPost).not.toHaveBeenCalled();
});
test('exhausted Brevo allowance stops before the backup request', async () => {
  quota.reserveDailyEmailSlot.mockResolvedValue({ reserved: false, count: 300, persistentRedis: true });
  expect(await email.sendEmail(message)).toMatchObject({ errorCode: 'brevo_daily_allowance_exhausted', providerAccepted: false });
  expect(brevoPost).not.toHaveBeenCalled();
});
test('Brevo rejection is not retried and releases its quota reservation', async () => {
  brevoPost.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_requests' } } });
  expect(await email.sendEmail(message)).toMatchObject({ providerAccepted: false, backupErrorCode: 'brevo_rate_limited' });
  expect(brevoPost).toHaveBeenCalledTimes(1);
  expect(quota.releaseDailyEmailSlot).toHaveBeenCalledTimes(1);
});
test('Brevo timeout is not retried and retains its uncertain quota reservation', async () => {
  brevoPost.mockRejectedValue({ code: 'ETIMEDOUT', message: 'timeout' });
  expect(await email.sendEmail(message)).toMatchObject({ providerAccepted: false, backupErrorCode: 'brevo_ambiguous_timeout', statusCode: 504 });
  expect(brevoPost).toHaveBeenCalledTimes(1);
  expect(quota.releaseDailyEmailSlot).not.toHaveBeenCalled();
});
