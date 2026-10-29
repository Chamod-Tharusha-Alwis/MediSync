'use strict';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const axios = require('axios');

const {
  predictDiseaseResilient,
  checkMlHealth,
  isRetryableError,
  getMlEngineUrl,
  sanitizeErrorMessage,
  DEFAULT_TIMEOUT_MS,
} = require('../src/services/mlPredictionService');
const mlPredictionController = require('../src/controllers/mlPredictionController');

jest.mock('axios');

// Mock auth middleware for isolated doctor endpoint testing
const mockProtect = (roles) => (req, res, next) => {
  req.user = { id: 'synthetic-doctor-id', role: 'doctor' };
  next();
};

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const router = express.Router();
  router.post('/predict-disease', mockProtect(['doctor']), mlPredictionController.predictDisease);
  router.get('/predict-disease/health', mockProtect(['doctor']), mlPredictionController.getHealth);
  app.use('/api/doctor', router);
  return app;
}

describe('Phase 1: ML Prediction Cold-Start Resilience & Express API Suite', () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      INTERNAL_API_KEY: 'test-internal-secret-key-32-chars-long!',
      ML_ENGINE_URL: 'http://127.0.0.1:5001/',
    };
    app = buildTestApp();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('mlPredictionService Unit Tests', () => {
    test('1. Successful inference on first attempt uses 90s timeout and attaches HMAC header', async () => {
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          predictions: [
            { disease: 'Dengue', confidence: 85, icd_code: '1D20', recommendedSpecialist: 'General Physician', urgent: false },
          ],
        },
      });

      const result = await predictDiseaseResilient(['fever', 'joint pain'], { timeoutMs: 90000, retryDelayMs: 0 });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data.availability).toBe('available');
      expect(result.data.predictions).toHaveLength(1);
      expect(result.data.predictions[0].disease).toBe('Dengue');

      expect(axios.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = axios.post.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:5001/api/ml/predict-disease');
      expect(config.timeout).toBe(90000);
      expect(config.headers['x-internal-key']).toBeDefined();
      expect(body.symptoms).toEqual(['fever', 'joint pain']);
    });

    test('2. Cold start 502 Bad Gateway triggers bounded single retry and recovers', async () => {
      axios.post
        .mockRejectedValueOnce({ response: { status: 502 } })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            predictions: [{ disease: 'Influenza', confidence: 75, icd_code: '1E30' }],
          },
        });

      const result = await predictDiseaseResilient(['cough', 'fever'], { retryDelayMs: 0 });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data.availability).toBe('available');
      expect(result.data.predictions[0].disease).toBe('Influenza');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    test('3. Cold start timeout (ECONNABORTED) triggers bounded single retry and recovers', async () => {
      const timeoutErr = new Error('timeout of 90000ms exceeded');
      timeoutErr.code = 'ECONNABORTED';

      axios.post
        .mockRejectedValueOnce(timeoutErr)
        .mockResolvedValueOnce({
          status: 200,
          data: {
            predictions: [{ disease: 'Migraine', confidence: 60 }],
          },
        });

      const result = await predictDiseaseResilient(['headache'], { retryDelayMs: 0 });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data.predictions[0].disease).toBe('Migraine');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    test('4. Persistent cold start failing both attempts returns structured 503 with waking_up', async () => {
      axios.post.mockRejectedValue({ response: { status: 503 } });

      const result = await predictDiseaseResilient(['rash'], { retryDelayMs: 0 });
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.data.availability).toBe('waking_up');
      expect(result.data.predictions).toEqual([]);
      expect(result.data.error).toContain('waking up');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    test('5. Non-retryable client error (400 Bad Request) fails immediately with no second attempt', async () => {
      axios.post.mockRejectedValueOnce({ response: { status: 400 } });

      const result = await predictDiseaseResilient([], { retryDelayMs: 0 });
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('6. Non-retryable auth error (403 Forbidden) fails immediately with no second attempt', async () => {
      axios.post.mockRejectedValueOnce({ response: { status: 403 } });

      const result = await predictDiseaseResilient(['fever'], { retryDelayMs: 0 });
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('7. ML health check returns ready when available', async () => {
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ready', references: { files: 7 } },
      });

      const health = await checkMlHealth({ timeoutMs: 5000 });
      expect(health.availability).toBe('available');
      expect(health.status).toBe('ready');
      expect(health.references.files).toBe(7);
      expect(axios.get).toHaveBeenCalledWith('http://127.0.0.1:5001/health', { timeout: 5000 });
    });

    test('8. ML health check returns waking_up when sleeping / timing out', async () => {
      axios.get.mockRejectedValueOnce({ response: { status: 502 } });

      const health = await checkMlHealth({ timeoutMs: 5000 });
      expect(health.availability).toBe('waking_up');
      expect(health.status).toBe('waking_up');
      expect(health.error).toContain('waking up');
    });

    test('9. Sanitizes URLs with trailing slashes to prevent double slashes', () => {
      process.env.ML_ENGINE_URL = 'https://medisync-ml.onrender.com///';
      expect(getMlEngineUrl()).toBe('https://medisync-ml.onrender.com');
    });

    test('10. Error sanitization ensures zero leaked IPs, ports, tokens, or stacks', () => {
      const errorWithSecrets = new Error('connect ECONNREFUSED 127.0.0.1:5001 with key SECRET_API_KEY_123');
      errorWithSecrets.code = 'ECONNREFUSED';

      const sanitizedCold = sanitizeErrorMessage(errorWithSecrets, true);
      expect(sanitizedCold).not.toContain('127.0.0.1');
      expect(sanitizedCold).not.toContain('5001');
      expect(sanitizedCold).not.toContain('SECRET_API_KEY');

      const sanitizedNormal = sanitizeErrorMessage(errorWithSecrets, false);
      expect(sanitizedNormal).not.toContain('127.0.0.1');
      expect(sanitizedNormal).not.toContain('5001');
      expect(sanitizedNormal).not.toContain('SECRET_API_KEY');
    });
  });

  describe('HTTP Integration Endpoints', () => {
    test('11. POST /api/doctor/predict-disease returns 200 with predictions', async () => {
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          predictions: [
            { disease: 'Dengue', confidence: 82.5, icd_code: 'A90', recommendedSpecialist: 'Infectious Disease', urgent: false },
          ],
        },
      });

      const res = await request(app)
        .post('/api/doctor/predict-disease')
        .send({ symptoms: ['fever', 'headache'] });

      expect(res.status).toBe(200);
      expect(res.body.availability).toBe('available');
      expect(res.body.predictions).toHaveLength(1);
      expect(res.body.predictions[0].disease).toBe('Dengue');
    });

    test('12. POST /api/doctor/predict-disease with missing/empty symptoms returns 400', async () => {
      const res = await request(app)
        .post('/api/doctor/predict-disease')
        .send({ symptoms: [] });

      expect(res.status).toBe(400);
      expect(res.body.availability).toBe('unavailable');
      expect(res.body.error).toContain('Invalid symptoms payload');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('13. POST /api/doctor/predict-disease cold start returns 503 waking_up with sanitized error', async () => {
      process.env.ML_RETRY_DELAY_MS = '0';
      axios.post.mockRejectedValue({ response: { status: 503 } });

      const res = await request(app)
        .post('/api/doctor/predict-disease')
        .send({ symptoms: ['fever'] });

      expect(res.status).toBe(503);
      expect(res.body.availability).toBe('waking_up');
      expect(res.body.error).toContain('Analysis service is waking up');
      expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
    });

    test('14. GET /api/doctor/predict-disease/health returns 200 ready when online', async () => {
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ready', references: { files: 7, icd10Concepts: 71704 } },
      });

      const res = await request(app)
        .get('/api/doctor/predict-disease/health');

      expect(res.status).toBe(200);
      expect(res.body.availability).toBe('available');
      expect(res.body.status).toBe('ready');
      expect(res.body.references.files).toBe(7);
    });

    test('15. GET /api/doctor/predict-disease/health returns 503 waking_up when sleeping', async () => {
      axios.get.mockRejectedValueOnce({ response: { status: 503 } });

      const res = await request(app)
        .get('/api/doctor/predict-disease/health');

      expect(res.status).toBe(503);
      expect(res.body.availability).toBe('waking_up');
      expect(res.body.status).toBe('waking_up');
    });
  });
});
