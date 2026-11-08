// Validate the existing ML percentage-valued similarity contract before display. Never coerce/clamp.
export function inferencePredictions(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.predictions) ||
      payload.fallback === true || (payload.availability !== undefined && payload.availability !== 'available')) throw new Error('Unavailable inference');
  return payload.predictions.map(row => {
    if (!row || typeof row !== 'object' || typeof row.disease !== 'string' || !row.disease.trim() ||
        typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 100 ||
        (row.icd_code !== undefined && typeof row.icd_code !== 'string') ||
        (row.recommendedSpecialist !== undefined && typeof row.recommendedSpecialist !== 'string') ||
        (row.urgent !== undefined && typeof row.urgent !== 'boolean') ||
        (row.source !== undefined && typeof row.source !== 'string') ||
        (row.clinicalValidation !== undefined && typeof row.clinicalValidation !== 'string')) throw new Error('Invalid inference response');
    // Return established fields used by the clinician's suggestion display.
    return Object.fromEntries(['disease','confidence','icd_code','recommendedSpecialist','urgent','source','clinicalValidation'].filter(key => row[key] !== undefined).map(key => [key,row[key]]));
  });
}

export function isColdStartError(err) {
  const status = err?.response?.status;
  const code = err?.code;
  const msg = String(err?.message || '');
  const dataErr = String(err?.response?.data?.error || '');
  const availability = err?.response?.data?.availability;
  return (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK' ||
    availability === 'waking_up' ||
    dataErr.toLowerCase().includes('waking') ||
    msg.toLowerCase().includes('timeout') ||
    msg.toLowerCase().includes('network error')
  );
}
