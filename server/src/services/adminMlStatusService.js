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

function modelStatusUrl(baseUrl, { allowLoopbackHttp = false } = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl || baseUrl !== baseUrl.trim() || /[\s\\@?#]/.test(baseUrl)) throw Error('INVALID_ML_CONFIGURATION');
  if (!/^[a-z][a-z\d+.-]*:\/\/[^/]+(?:\/+)?$/i.test(baseUrl)) throw Error('INVALID_ML_CONFIGURATION');
  const url = new URL(baseUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!url.hostname || url.username || url.password || !/^\/+$/u.test(url.pathname) ||
      (loopback && !allowLoopbackHttp) ||
      (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback && url.protocol === 'http:'))) throw Error('INVALID_ML_CONFIGURATION');
  // Use the parsed origin, never a raw concatenation that can create //model-status.
  return `${url.origin}/model-status`;
}

async function readAdminMlStatus({ get, token, baseUrl, allowLoopbackHttp = false, log = console.warn }) {
  let stage = 'prepare';
  let dispatched = false;
  let responseSeen = false;
  let upstreamStatus = 'none';
  let failedFields = [];
  try {
    const url = modelStatusUrl(baseUrl, { allowLoopbackHttp });
    if (typeof get !== 'function' || typeof token !== 'function') throw Error('INVALID_ML_CONFIGURATION');
    const key = token();
    if (typeof key !== 'string' || !key || key !== key.trim() || /[\r\n\0]/.test(key)) throw Error('INVALID_ML_CONFIGURATION');
    const pending = get(url, {
      timeout: 10000, maxRedirects: 0, maxContentLength: 65536,
      headers: { 'x-internal-key': key }
    }, {
      onDispatch: () => { dispatched = true; },
      onResponse: response => { responseSeen = true; upstreamStatus = safeStatus(response?.status); }
    });
    if (!pending || typeof pending.then !== 'function') throw Error('INVALID_ML_CONFIGURATION');
    stage = 'request';
    const response = await pending;
    stage = 'response';
    upstreamStatus = safeStatus(response?.status);
    if (upstreamStatus !== 'none' && (upstreamStatus < 200 || upstreamStatus >= 300)) throw Error('UNEXPECTED_STATUS_RESPONSE');
    const data = response?.data;
    const model = data?.models?.diseasePrediction;
    failedFields = failedStatusFields(data);
    if (failedFields.length) throw Error('INVALID_STATUS_RESPONSE');
    return { status: 'available', available: true, dataPoints: data.dataPoints,
      dataPointUnit: 'reference disease profiles', modelType: model,
      clinicalValidation: 'not established', forecastAvailable: false, lastTrained: null, nextRun: null };
  } catch (error) {
    // Observe the adapter boundary: a response interceptor can throw a plain
    // error with no request/response attached even after a reply was received.
    // Dispatch is a local transport attempt, not proof of upstream receipt.
    const localOptionError = !responseSeen && !error?.response &&
      ['ERR_INVALID_URL', 'ERR_BAD_OPTION', 'ERR_BAD_OPTION_VALUE', 'ERR_NOT_SUPPORT', 'ERR_DEPRECATED'].includes(error?.code);
    const category = stage === 'prepare' ||
      (stage === 'request' && ((!dispatched && !responseSeen && !error?.request && !error?.response) || localOptionError)) ? 'config' : categoryOf(error);
    if (category === 'bad_response') {
      const errorStatus = safeStatus(error?.response?.status);
      if (errorStatus !== 'none') upstreamStatus = errorStatus;
      const reason = failedFields.length ? 'schema' :
        (upstreamStatus >= 300 && upstreamStatus < 400 || error?.code === 'ERR_FR_TOO_MANY_REDIRECTS') ? 'redirect' :
          upstreamStatus !== 'none' && (upstreamStatus < 200 || upstreamStatus >= 300) ? 'http_status' : 'other';
      // Only internal enums, bounded numeric status and fixed schema paths.
      // Never serialize an exception, URL, headers, response body or key.
      log(`[AdminMlStatus] category=bad_response reason=${reason} upstreamStatus=${upstreamStatus} failedFields=${failedFields.length ? failedFields.join(',') : 'none'}`);
    } else log(`[AdminMlStatus] category=${category}`);
    return { status: 'unavailable', available: false, category, dataPoints: null,
      dataPointUnit: 'reference disease profiles', modelType: null,
      clinicalValidation: 'not established', forecastAvailable: false, lastTrained: null, nextRun: null };
  }
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

module.exports = { readAdminMlStatus, categoryOf, modelStatusUrl, createStatusGet, failedStatusFields };
