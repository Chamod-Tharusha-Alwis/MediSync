'use strict';

const { isColdStartError, inferencePredictions } = require('../src/utils/inferenceResponse');

describe('Feature C4: Doctor AI Cold-Start Resilience and Invariants', () => {
  describe('isColdStartError', () => {
    test('returns true for HTTP 503 Service Unavailable', () => {
      expect(isColdStartError({ response: { status: 503 } })).toBe(true);
    });

    test('returns true for HTTP 502 Bad Gateway', () => {
      expect(isColdStartError({ response: { status: 502 } })).toBe(true);
    });

    test('returns true for HTTP 504 Gateway Timeout', () => {
      expect(isColdStartError({ response: { status: 504 } })).toBe(true);
    });

    test('returns true for network timeout error codes ECONNABORTED and ERR_NETWORK', () => {
      expect(isColdStartError({ code: 'ECONNABORTED' })).toBe(true);
      expect(isColdStartError({ code: 'ERR_NETWORK' })).toBe(true);
    });

    test('returns true when response body indicates waking_up availability', () => {
      expect(isColdStartError({ response: { status: 200, data: { availability: 'waking_up' } } })).toBe(true);
      expect(isColdStartError({ response: { status: 503, data: { error: 'Service waking up' } } })).toBe(true);
    });

    test('returns true when error message mentions timeout or network error', () => {
      expect(isColdStartError(new Error('timeout of 60000ms exceeded'))).toBe(true);
      expect(isColdStartError(new Error('Network Error occurred'))).toBe(true);
    });

    test('returns false for non-cold-start HTTP errors (400, 401, 403, 404, 422, 500)', () => {
      [400, 401, 403, 404, 422, 500].forEach((status) => {
        expect(isColdStartError({ response: { status } })).toBe(false);
      });
    });

    test('returns false for generic errors and falsy inputs', () => {
      expect(isColdStartError(null)).toBe(false);
      expect(isColdStartError(undefined)).toBe(false);
      expect(isColdStartError({})).toBe(false);
      expect(isColdStartError(new Error('Validation failed'))).toBe(false);
    });
  });

  describe('inferencePredictions', () => {
    test('valid predictions array is sanitized and returned', () => {
      const payload = {
        availability: 'available',
        predictions: [
          {
            disease: 'Dengue Fever',
            confidence: 85,
            icd_code: 'A90',
            recommendedSpecialist: 'Infectious Disease',
            urgent: true,
            extraUnwantedField: 'leak'
          }
        ]
      };
      const res = inferencePredictions(payload);
      expect(res).toEqual([
        {
          disease: 'Dengue Fever',
          confidence: 85,
          icd_code: 'A90',
          recommendedSpecialist: 'Infectious Disease',
          urgent: true
        }
      ]);
      expect(res[0].extraUnwantedField).toBeUndefined();
    });

    test('throws for unavailable or malformed payload', () => {
      expect(() => inferencePredictions(null)).toThrow('Unavailable inference');
      expect(() => inferencePredictions({ availability: 'unavailable' })).toThrow('Unavailable inference');
      expect(() => inferencePredictions({ predictions: 'not-an-array' })).toThrow('Unavailable inference');
      expect(() => inferencePredictions({ fallback: true, predictions: [] })).toThrow('Unavailable inference');
    });

    test('throws for invalid confidence score bounds (<0 or >100)', () => {
      expect(() =>
        inferencePredictions({
          predictions: [{ disease: 'Flu', confidence: -5 }]
        })
      ).toThrow('Invalid inference response');

      expect(() =>
        inferencePredictions({
          predictions: [{ disease: 'Flu', confidence: 105 }]
        })
      ).toThrow('Invalid inference response');
    });
  });
});
