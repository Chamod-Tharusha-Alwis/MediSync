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

async function readAdminMlStatus({ get, token, baseUrl, log = console.warn }) {
  let category;
  try {
    let key;
    try { key = token(); } catch (_) { category = 'auth'; throw Error('STATUS_UNAVAILABLE'); }
    const response = await get(`${baseUrl}/model-status`, {
      timeout: 10000, maxRedirects: 0, maxContentLength: 65536,
      headers: { 'x-internal-key': key }
    });
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
    category = category || categoryOf(error);
    log(`[AdminMlStatus] category=${category}`);
    return { status: 'unavailable', available: false, category, dataPoints: null,
      dataPointUnit: 'reference disease profiles', modelType: null,
      clinicalValidation: 'not established', forecastAvailable: false, lastTrained: null, nextRun: null };
  }
}

module.exports = { readAdminMlStatus, categoryOf };
