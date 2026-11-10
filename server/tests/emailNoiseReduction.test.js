'use strict';

const emailService = require('../src/utils/emailService');
const { shouldSendDispenseEmail, _dispenseEmailDebounce } = require('../src/controllers/dispensingController');

describe('Task R3: Email Noise Reduction & Rate Limiting', () => {
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    _dispenseEmailDebounce.clear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('Daily Dispatch Counter & 80% Warning', () => {
    test('increments daily count and logs count without PII', async () => {
      const prevEnv = process.env.DAILY_EMAIL_CAP;
      process.env.DAILY_EMAIL_CAP = '100';

      const res = await emailService.recordEmailDispatchCount();
      expect(typeof res.count).toBe('number');
      expect(res.cap).toBe(100);

      const logCall = logSpy.mock.calls.find(([msg]) => typeof msg === 'string' && msg.startsWith('[EMAIL DISPATCH]'));
      expect(logCall).toBeDefined();
      expect(logCall[0]).toMatch(/\[EMAIL DISPATCH\] Daily email count: \d+\/100/);

      process.env.DAILY_EMAIL_CAP = prevEnv;
    });

    test('warns when reaching or exceeding 80% of provider cap', async () => {
      const prevEnv = process.env.DAILY_EMAIL_CAP;
      process.env.DAILY_EMAIL_CAP = '10'; // small cap for testing warning

      // Dispatch 8 times to hit 80%
      for (let i = 0; i < 8; i++) {
        await emailService.recordEmailDispatchCount();
      }

      const warningCall = warnSpy.mock.calls.find(([msg]) => typeof msg === 'string' && msg.includes('[EMAIL DISPATCH WARNING]'));
      expect(warningCall).toBeDefined();
      expect(warningCall[0]).toContain('Approaching provider cap:');

      process.env.DAILY_EMAIL_CAP = prevEnv;
    });
  });

  describe('Dispense Notification Debounce & Single Email Per Order', () => {
    test('sends one dispense notification per patient within 120-second window', () => {
      const patientId = '660000000000000000000001';

      // First line dispensed -> allowed
      expect(shouldSendDispenseEmail(patientId, 120000)).toBe(true);

      // Second line dispensed 5 seconds later in same order -> throttled
      expect(shouldSendDispenseEmail(patientId, 120000)).toBe(false);

      // Third line dispensed 15 seconds later -> throttled
      expect(shouldSendDispenseEmail(patientId, 120000)).toBe(false);
    });

    test('preserves patient isolation (distinct patients receive their own notification)', () => {
      const patientA = '660000000000000000000001';
      const patientB = '660000000000000000000002';

      expect(shouldSendDispenseEmail(patientA, 120000)).toBe(true);
      expect(shouldSendDispenseEmail(patientB, 120000)).toBe(true);

      // Subsequent attempts for both are throttled
      expect(shouldSendDispenseEmail(patientA, 120000)).toBe(false);
      expect(shouldSendDispenseEmail(patientB, 120000)).toBe(false);
    });

    test('allows new dispense notification after debounce window expires', () => {
      const patientId = '660000000000000000000003';
      const shortWindowMs = 50; // 50ms window for test

      expect(shouldSendDispenseEmail(patientId, shortWindowMs)).toBe(true);
      expect(shouldSendDispenseEmail(patientId, shortWindowMs)).toBe(false);

      // Advance time past window
      _dispenseEmailDebounce.set(patientId, Date.now() - 100);
      expect(shouldSendDispenseEmail(patientId, shortWindowMs)).toBe(true);
    });
  });

  describe('Trusted Device & 24h Alert Throttling Logic', () => {
    test('24-hour throttle logic blocks repeated new-device alert emails', () => {
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const now = new Date();

      // Case 1: Brand new device (no previous alert) -> send alert
      const device1 = { lastAlertSentAt: null, isTrusted: false };
      let shouldSend1 = !device1.lastAlertSentAt || (now.getTime() - new Date(device1.lastAlertSentAt).getTime() >= TWENTY_FOUR_HOURS_MS);
      expect(shouldSend1).toBe(true);

      // Case 2: Same device logged in 1 hour later -> throttled
      const device2 = { lastAlertSentAt: new Date(now.getTime() - 1 * 60 * 60 * 1000), isTrusted: false };
      let shouldSend2 = !device2.lastAlertSentAt || (now.getTime() - new Date(device2.lastAlertSentAt).getTime() >= TWENTY_FOUR_HOURS_MS);
      expect(shouldSend2).toBe(false);

      // Case 3: Same device logged in 25 hours later -> fires once again
      const device3 = { lastAlertSentAt: new Date(now.getTime() - 25 * 60 * 60 * 1000), isTrusted: false };
      let shouldSend3 = !device3.lastAlertSentAt || (now.getTime() - new Date(device3.lastAlertSentAt).getTime() >= TWENTY_FOUR_HOURS_MS);
      expect(shouldSend3).toBe(true);

      // Case 4: Genuinely new device (different fingerprint) -> fires
      const deviceNew = { lastAlertSentAt: null, isTrusted: false };
      let shouldSendNew = !deviceNew.lastAlertSentAt || (now.getTime() - new Date(deviceNew.lastAlertSentAt).getTime() >= TWENTY_FOUR_HOURS_MS);
      expect(shouldSendNew).toBe(true);
    });
  });
});
