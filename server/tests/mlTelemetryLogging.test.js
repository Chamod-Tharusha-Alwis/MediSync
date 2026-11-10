'use strict';

const axios = require('axios');
const { predictDiseaseResilient } = require('../src/services/mlPredictionService');
const { inferencePredictions } = require('../src/utils/inferenceResponse');

jest.mock('axios');

describe('ML Telemetry, Logging and Proof of Use (Task R2)', () => {
  let logSpy;

  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'test_key_for_telemetry_unit_tests';
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('successful prediction emits structured stdout log with latency, tier, source, and zero PII', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        availability: 'available',
        tier: 1,
        predictions: [
          {
            disease: 'Common Cold',
            confidence: 85,
            icd_code: 'J00',
            recommendedSpecialist: 'General Physician',
            urgent: false,
            source: 'curated',
            clinicalValidation: 'not_established',
            tier: 1,
          },
        ],
      },
    });

    const result = await predictDiseaseResilient(['cough', 'sneezing']);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data.source).toBe('ml-engine');
    expect(result.data.tier).toBe(1);
    expect(typeof result.data.latencyMs).toBe('number');
    expect(result.data.predictions[0].tier).toBe(1);

    // Verify structured log line emitted to stdout
    const mlLog = logSpy.mock.calls.find(([msg]) => typeof msg === 'string' && msg.startsWith('[ML] predict_disease'));
    expect(mlLog).toBeDefined();
    expect(mlLog[0]).toMatch(/\[ML\] predict_disease status=200 latency_ms=\d+ tier=1 source=ml-engine/);

    // Assert zero symptom text in log
    expect(mlLog[0]).not.toContain('cough');
    expect(mlLog[0]).not.toContain('sneezing');
  });

  test('failure emits structured stdout log with source=fallback and returns fallback source', async () => {
    axios.post.mockRejectedValue(new Error('Connection refused'));

    const result = await predictDiseaseResilient(['fever'], { retryDelayMs: 0 });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.data.source).toBe('fallback');
    expect(result.data.predictions).toEqual([]);

    const mlLog = logSpy.mock.calls.find(([msg]) => typeof msg === 'string' && msg.startsWith('[ML] predict_disease'));
    expect(mlLog).toBeDefined();
    expect(mlLog[0]).toMatch(/\[ML\] predict_disease status=503 latency_ms=\d+ tier=none source=fallback/);
    expect(mlLog[0]).not.toContain('fever');
  });

  test('inferencePredictions preserves tier without modification', () => {
    const raw = {
      availability: 'available',
      predictions: [
        {
          disease: 'Typhoid',
          confidence: 72.5,
          icd_code: 'A01.0',
          recommendedSpecialist: 'Infectious Disease Specialist',
          urgent: false,
          source: 'curated',
          clinicalValidation: 'not_established',
          tier: 1,
        },
      ],
    };
    const parsed = inferencePredictions(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].tier).toBe(1);
  });
});
