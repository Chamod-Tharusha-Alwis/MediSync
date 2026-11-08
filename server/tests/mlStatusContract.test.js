'use strict';

const {
  readAdminMlStatus,
  probeAdminMlStatusWithRetry,
  clearAdminMlStatusCache,
  modelStatusUrl,
} = require('../src/services/adminMlStatusService');

describe('Task C — ML Status Resilience Contract Tests', () => {
  beforeEach(() => {
    clearAdminMlStatusCache();
    jest.restoreAllMocks();
  });

  const validUpPayload = {
    status: 'active',
    dataPoints: 120,
    dataPointUnit: 'reference disease profiles',
    clinicalValidation: 'not established',
    models: {
      diseasePrediction: 'TF-IDF + Cosine Similarity',
      outbreakForecasting: 'unavailable'
    }
  };

  test('1. ML state "up" (available): returns available=true with dataPoints count', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      status: 200,
      data: validUpPayload
    });

    const res = await readAdminMlStatus({
      get: mockGet,
      token: () => 'valid-internal-token-key',
      baseUrl: 'https://medisync-ml.onrender.com',
      log: () => {}
    });

    expect(res.available).toBe(true);
    expect(res.status).toBe('available');
    expect(res.availabilityState).toBe('available');
    expect(res.dataPoints).toBe(120);
    expect(res.dataPointUnit).toBe('reference disease profiles');
    expect(res.clinicalValidation).toBe('not established');
  });

  test('2. ML state "waking" on cold-start timeout (>5s ECONNABORTED): returns clean waking status', async () => {
    const timeoutErr = new Error('timeout of 5000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    const mockGet = jest.fn().mockRejectedValue(timeoutErr);

    const res = await readAdminMlStatus({
      get: mockGet,
      token: () => 'valid-internal-token-key',
      baseUrl: 'https://medisync-ml.onrender.com',
      log: () => {}
    });

    expect(res.available).toBe(false);
    expect(res.status).toBe('waking');
    expect(res.availabilityState).toBe('waking');
    expect(res.dataPoints).toBeNull();
    expect(res.models.diseasePrediction).toBe('warming_up');
    expect(res.message).toMatch(/starting up/i);
  });

  test('3. ML state "waking" on Render cold-start 502 / 503 / 504: returns waking status', async () => {
    for (const statusCode of [502, 503, 504]) {
      const httpErr = new Error(`HTTP ${statusCode}`);
      httpErr.response = { status: statusCode };
      const mockGet = jest.fn().mockRejectedValue(httpErr);

      const res = await readAdminMlStatus({
        get: mockGet,
        token: () => 'valid-internal-token-key',
        baseUrl: 'https://medisync-ml.onrender.com',
        log: () => {}
      });

      expect(res.available).toBe(false);
      expect(res.status).toBe('waking');
      expect(res.availabilityState).toBe('waking');
      expect(res.models.diseasePrediction).toBe('warming_up');
    }
  });

  test('4. ML state "waking" on connection reset / refused: returns waking status', async () => {
    const connErr = new Error('connect ECONNREFUSED 127.0.0.1:5001');
    connErr.code = 'ECONNREFUSED';
    const mockGet = jest.fn().mockRejectedValue(connErr);

    const res = await readAdminMlStatus({
      get: mockGet,
      token: () => 'valid-internal-token-key',
      baseUrl: 'https://medisync-ml.onrender.com',
      log: () => {}
    });

    expect(res.available).toBe(false);
    expect(res.status).toBe('waking');
    expect(res.availabilityState).toBe('waking');
  });

  test('5. ML state "down" on 404 Not Found: returns down, not waking', async () => {
    const err404 = new Error('Not Found');
    err404.response = { status: 404 };
    const mockGet = jest.fn().mockRejectedValue(err404);

    const res = await readAdminMlStatus({
      get: mockGet,
      token: () => 'valid-internal-token-key',
      baseUrl: 'https://medisync-ml.onrender.com',
      log: () => {}
    });

    expect(res.available).toBe(false);
    expect(res.status).toBe('unavailable');
    expect(res.availabilityState).toBe('down');
    expect(res.category).toBe('not_found');
  });

  test('6. Missing baseUrl defaults cleanly without throwing INVALID_ML_CONFIGURATION', () => {
    expect(() => modelStatusUrl()).not.toThrow();
    const defaultUrl = modelStatusUrl();
    expect(defaultUrl).toMatch(/\/model-status$/);
  });

  test('7. probeAdminMlStatusWithRetry dispatches non-blocking warm-up ping to /health', async () => {
    const pingMock = jest.fn().mockResolvedValue({ status: 200 });
    const mockGet = jest.fn().mockResolvedValue({
      status: 200,
      data: validUpPayload
    });

    const res = await probeAdminMlStatusWithRetry({
      get: mockGet,
      token: () => 'valid-internal-token-key',
      baseUrl: 'https://medisync-ml.onrender.com',
      ping: pingMock,
      maxRetries: 0
    });

    expect(res.available).toBe(true);
    expect(pingMock).toHaveBeenCalledWith('https://medisync-ml.onrender.com/health');
  });
});
