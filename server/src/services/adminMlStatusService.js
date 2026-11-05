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
      onResponse: () => { responseSeen = true; }
    });
    if (!pending || typeof pending.then !== 'function') throw Error('INVALID_ML_CONFIGURATION');
    stage = 'request';
    const response = await pending;
    stage = 'response';
    const data = response?.data;
    const model = data?.models?.diseasePrediction;
    if (!data || data.status !== 'active' || !Number.isSafeInteger(data.dataPoints) || data.dataPoints < 0 ||
        data.dataPointUnit !== 'reference disease profiles' || data.clinicalValidation !== 'not established' ||
        !['TF-IDF + Cosine Similarity', 'Intersection Fallback'].includes(model) ||
        data.models.outbreakForecasting !== 'unavailable') throw Error('INVALID_STATUS_RESPONSE');
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
    log(`[AdminMlStatus] category=${category}`);
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
        lifecycle.onResponse();
        return response;
      });
    }
  });
}

module.exports = { readAdminMlStatus, categoryOf, modelStatusUrl, createStatusGet };
