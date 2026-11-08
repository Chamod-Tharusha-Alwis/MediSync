'use strict';

// Dependency availability is a status resource, not a clinical-data assertion.
function categoryOf(error) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return 'timeout';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(error?.code)) return 'dns';
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error?.code)) return 'connection';
  return 'bad_response';
}

function safeStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 'none';
}

function failedStatusFields(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['response'];
  const fields = [];
  if (data.status !== 'active') fields.push('status');
  if (!Number.isSafeInteger(data.dataPoints) || data.dataPoints < 0) fields.push('dataPoints');
  if (data.dataPointUnit !== 'reference disease profiles') fields.push('dataPointUnit');
  if (data.clinicalValidation !== 'not established') fields.push('clinicalValidation');
  if (!['TF-IDF + Cosine Similarity', 'Intersection Fallback'].includes(data.models?.diseasePrediction)) fields.push('models.diseasePrediction');
  if (data.models?.outbreakForecasting !== 'unavailable') fields.push('models.outbreakForecasting');
  return fields;
}

function modelStatusUrl(baseUrl, { allowLoopbackHttp = (process.env.NODE_ENV !== 'production') } = {}) {
  const effective = baseUrl || (process.env.NODE_ENV === 'production' ? 'https://medisync-ml.onrender.com' : 'http://127.0.0.1:5001');
  if (typeof effective !== 'string' || !effective || effective !== effective.trim() || /[\s\\@?#]/.test(effective)) throw Error('INVALID_ML_CONFIGURATION');
  if (!/^[a-z][a-z\d+.-]*:\/\/[^/]+(?:\/+)?$/i.test(effective)) throw Error('INVALID_ML_CONFIGURATION');
  const url = new URL(effective);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!url.hostname || url.username || url.password || !/^\/+$/u.test(url.pathname) ||
      (loopback && !allowLoopbackHttp) ||
      (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:'))) throw Error('INVALID_ML_CONFIGURATION');
  // Use the parsed origin, never a raw concatenation that can create //model-status.
  return `${url.origin}/model-status`;
}

async function readAdminMlStatus({ get, token, baseUrl, allowLoopbackHttp = (process.env.NODE_ENV !== 'production'), log = console.warn }) {
  let stage = 'prepare';
  let dispatched = false;
  let responseSeen = false;
  let upstreamStatus = 'none';
  let failedFields = [];
  try {
    const effective = baseUrl || (process.env.NODE_ENV === 'production' ? 'https://medisync-ml.onrender.com' : 'http://127.0.0.1:5001');
    const isLoopback = ['localhost', '127.0.0.1'].some(h => effective.includes(h));
    const url = modelStatusUrl(effective, { allowLoopbackHttp: allowLoopbackHttp || (process.env.NODE_ENV !== 'production' && isLoopback) });
    if (typeof get !== 'function' || typeof token !== 'function') throw Error('INVALID_ML_CONFIGURATION');
    const key = token();
    if (typeof key !== 'string' || !key || key !== key.trim() || /[\r\n\0]/.test(key)) throw Error('INVALID_ML_CONFIGURATION');
    stage = 'request';
    dispatched = true;
    const pending = get(url, {
      timeout: 5000, maxRedirects: 0, maxContentLength: 65536,
      headers: { 'x-internal-key': key }
    }, {
      onDispatch: () => { dispatched = true; },
      onResponse: response => { responseSeen = true; upstreamStatus = safeStatus(response?.status); }
    });
    if (!pending || typeof pending.then !== 'function') throw Error('INVALID_ML_CONFIGURATION');
    const response = await pending;
    stage = 'response';
    upstreamStatus = safeStatus(response?.status);
    if (upstreamStatus !== 'none' && (upstreamStatus < 200 || upstreamStatus >= 300)) throw Error('UNEXPECTED_STATUS_RESPONSE');
    const data = response?.data;
    const model = data?.models?.diseasePrediction;
    failedFields = failedStatusFields(data);
    if (failedFields.length) throw Error('INVALID_STATUS_RESPONSE');
    return {
      status: 'available', available: true, availabilityState: 'available', dataPoints: data.dataPoints,
      dataPointUnit: 'reference disease profiles', modelType: model,
      models: data.models || { diseasePrediction: model, outbreakForecasting: 'unavailable' },
      clinicalValidation: 'not established', forecastAvailable: false, lastTrained: null, nextRun: null
    };
  } catch (error) {
    // Observe the adapter boundary: a response interceptor can throw a plain
    // error with no request/response attached even after a reply was received.
    // Dispatch is a local transport attempt, not proof of upstream receipt.
    const localOptionError = !responseSeen && !error?.response &&
      ['ERR_INVALID_URL', 'ERR_BAD_OPTION', 'ERR_BAD_OPTION_VALUE', 'ERR_NOT_SUPPORT', 'ERR_DEPRECATED'].includes(error?.code);
    const category = stage === 'prepare' ||
      (stage === 'request' && ((!dispatched && !responseSeen && !error?.request && !error?.response) || localOptionError)) ? 'config' : categoryOf(error);
    const errorStatus = safeStatus(error?.response?.status);
    if (errorStatus !== 'none') upstreamStatus = errorStatus;
    if (category === 'bad_response') {
      const reason = failedFields.length ? 'schema' :
        (upstreamStatus >= 300 && upstreamStatus < 400 || error?.code === 'ERR_FR_TOO_MANY_REDIRECTS') ? 'redirect' :
          upstreamStatus !== 'none' && (upstreamStatus < 200 || upstreamStatus >= 300) ? 'http_status' : 'other';
      // Only internal enums, bounded numeric status and fixed schema paths.
      // Never serialize an exception, URL, headers, response body or key.
      log(`[AdminMlStatus] category=bad_response reason=${reason} upstreamStatus=${upstreamStatus} failedFields=${failedFields.length ? failedFields.join(',') : 'none'}`);
    } else log(`[AdminMlStatus] category=${category}`);
    const isWaking = ['timeout', 'connection'].includes(category) || [502, 503, 504].includes(upstreamStatus);
    const availabilityState = isWaking ? 'waking' : (category === 'config' ? 'unconfigured' : 'down');
    return {
      status: isWaking ? 'waking' : 'unavailable',
      available: false,
      availabilityState,
      category,
      message: isWaking
        ? 'ML service is starting up (cold start can take 60-90s on free tier)'
        : (category === 'config' ? 'ML service URL is unconfigured' : 'ML service is currently unavailable'),
      dataPoints: null,
      dataPointUnit: 'reference disease profiles',
      modelType: null,
      models: {
        diseasePrediction: isWaking ? 'warming_up' : 'unavailable',
        outbreakForecasting: isWaking ? 'warming_up' : 'unavailable'
      },
      clinicalValidation: 'not established',
      forecastAvailable: false,
      lastTrained: null,
      nextRun: null
    };
  }
}

let statusCache = null;

function clearAdminMlStatusCache() {
  statusCache = null;
}

async function probeAdminMlStatusWithRetry({
  get, token, baseUrl, allowLoopbackHttp = false, log = console.warn,
  useCache = false, cacheTtlMs = 10000, maxRetries = 1, baseDelayMs = 150, ping = null
}) {
  const now = Date.now();
  if (useCache && statusCache && statusCache.expiresAt > now && statusCache.baseUrl === baseUrl) {
    return statusCache.data;
  }

  // Non-blocking warm-up ping to /health if ping helper is provided
  if (typeof ping === 'function') {
    try {
      const url = new URL(baseUrl);
      const healthUrl = `${url.origin}/health`;
      Promise.resolve(ping(healthUrl)).catch(() => {});
    } catch (_) {}
  }

  let result = await readAdminMlStatus({ get, token, baseUrl, allowLoopbackHttp, log });

  // Retry with backoff + jitter if upstream is in waking state
  if (!result.available && result.availabilityState === 'waking' && maxRetries > 0) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const jitter = Math.floor(Math.random() * 50);
      const delay = (baseDelayMs * Math.pow(2, attempt)) + jitter;
      await new Promise(resolve => setTimeout(resolve, delay));
      result = await readAdminMlStatus({ get, token, baseUrl, allowLoopbackHttp, log });
      if (result.available) break;
    }
  }

  if (useCache && result) {
    statusCache = {
      baseUrl,
      expiresAt: Date.now() + Math.max(1000, cacheTtlMs),
      data: result
    };
  }

  return result;
}

function createStatusGet(client, resolveAdapter = client?.getAdapter) {
  return (url, options, lifecycle) => client.get(url, {
    ...options,
    adapter: config => {
      const adapter = resolveAdapter(client.defaults.adapter);
      lifecycle.onDispatch();
      return Promise.resolve().then(() => adapter(config)).then(response => {
        lifecycle.onResponse(response);
        return response;
      });
    }
  });
}

module.exports = {
  readAdminMlStatus,
  probeAdminMlStatusWithRetry,
  clearAdminMlStatusCache,
  categoryOf,
  modelStatusUrl,
  createStatusGet,
  failedStatusFields
};
