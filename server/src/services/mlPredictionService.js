'use strict';

const axios = require('axios');
const { generateToken } = require('../utils/internalAuth');
const { inferencePredictions } = require('../utils/inferenceResponse');

const DEFAULT_TIMEOUT_MS = 90000; // 90s extended cold-start timeout for Render free tier
const DEFAULT_RETRY_DELAY_MS = 1500; // 1.5s delay before single retry

function getMlEngineUrl() {
  const raw = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';
  return String(raw).trim().replace(/\/+$/, '');
}

function isRetryableError(error) {
  if (!error) return false;
  const retryableCodes = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'ERR_NETWORK'];
  if (error.code && retryableCodes.includes(error.code)) return true;

  const status = error.response?.status;
  if ([502, 503, 504].includes(status)) return true;

  const message = String(error.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('network error') || message.includes('socket hang up');
}

function sanitizeErrorMessage(error, isColdStart = false) {
  if (isColdStart) {
    return 'Analysis service is waking up. Please retry shortly or use manual diagnosis.';
  }
  return 'AI suggestions unavailable. Please use the existing manual diagnosis option.';
}

/**
 * Predicts disease with cold-start resilience:
 * - 90s timeout (ML_ENGINE_TIMEOUT_MS or 90000)
 * - Bounded single retry on 502/503/timeout
 * - Structured availability status
 * - Sanitized responses (zero internal secrets or IP exposure)
 */
async function predictDiseaseResilient(symptoms, options = {}) {
  const timeoutMs = options.timeoutMs || parseInt(process.env.ML_ENGINE_TIMEOUT_MS || process.env.ML_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs !== undefined ? options.retryDelayMs : (parseInt(process.env.ML_RETRY_DELAY_MS, 10) || DEFAULT_RETRY_DELAY_MS);
  const mlUrl = getMlEngineUrl();

  const makeAttempt = async () => {
    const token = generateToken();
    return axios.post(
      `${mlUrl}/api/ml/predict-disease`,
      { symptoms },
      {
        headers: { 'x-internal-key': token },
        timeout: timeoutMs,
      }
    );
  };

  let firstError = null;
  try {
    const mlRes = await makeAttempt();
    const predictions = inferencePredictions(mlRes.data);
    return {
      success: true,
      statusCode: 200,
      data: {
        availability: 'available',
        predictions,
      },
    };
  } catch (err) {
    firstError = err;
  }

  // Bounded single retry if error is retryable (cold start / transient)
  if (isRetryableError(firstError)) {
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    try {
      const mlRes = await makeAttempt();
      const predictions = inferencePredictions(mlRes.data);
      return {
        success: true,
        statusCode: 200,
        data: {
          availability: 'available',
          predictions,
        },
      };
    } catch (secondError) {
      const isWakingUp = isRetryableError(secondError);
      return {
        success: false,
        statusCode: 503,
        data: {
          availability: isWakingUp ? 'waking_up' : 'unavailable',
          predictions: [],
          error: sanitizeErrorMessage(secondError, isWakingUp),
        },
      };
    }
  }

  // Non-retryable error (e.g. 400 Bad Request, 401/403 Auth failure)
  const isWakingUp = isRetryableError(firstError);
  return {
    success: false,
    statusCode: firstError.response?.status && firstError.response.status < 500 ? firstError.response.status : 503,
    data: {
      availability: isWakingUp ? 'waking_up' : 'unavailable',
      predictions: [],
      error: sanitizeErrorMessage(firstError, isWakingUp),
    },
  };
}

/**
 * Safe, cost-free ML service health probe / warm-up check.
 */
async function checkMlHealth(options = {}) {
  const timeoutMs = options.timeoutMs || parseInt(process.env.ML_HEALTH_TIMEOUT_MS, 10) || 10000;
  const mlUrl = getMlEngineUrl();

  try {
    const res = await axios.get(`${mlUrl}/health`, { timeout: timeoutMs });
    if (res.status === 200 && res.data?.status === 'ready') {
      return {
        availability: 'available',
        status: 'ready',
        references: res.data.references || {},
      };
    }
    return {
      availability: 'unavailable',
      status: 'unavailable',
      error: 'Reference data unavailable',
    };
  } catch (err) {
    const isWakingUp = isRetryableError(err);
    return {
      availability: isWakingUp ? 'waking_up' : 'unavailable',
      status: isWakingUp ? 'waking_up' : 'unavailable',
      error: isWakingUp ? 'Analysis service is waking up.' : 'Reference data unavailable',
    };
  }
}

module.exports = {
  predictDiseaseResilient,
  checkMlHealth,
  isRetryableError,
  getMlEngineUrl,
  sanitizeErrorMessage,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRY_DELAY_MS,
};
