'use strict';
// The existing ML endpoint emits a percentage-valued similarity score, not calibrated probability.
function inferencePredictions(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.predictions) ||
      payload.fallback === true || (payload.availability !== undefined && payload.availability !== 'available')) throw new Error('Unavailable inference');
  return payload.predictions.map(row => {
    if (!row || typeof row !== 'object' || typeof row.disease !== 'string' || !row.disease.trim() ||
        typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 100 ||
        (row.icd_code !== undefined && typeof row.icd_code !== 'string') ||
        (row.recommendedSpecialist !== undefined && typeof row.recommendedSpecialist !== 'string') ||
        (row.urgent !== undefined && typeof row.urgent !== 'boolean')) throw new Error('Invalid inference response');
    // Return only the established fields used by the clinician's suggestion display.
    return Object.fromEntries(['disease','confidence','icd_code','recommendedSpecialist','urgent'].filter(key => row[key] !== undefined).map(key => [key,row[key]]));
  });
}
module.exports={inferencePredictions};
